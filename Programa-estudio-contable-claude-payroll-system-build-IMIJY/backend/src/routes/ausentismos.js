const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');


// GET /api/ausentismos?empleadoId=&empresaId=&anio=&mes=
router.get('/', auth, async (req, res, next) => {
  try {
    const { empleadoId, empresaId, anio, mes } = req.query;
    const where = {};

    if (empleadoId) {
      where.empleadoId = empleadoId;
    } else if (empresaId) {
      where.empleado = { empresaId };
    } else {
      where.empleado = { empresa: { estudioId: req.usuario.estudioId } };
    }

    if (anio && mes) {
      const inicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
      const fin = new Date(parseInt(anio), parseInt(mes), 0, 23, 59, 59);
      where.OR = [
        { fechaDesde: { gte: inicio, lte: fin } },
        { fechaHasta: { gte: inicio, lte: fin } },
        { AND: [{ fechaDesde: { lte: inicio } }, { OR: [{ fechaHasta: { gte: fin } }, { fechaHasta: null }] }] },
      ];
    }

    const ausentismos = await prisma.ausentismo.findMany({
      where,
      include: {
        empleado: { select: { id: true, apellido: true, nombre: true, legajoNumero: true } },
      },
      orderBy: { fechaDesde: 'desc' },
    });

    res.json(ausentismos);
  } catch (err) {
    next(err);
  }
});

// GET /api/ausentismos/:id
router.get('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const ausentismo = await prisma.ausentismo.findFirst({
      where: {
        id: req.params.id,
        empleado: { empresa: { estudioId: req.usuario.estudioId } },
      },
      include: {
        empleado: { select: { id: true, apellido: true, nombre: true } },
      },
    });
    if (!ausentismo) return res.status(404).json({ error: 'Ausentismo no encontrado' });
    res.json(ausentismo);
  } catch (err) {
    next(err);
  }
});

// POST /api/ausentismos
router.post('/', auth, [
  body('empleadoId').isUUID(),
  body('tipo').notEmpty(),
  body('fechaDesde').isISO8601(),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, tipo, descripcion, fechaDesde, fechaHasta, dias, justificado, certificado } = req.body;

    const empleado = await prisma.empleado.findFirst({
      where: { id: empleadoId, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const ausentismo = await prisma.ausentismo.create({
      data: { empleadoId, tipo, descripcion, fechaDesde: new Date(fechaDesde),
        fechaHasta: fechaHasta ? new Date(fechaHasta) : null, dias: dias ? parseInt(dias) : null,
        justificado: justificado !== false, certificado },
      include: { empleado: { select: { id: true, apellido: true, nombre: true } } },
    });

    res.status(201).json(ausentismo);
  } catch (err) {
    next(err);
  }
});

// PUT /api/ausentismos/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.ausentismo.findFirst({
      where: { id: req.params.id, empleado: { empresa: { estudioId: req.usuario.estudioId } } },
    });
    if (!existing) return res.status(404).json({ error: 'Ausentismo no encontrado' });

    const { tipo, descripcion, fechaDesde, fechaHasta, dias, justificado, certificado } = req.body;
    const updated = await prisma.ausentismo.update({
      where: { id: req.params.id },
      data: { tipo, descripcion,
        fechaDesde: fechaDesde ? new Date(fechaDesde) : undefined,
        fechaHasta: fechaHasta ? new Date(fechaHasta) : null,
        dias: dias !== undefined ? parseInt(dias) : undefined,
        justificado, certificado },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/ausentismos/:id
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.ausentismo.findFirst({
      where: { id: req.params.id, empleado: { empresa: { estudioId: req.usuario.estudioId } } },
    });
    if (!existing) return res.status(404).json({ error: 'Ausentismo no encontrado' });

    await prisma.ausentismo.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
