const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const dayjs = require('dayjs');


// GET /api/honorarios?empresaId
router.get('/', auth, async (req, res, next) => {
  try {
    const where = { estudioId: req.usuario.estudioId, activo: true };
    if (req.query.empresaId) where.empresaId = req.query.empresaId;

    const honorarios = await prisma.honorarioCliente.findMany({
      where,
      orderBy: [{ empresaId: 'asc' }, { descripcion: 'asc' }],
    });

    // Agregar nombre de empresa
    const empresasIds = [...new Set(honorarios.map(h => h.empresaId))];
    const empresas = await prisma.empresa.findMany({
      where: { id: { in: empresasIds } },
      select: { id: true, razonSocial: true },
    });
    const empMap = Object.fromEntries(empresas.map(e => [e.id, e.razonSocial]));

    res.json(honorarios.map(h => ({ ...h, empresaNombre: empMap[h.empresaId] || h.empresaId })));
  } catch (err) { next(err); }
});

// POST /api/honorarios
router.post('/', auth, [
  body('empresaId').isUUID(),
  body('descripcion').notEmpty(),
  body('importe').isFloat({ min: 0 }),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.body.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const honorario = await prisma.honorarioCliente.create({
      data: { ...req.body, estudioId: req.usuario.estudioId },
    });
    res.status(201).json(honorario);
  } catch (err) { next(err); }
});

// PUT /api/honorarios/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.honorarioCliente.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existing) return res.status(404).json({ error: 'Honorario no encontrado' });

    const { empresaId, estudioId, ...data } = req.body;
    const updated = await prisma.honorarioCliente.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/honorarios/:id
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.honorarioCliente.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existing) return res.status(404).json({ error: 'Honorario no encontrado' });

    await prisma.honorarioCliente.update({ where: { id: req.params.id }, data: { activo: false } });
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/honorarios/facturas?empresaId&anio&mes&estado
router.get('/facturas', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes, estado } = req.query;
    const where = { estudioId: req.usuario.estudioId };
    if (empresaId) where.empresaId = empresaId;
    if (anio) where.anio = Number(anio);
    if (mes) where.mes = Number(mes);
    if (estado) where.estado = estado;

    const facturas = await prisma.facturaHonorarios.findMany({
      where,
      orderBy: [{ fecha: 'desc' }],
    });

    const empresasIds = [...new Set(facturas.map(f => f.empresaId))];
    const empresas = await prisma.empresa.findMany({
      where: { id: { in: empresasIds } },
      select: { id: true, razonSocial: true },
    });
    const empMap = Object.fromEntries(empresas.map(e => [e.id, e.razonSocial]));

    const totalPendiente = facturas.filter(f => f.estado === 'PENDIENTE').reduce((s, f) => s + Number(f.total), 0);
    const totalCobrado = facturas.filter(f => f.estado === 'COBRADA').reduce((s, f) => s + Number(f.total), 0);

    res.json({
      facturas: facturas.map(f => ({ ...f, empresaNombre: empMap[f.empresaId] || f.empresaId })),
      resumen: { totalPendiente, totalCobrado },
    });
  } catch (err) { next(err); }
});

// POST /api/honorarios/facturas — emite facturas del mes para todos los honorarios mensuales activos
router.post('/facturas', auth, [
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  validate,
], async (req, res, next) => {
  try {
    const { anio, mes, empresaId, concepto, subtotal, iva, total } = req.body;

    // Si se pasa empresaId específica y datos manuales, crear factura individual
    if (empresaId && concepto) {
      const empresa = await prisma.empresa.findFirst({
        where: { id: empresaId, estudioId: req.usuario.estudioId },
      });
      if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

      const sub = Number(subtotal || 0);
      const ivaImporte = Number(iva || sub * 0.21);
      const tot = Number(total || sub + ivaImporte);

      const factura = await prisma.facturaHonorarios.create({
        data: {
          estudioId: req.usuario.estudioId,
          empresaId,
          fecha: new Date(),
          anio: Number(anio),
          mes: Number(mes),
          concepto,
          subtotal: sub,
          iva: ivaImporte,
          total: tot,
        },
      });
      return res.status(201).json(factura);
    }

    // Facturación masiva: generar una factura por empresa con honorarios mensuales activos
    const honorarios = await prisma.honorarioCliente.findMany({
      where: {
        estudioId: req.usuario.estudioId,
        periodicidad: 'MENSUAL',
        activo: true,
        ...(empresaId ? { empresaId } : {}),
      },
    });

    // Agrupar por empresa
    const porEmpresa = {};
    for (const h of honorarios) {
      if (!porEmpresa[h.empresaId]) porEmpresa[h.empresaId] = [];
      porEmpresa[h.empresaId].push(h);
    }

    const creadas = [];
    for (const [empId, items] of Object.entries(porEmpresa)) {
      const sub = items.reduce((s, h) => s + Number(h.importe), 0);
      const ivaImporte = sub * 0.21;
      const tot = sub + ivaImporte;
      const desc = items.map(h => h.descripcion).join(' / ');

      const factura = await prisma.facturaHonorarios.create({
        data: {
          estudioId: req.usuario.estudioId,
          empresaId: empId,
          fecha: new Date(),
          anio: Number(anio),
          mes: Number(mes),
          concepto: desc,
          subtotal: sub,
          iva: ivaImporte,
          total: tot,
        },
      });
      creadas.push(factura);
    }

    res.status(201).json({ generadas: creadas.length, facturas: creadas });
  } catch (err) { next(err); }
});

// GET /api/honorarios/facturas/:id
router.get('/facturas/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const factura = await prisma.facturaHonorarios.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json(factura);
  } catch (err) { next(err); }
});

// PUT /api/honorarios/facturas/:id
router.put('/facturas/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.facturaHonorarios.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existing) return res.status(404).json({ error: 'Factura no encontrada' });

    const { estudioId, empresaId, ...data } = req.body;
    if (data.estado === 'COBRADA' && !data.fechaCobro) data.fechaCobro = new Date();

    const updated = await prisma.facturaHonorarios.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// GET /api/honorarios/resumen — resumen de facturación por empresa
router.get('/resumen', auth, async (req, res, next) => {
  try {
    const facturas = await prisma.facturaHonorarios.findMany({
      where: { estudioId: req.usuario.estudioId },
    });

    const empresasIds = [...new Set(facturas.map(f => f.empresaId))];
    const empresas = await prisma.empresa.findMany({
      where: { id: { in: empresasIds } },
      select: { id: true, razonSocial: true },
    });
    const empMap = Object.fromEntries(empresas.map(e => [e.id, e.razonSocial]));

    const resumen = {};
    for (const f of facturas) {
      if (!resumen[f.empresaId]) {
        resumen[f.empresaId] = { empresaId: f.empresaId, empresa: empMap[f.empresaId], pendiente: 0, cobrado: 0, total: 0 };
      }
      if (f.estado === 'PENDIENTE' || f.estado === 'ENVIADA') resumen[f.empresaId].pendiente += Number(f.total);
      if (f.estado === 'COBRADA') resumen[f.empresaId].cobrado += Number(f.total);
      resumen[f.empresaId].total += Number(f.total);
    }

    res.json(Object.values(resumen).sort((a, b) => b.pendiente - a.pendiente));
  } catch (err) { next(err); }
});

module.exports = router;
