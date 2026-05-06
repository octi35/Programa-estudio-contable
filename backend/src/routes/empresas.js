const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const prisma = new PrismaClient();

const empresaValidations = [
  body('razonSocial').notEmpty().withMessage('Razón social requerida'),
  body('cuit').matches(/^\d{2}-\d{8}-\d{1}$/).withMessage('CUIT inválido (formato: XX-XXXXXXXX-X)'),
];

// GET /api/empresas
router.get('/', auth, async (req, res, next) => {
  try {
    const { buscar, activa, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { estudioId: req.usuario.estudioId };
    if (activa !== undefined) where.activa = activa === 'true';
    if (buscar) {
      where.OR = [
        { razonSocial: { contains: buscar, mode: 'insensitive' } },
        { cuit: { contains: buscar } },
        { nombreFantasia: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    const [empresas, total] = await Promise.all([
      prisma.empresa.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          convenio: { select: { id: true, codigo: true, nombre: true } },
          _count: { select: { empleados: { where: { activo: true } } } },
        },
        orderBy: { razonSocial: 'asc' },
      }),
      prisma.empresa.count({ where }),
    ]);

    res.json({
      data: empresas,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/empresas/:id
router.get('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
      include: {
        convenio: true,
        _count: { select: { empleados: { where: { activo: true } } } },
      },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(empresa);
  } catch (err) {
    next(err);
  }
});

// POST /api/empresas
router.post('/', auth, [...empresaValidations, validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.create({
      data: { ...req.body, estudioId: req.usuario.estudioId },
      include: { convenio: true },
    });
    res.status(201).json(empresa);
  } catch (err) {
    next(err);
  }
});

// PUT /api/empresas/:id
router.put('/:id', auth, [param('id').isUUID(), ...empresaValidations, validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const updated = await prisma.empresa.update({
      where: { id: req.params.id },
      data: req.body,
      include: { convenio: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/empresas/:id (desactivar)
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    await prisma.empresa.update({ where: { id: req.params.id }, data: { activa: false } });
    res.json({ message: 'Empresa desactivada' });
  } catch (err) {
    next(err);
  }
});

// GET /api/empresas/:id/periodos
router.get('/:id/periodos', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const periodos = await prisma.periodoLiquidacion.findMany({
      where: { empresaId: req.params.id },
      include: { _count: { select: { liquidaciones: true } } },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 24,
    });
    res.json(periodos);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
