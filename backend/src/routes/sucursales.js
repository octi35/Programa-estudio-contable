const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');


// GET /api/sucursales?empresaId=
router.get('/', auth, async (req, res, next) => {
  try {
    const { empresaId } = req.query;
    const where = { empresa: { estudioId: req.usuario.estudioId } };
    if (empresaId) where.empresaId = empresaId;

    const sucursales = await prisma.sucursal.findMany({
      where,
      include: {
        empresa: { select: { id: true, razonSocial: true } },
        _count: { select: { empleados: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(sucursales);
  } catch (err) {
    next(err);
  }
});

// POST /api/sucursales
router.post('/', auth, [
  body('empresaId').isUUID(),
  body('nombre').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.body.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { empresaId, nombre, codigo, domicilio, localidad, provincia, codigoPostal, telefono } = req.body;
    const sucursal = await prisma.sucursal.create({
      data: { empresaId, nombre, codigo, domicilio, localidad, provincia, codigoPostal, telefono },
    });
    res.status(201).json(sucursal);
  } catch (err) {
    next(err);
  }
});

// PUT /api/sucursales/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.sucursal.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Sucursal no encontrada' });

    const { nombre, codigo, domicilio, localidad, provincia, codigoPostal, telefono, activa } = req.body;
    const updated = await prisma.sucursal.update({
      where: { id: req.params.id },
      data: { nombre, codigo, domicilio, localidad, provincia, codigoPostal, telefono, activa },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sucursales/:id
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.sucursal.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Sucursal no encontrada' });

    await prisma.sucursal.update({ where: { id: req.params.id }, data: { activa: false } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
