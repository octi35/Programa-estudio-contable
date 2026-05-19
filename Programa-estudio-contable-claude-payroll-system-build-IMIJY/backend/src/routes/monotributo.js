const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { getCategoriasVigentes, determinarCategoriaPara } = require('../lib/monotributoCategorias');

// GET /api/monotributo/categorias?fecha=YYYY-MM-DD
// Devuelve las categorías vigentes del estudio (o fallback hardcodeado si no hay configuradas).
router.get('/categorias', auth, async (req, res, next) => {
  try {
    const fecha = req.query.fecha ? new Date(req.query.fecha) : new Date();
    const cats = await getCategoriasVigentes(req.usuario.estudioId, fecha);
    res.json(cats);
  } catch (err) { next(err); }
});

// GET /api/monotributo/categorias/historial — todas las filas del estudio (todas las vigencias)
router.get('/categorias/historial', auth, async (req, res, next) => {
  try {
    const rows = await prisma.monotributoCategoria.findMany({
      where: { estudioId: req.usuario.estudioId },
      orderBy: [{ vigenciaDesde: 'desc' }, { categoria: 'asc' }],
    });
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/monotributo/categorias — alta de una fila (categoria+vigenciaDesde única)
router.post('/categorias', auth, [
  body('categoria').isString().notEmpty(),
  body('vigenciaDesde').isISO8601(),
  body('limiteIngresos').isFloat({ min: 0 }),
  body('cuotaImpuesto').isFloat({ min: 0 }),
  body('cuotaObraSocial').isFloat({ min: 0 }),
  body('cuotaJubilacion').isFloat({ min: 0 }),
  body('total').isFloat({ min: 0 }),
  validate,
], async (req, res, next) => {
  try {
    const data = { ...req.body, estudioId: req.usuario.estudioId, vigenciaDesde: new Date(req.body.vigenciaDesde) };
    const row = await prisma.monotributoCategoria.create({ data });
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe esa categoría para esa vigencia' });
    next(err);
  }
});

// POST /api/monotributo/categorias/bulk — alta masiva de toda una tabla en una vigencia
router.post('/categorias/bulk', auth, [
  body('vigenciaDesde').isISO8601(),
  body('categorias').isArray({ min: 1 }),
  validate,
], async (req, res, next) => {
  try {
    const vigenciaDesde = new Date(req.body.vigenciaDesde);
    const filas = req.body.categorias.map(c => ({
      estudioId: req.usuario.estudioId,
      categoria: c.categoria,
      vigenciaDesde,
      limiteIngresos: c.limiteIngresos,
      cuotaImpuesto: c.cuotaImpuesto || 0,
      cuotaObraSocial: c.cuotaObraSocial || 0,
      cuotaJubilacion: c.cuotaJubilacion || 0,
      total: c.total || (Number(c.cuotaImpuesto || 0) + Number(c.cuotaObraSocial || 0) + Number(c.cuotaJubilacion || 0)),
    }));
    const result = await prisma.monotributoCategoria.createMany({ data: filas, skipDuplicates: true });
    res.status(201).json({ creadas: result.count, total: filas.length });
  } catch (err) { next(err); }
});

// PUT /api/monotributo/categorias/:id
router.put('/categorias/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.monotributoCategoria.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });
    const { estudioId, id, ...data } = req.body;
    if (data.vigenciaDesde) data.vigenciaDesde = new Date(data.vigenciaDesde);
    const updated = await prisma.monotributoCategoria.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/monotributo/categorias/:id
router.delete('/categorias/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.monotributoCategoria.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });
    await prisma.monotributoCategoria.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/monotributo/alertas
// Para cada monotributista del estudio: suma comprobantes IVA de VENTA del año actual
// y compara contra el tope de su categoría. Marca alerta si supera el 80%.
// Optimizado: 1 sola query groupBy en lugar de N queries (una por cliente).
router.get('/alertas', auth, async (req, res, next) => {
  try {
    const anio = Number(req.query.anio) || new Date().getFullYear();
    const desde = new Date(`${anio}-01-01T00:00:00.000Z`);
    const hasta = new Date(`${anio}-12-31T23:59:59.999Z`);

    const [clientes, categorias] = await Promise.all([
      prisma.monotributoCliente.findMany({
        where: { activo: true, empresa: { estudioId: req.usuario.estudioId } },
        include: { empresa: { select: { id: true, razonSocial: true, cuit: true } } },
      }),
      getCategoriasVigentes(req.usuario.estudioId),
    ]);

    if (clientes.length === 0) return res.json({ anio, alertas: [], totalAlertas: 0 });

    const empresaIds = clientes.map(c => c.empresaId);
    const agregados = await prisma.comprobanteIVA.groupBy({
      by: ['empresaId'],
      where: {
        empresaId: { in: empresaIds },
        tipoMovimiento: 'VENTA',
        anulado: false,
        fecha: { gte: desde, lte: hasta },
      },
      _sum: {
        netoGravado21: true, netoGravado105: true, netoGravado27: true,
        netoNoGravado: true, exento: true, iva21: true, iva105: true, iva27: true,
      },
    });

    const facturadoPorEmpresa = {};
    for (const agg of agregados) {
      facturadoPorEmpresa[agg.empresaId] = ['netoGravado21','netoGravado105','netoGravado27','netoNoGravado','exento','iva21','iva105','iva27']
        .reduce((s, k) => s + Number(agg._sum[k] || 0), 0);
    }

    const alertas = [];
    for (const c of clientes) {
      const catInfo = categorias.find(x => x.categoria === c.categoriaActual);
      if (!catInfo) continue;
      const tope = catInfo.limiteIngresos;
      const facturado = facturadoPorEmpresa[c.empresaId] || 0;
      const porcentaje = tope > 0 ? (facturado / tope) * 100 : 0;
      const esAlerta = porcentaje >= 80;

      let categoriaSugerida = null;
      if (porcentaje > 100) {
        const sig = categorias.find(x => facturado <= x.limiteIngresos);
        categoriaSugerida = sig ? sig.categoria : 'EXCLUSIÓN';
      }

      alertas.push({
        empresaId: c.empresaId,
        empresa: c.empresa.razonSocial,
        cuit: c.empresa.cuit,
        categoriaActual: c.categoriaActual,
        topeCategoria: tope,
        facturadoAnio: facturado,
        porcentaje: Math.round(porcentaje * 10) / 10,
        esAlerta,
        superaTope: porcentaje > 100,
        categoriaSugerida,
      });
    }

    alertas.sort((a, b) => b.porcentaje - a.porcentaje);
    res.json({ anio, alertas, totalAlertas: alertas.filter(a => a.esAlerta).length });
  } catch (err) { next(err); }
});

// GET /api/monotributo/vencimientos?anio&mes
router.get('/vencimientos', auth, async (req, res, next) => {
  try {
    const { anio, mes } = req.query;
    const clientes = await prisma.monotributoCliente.findMany({
      where: { activo: true, empresa: { estudioId: req.usuario.estudioId } },
      include: { empresa: { select: { id: true, razonSocial: true } } },
    });

    const mesNum = Number(mes);
    const anioNum = Number(anio);
    const vencimientos = clientes.map(c => ({
      empresa: c.empresa,
      categoriaActual: c.categoriaActual,
      cuotaMensual: c.cuotaMensual,
      fechaVencimiento: new Date(anioNum, mesNum - 1, c.vencimientoCuota),
    }));

    res.json(vencimientos);
  } catch (err) { next(err); }
});

// GET /api/monotributo — lista todos los monotributistas del estudio
router.get('/', auth, async (req, res, next) => {
  try {
    const clientes = await prisma.monotributoCliente.findMany({
      where: { empresa: { estudioId: req.usuario.estudioId } },
      include: { empresa: { select: { id: true, razonSocial: true, cuit: true } } },
      orderBy: { empresa: { razonSocial: 'asc' } },
    });
    res.json(clientes);
  } catch (err) { next(err); }
});

// GET /api/monotributo/:empresaId
router.get('/:empresaId', auth, [param('empresaId').isUUID(), validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const mono = await prisma.monotributoCliente.findUnique({
      where: { empresaId: req.params.empresaId },
    });
    res.json(mono || null);
  } catch (err) { next(err); }
});

// POST /api/monotributo
router.post('/', auth, [
  body('empresaId').isUUID(),
  body('categoriaActual').isString().notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.body.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const categorias = await getCategoriasVigentes(req.usuario.estudioId);
    const catInfo = categorias.find(c => c.categoria === req.body.categoriaActual);
    if (!catInfo) return res.status(400).json({ error: `Categoría "${req.body.categoriaActual}" no existe en las categorías vigentes` });

    const mono = await prisma.monotributoCliente.create({
      data: {
        ...req.body,
        cuotaMensual: req.body.cuotaMensual || catInfo.total,
        fechaUltimaCategoria: new Date(),
      },
    });
    res.status(201).json(mono);
  } catch (err) { next(err); }
});

// PUT /api/monotributo/:empresaId
router.put('/:empresaId', auth, [param('empresaId').isUUID(), validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const existing = await prisma.monotributoCliente.findUnique({
      where: { empresaId: req.params.empresaId },
    });
    if (!existing) return res.status(404).json({ error: 'Monotributo no encontrado' });

    const { empresaId, ...data } = req.body;
    if (data.categoriaActual && data.categoriaActual !== existing.categoriaActual) {
      data.fechaUltimaCategoria = new Date();
    }

    const updated = await prisma.monotributoCliente.update({
      where: { empresaId: req.params.empresaId },
      data,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// POST /api/monotributo/:empresaId/recategorizar
router.post('/:empresaId/recategorizar', auth, [
  param('empresaId').isUUID(),
  body('ingresosBrutosAnuales').isFloat({ min: 0 }),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { ingresosBrutosAnuales } = req.body;
    const categorias = await getCategoriasVigentes(req.usuario.estudioId);
    const nuevaCat = determinarCategoriaPara(ingresosBrutosAnuales, categorias);

    const updated = await prisma.monotributoCliente.upsert({
      where: { empresaId: req.params.empresaId },
      create: {
        empresaId: req.params.empresaId,
        categoriaActual: nuevaCat.categoria,
        cuotaMensual: nuevaCat.total,
        ingresosBrutosMensual: Number(ingresosBrutosAnuales) / 12,
        fechaUltimaCategoria: new Date(),
      },
      update: {
        categoriaActual: nuevaCat.categoria,
        cuotaMensual: nuevaCat.total,
        ingresosBrutosMensual: Number(ingresosBrutosAnuales) / 12,
        fechaUltimaCategoria: new Date(),
      },
    });

    res.json({ ...updated, categoriaInfo: nuevaCat, ingresosBrutosAnuales });
  } catch (err) { next(err); }
});

module.exports = router;
