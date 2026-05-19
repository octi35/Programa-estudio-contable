const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { auth, requireRol } = require('../middleware/auth');
const validate = require('../middleware/validate');


// GET /api/convenios
router.get('/', auth, async (req, res, next) => {
  try {
    const convenios = await prisma.convenio.findMany({
      where: { activo: true },
      include: { _count: { select: { conceptos: true, empresas: true, empleados: true } } },
      orderBy: { nombre: 'asc' },
    });
    res.json(convenios);
  } catch (err) { next(err); }
});

// GET /api/convenios/:id
router.get('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const convenio = await prisma.convenio.findUnique({
      where: { id: req.params.id },
      include: {
        tablasSueldo: { orderBy: [{ vigenciaDesde: 'desc' }, { categoria: 'asc' }] },
        _count: { select: { conceptos: true, empresas: true, empleados: true } },
      },
    });
    if (!convenio) return res.status(404).json({ error: 'Convenio no encontrado' });
    res.json(convenio);
  } catch (err) { next(err); }
});

// POST /api/convenios
router.post('/', auth, requireRol('ADMIN', 'CONTADOR'), [
  body('codigo').notEmpty(),
  body('nombre').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const { codigo, nombre, descripcion, horasSemanales } = req.body;
    const convenio = await prisma.convenio.create({
      data: { codigo, nombre, descripcion, horasSemanales: horasSemanales ? Number(horasSemanales) : 40 },
    });
    res.status(201).json(convenio);
  } catch (err) { next(err); }
});

// PUT /api/convenios/:id
router.put('/:id', auth, requireRol('ADMIN', 'CONTADOR'), [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const { codigo, nombre, descripcion, activo, horasSemanales } = req.body;
    const updated = await prisma.convenio.update({
      where: { id: req.params.id },
      data: { codigo, nombre, descripcion, activo, horasSemanales: horasSemanales ? Number(horasSemanales) : undefined },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// GET /api/convenios/:id/tabla-sueldo
router.get('/:id/tabla-sueldo', auth, async (req, res, next) => {
  try {
    const { vigente } = req.query;
    const where = { convenioId: req.params.id };
    if (vigente === 'true') {
      const hoy = new Date();
      where.vigenciaDesde = { lte: hoy };
      where.OR = [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }];
    }

    const tabla = await prisma.tablaSueldo.findMany({
      where,
      orderBy: [{ vigenciaDesde: 'desc' }, { categoria: 'asc' }],
    });
    res.json(tabla);
  } catch (err) { next(err); }
});

// POST /api/convenios/:id/tabla-sueldo — agrega categorías
router.post('/:id/tabla-sueldo', auth, requireRol('ADMIN', 'CONTADOR'), [
  param('id').isUUID(),
  body('categorias').isArray({ min: 1 }),
  body('vigenciaDesde').isISO8601(),
  validate,
], async (req, res, next) => {
  try {
    const { categorias, vigenciaDesde } = req.body;
    const convenio = await prisma.convenio.findUnique({ where: { id: req.params.id } });
    if (!convenio) return res.status(404).json({ error: 'Convenio no encontrado' });

    const registros = await prisma.$transaction(
      categorias.map(cat => prisma.tablaSueldo.create({
        data: {
          convenioId: req.params.id,
          categoria: cat.categoria,
          descripcion: cat.descripcion,
          basicoMensual: cat.basicoMensual,
          vigenciaDesde: new Date(vigenciaDesde),
          vigenciaHasta: cat.vigenciaHasta ? new Date(cat.vigenciaHasta) : null,
        },
      }))
    );

    res.status(201).json(registros);
  } catch (err) { next(err); }
});

// POST /api/convenios/:id/paritaria — actualización masiva por porcentaje o importe
router.post('/:id/paritaria', auth, requireRol('ADMIN', 'CONTADOR'), [
  param('id').isUUID(),
  body('vigenciaDesde').isISO8601().withMessage('Fecha de vigencia requerida'),
  body('tipo').isIn(['PORCENTAJE', 'IMPORTE']).withMessage('Tipo debe ser PORCENTAJE o IMPORTE'),
  body('valor').isFloat({ min: 0 }).withMessage('Valor debe ser positivo'),
  validate,
], async (req, res, next) => {
  try {
    const { tipo, valor, vigenciaDesde, categorias: categoriasSeleccionadas } = req.body;
    const convenio = await prisma.convenio.findUnique({ where: { id: req.params.id } });
    if (!convenio) return res.status(404).json({ error: 'Convenio no encontrado' });

    // Tabla vigente actual
    const hoy = new Date();
    const tablaActual = await prisma.tablaSueldo.findMany({
      where: {
        convenioId: req.params.id,
        vigenciaDesde: { lte: hoy },
        OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }],
      },
    });

    const filtrada = categoriasSeleccionadas
      ? tablaActual.filter(t => categoriasSeleccionadas.includes(t.categoria))
      : tablaActual;

    if (filtrada.length === 0) return res.status(400).json({ error: 'No hay categorías vigentes para actualizar' });

    // Cierra registros anteriores y crea nuevos
    const fechaVigencia = new Date(vigenciaDesde);
    const operaciones = [];

    for (const cat of filtrada) {
      let nuevoBasico;
      if (tipo === 'PORCENTAJE') {
        nuevoBasico = parseFloat(cat.basicoMensual) * (1 + parseFloat(valor) / 100);
      } else {
        nuevoBasico = parseFloat(cat.basicoMensual) + parseFloat(valor);
      }

      // Cierra el registro anterior
      operaciones.push(
        prisma.tablaSueldo.update({
          where: { id: cat.id },
          data: { vigenciaHasta: new Date(fechaVigencia.getTime() - 1) },
        })
      );

      // Crea el nuevo
      operaciones.push(
        prisma.tablaSueldo.create({
          data: {
            convenioId: req.params.id,
            categoria: cat.categoria,
            descripcion: cat.descripcion,
            basicoMensual: Math.round(nuevoBasico * 100) / 100,
            vigenciaDesde: fechaVigencia,
          },
        })
      );
    }

    const resultados = await prisma.$transaction(operaciones);
    const nuevaTabla = resultados.filter(r => !r.vigenciaHasta || new Date(r.vigenciaHasta) >= new Date());

    res.json({
      ok: true,
      mensaje: `Paritaria aplicada: ${filtrada.length} categorías actualizadas`,
      tabla: nuevaTabla,
    });
  } catch (err) { next(err); }
});

module.exports = router;
