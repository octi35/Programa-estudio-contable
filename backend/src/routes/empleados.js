const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const dayjs = require('dayjs');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const prisma = new PrismaClient();

const empleadoValidations = [
  body('apellido').notEmpty().withMessage('Apellido requerido'),
  body('nombre').notEmpty().withMessage('Nombre requerido'),
  body('cuil').matches(/^\d{2}-\d{8}-\d{1}$/).withMessage('CUIL inválido (formato: XX-XXXXXXXX-X)'),
  body('fechaIngreso').isISO8601().withMessage('Fecha de ingreso inválida'),
  body('empresaId').isUUID().withMessage('Empresa inválida'),
];

// GET /api/empleados
router.get('/', auth, async (req, res, next) => {
  try {
    const { empresaId, buscar, activo, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {};
    if (activo !== undefined) where.activo = activo === 'true';
    if (empresaId) {
      where.empresaId = empresaId;
    } else {
      where.empresa = { estudioId: req.usuario.estudioId };
    }
    if (buscar) {
      where.OR = [
        { apellido: { contains: buscar, mode: 'insensitive' } },
        { nombre: { contains: buscar, mode: 'insensitive' } },
        { cuil: { contains: buscar } },
        { legajoNumero: { contains: buscar } },
      ];
    }

    const [empleados, total] = await Promise.all([
      prisma.empleado.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          empresa: { select: { id: true, razonSocial: true, cuit: true } },
        },
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      }),
      prisma.empleado.count({ where }),
    ]);

    const empleadosConAntiguedad = empleados.map(e => ({
      ...e,
      antiguedadAnios: dayjs().diff(dayjs(e.fechaIngreso), 'year'),
    }));

    res.json({
      data: empleadosConAntiguedad,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/empleados/:id
router.get('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empleado = await prisma.empleado.findFirst({
      where: {
        id: req.params.id,
        empresa: { estudioId: req.usuario.estudioId },
      },
      include: {
        empresa: { include: { convenio: true } },
        novedades: { orderBy: { createdAt: 'desc' }, take: 10 },
        documentos: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    res.json({
      ...empleado,
      antiguedadAnios: dayjs().diff(dayjs(empleado.fechaIngreso), 'year'),
      antiguedadMeses: dayjs().diff(dayjs(empleado.fechaIngreso), 'month'),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/empleados
router.post('/', auth, [...empleadoValidations, validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.body.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const empleado = await prisma.empleado.create({
      data: req.body,
      include: { empresa: { select: { id: true, razonSocial: true } } },
    });

    await prisma.novedadEmpleado.create({
      data: {
        empleadoId: empleado.id,
        tipo: 'ALTA',
        descripcion: 'Alta de empleado',
        fechaDesde: new Date(req.body.fechaIngreso),
      },
    });

    res.status(201).json(empleado);
  } catch (err) {
    next(err);
  }
});

// PUT /api/empleados/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empleado = await prisma.empleado.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const { empresaId, ...dataUpdate } = req.body;

    if (dataUpdate.basicoMensual && dataUpdate.basicoMensual !== empleado.basicoMensual.toNumber()) {
      await prisma.novedadEmpleado.create({
        data: {
          empleadoId: empleado.id,
          tipo: 'MODIFICACION_SUELDO',
          descripcion: `Modificación de básico: $${empleado.basicoMensual} → $${dataUpdate.basicoMensual}`,
          fechaDesde: new Date(),
          valor: dataUpdate.basicoMensual,
        },
      });
    }

    const updated = await prisma.empleado.update({
      where: { id: req.params.id },
      data: dataUpdate,
      include: { empresa: { select: { id: true, razonSocial: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/empleados/:id/baja
router.post('/:id/baja', auth, [
  param('id').isUUID(),
  body('fechaEgreso').isISO8601().withMessage('Fecha de egreso inválida'),
  body('motivoEgreso').notEmpty().withMessage('Motivo de egreso requerido'),
  validate,
], async (req, res, next) => {
  try {
    const empleado = await prisma.empleado.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const updated = await prisma.empleado.update({
      where: { id: req.params.id },
      data: {
        activo: false,
        fechaEgreso: new Date(req.body.fechaEgreso),
        motivoEgreso: req.body.motivoEgreso,
      },
    });

    await prisma.novedadEmpleado.create({
      data: {
        empleadoId: empleado.id,
        tipo: 'BAJA',
        descripcion: `Baja de empleado: ${req.body.motivoEgreso}`,
        fechaDesde: new Date(req.body.fechaEgreso),
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/empleados/:id/liquidaciones
router.get('/:id/liquidaciones', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidaciones = await prisma.liquidacion.findMany({
      where: { empleadoId: req.params.id },
      include: { periodo: true },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 24,
    });
    res.json(liquidaciones);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
