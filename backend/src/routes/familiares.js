const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');


// GET /api/familiares?empleadoId=
router.get('/', auth, async (req, res, next) => {
  try {
    const { empleadoId } = req.query;
    if (!empleadoId) return res.status(400).json({ error: 'empleadoId requerido' });

    const familiares = await prisma.familiar.findMany({
      where: {
        empleadoId,
        empleado: { empresa: { estudioId: req.usuario.estudioId } },
      },
      orderBy: { apellido: 'asc' },
    });
    res.json(familiares);
  } catch (err) {
    next(err);
  }
});

// POST /api/familiares
router.post('/', auth, [
  body('empleadoId').isUUID(),
  body('nombre').notEmpty(),
  body('apellido').notEmpty(),
  body('parentesco').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, nombre, apellido, parentesco, cuil, fechaNacimiento, discapacitado } = req.body;

    const empleado = await prisma.empleado.findFirst({
      where: { id: empleadoId, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const familiar = await prisma.familiar.create({
      data: { empleadoId, nombre, apellido, parentesco, cuil,
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
        discapacitado: discapacitado === true },
    });
    res.status(201).json(familiar);
  } catch (err) {
    next(err);
  }
});

// PUT /api/familiares/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.familiar.findFirst({
      where: { id: req.params.id, empleado: { empresa: { estudioId: req.usuario.estudioId } } },
    });
    if (!existing) return res.status(404).json({ error: 'Familiar no encontrado' });

    const { nombre, apellido, parentesco, cuil, fechaNacimiento, discapacitado, activo } = req.body;
    const updated = await prisma.familiar.update({
      where: { id: req.params.id },
      data: { nombre, apellido, parentesco, cuil,
        fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
        discapacitado, activo },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/familiares/:id
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.familiar.findFirst({
      where: { id: req.params.id, empleado: { empresa: { estudioId: req.usuario.estudioId } } },
    });
    if (!existing) return res.status(404).json({ error: 'Familiar no encontrado' });

    await prisma.familiar.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
