const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const bcrypt = require('bcryptjs');
const { auth, requireRol } = require('../middleware/auth');
const validate = require('../middleware/validate');


// GET /api/usuarios
router.get('/', auth, requireRol('ADMIN'), async (req, res, next) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { estudioId: req.usuario.estudioId },
      select: { id: true, email: true, nombre: true, rol: true, activo: true, createdAt: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(usuarios);
  } catch (err) { next(err); }
});

// POST /api/usuarios
router.post('/', auth, requireRol('ADMIN'), [
  body('email').isEmail().withMessage('Email inválido'),
  body('nombre').notEmpty().withMessage('Nombre requerido'),
  body('password').isLength({ min: 8 }).withMessage('Contraseña de al menos 8 caracteres'),
  body('rol').isIn(['ADMIN', 'CONTADOR', 'OPERADOR']).withMessage('Rol inválido'),
  validate,
], async (req, res, next) => {
  try {
    const { email, nombre, password, rol } = req.body;
    const existing = await prisma.usuario.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const usuario = await prisma.usuario.create({
      data: { email, nombre, password: hashedPassword, rol, estudioId: req.usuario.estudioId },
      select: { id: true, email: true, nombre: true, rol: true, activo: true, createdAt: true },
    });
    res.status(201).json(usuario);
  } catch (err) { next(err); }
});

// PUT /api/usuarios/:id
router.put('/:id', auth, requireRol('ADMIN'), [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.usuario.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { email, nombre, rol, activo, password } = req.body;
    const data = {};
    if (email) data.email = email;
    if (nombre) data.nombre = nombre;
    if (rol) data.rol = rol;
    if (activo !== undefined) data.activo = activo;
    if (password && password.length >= 8) data.password = await bcrypt.hash(password, 10);

    const updated = await prisma.usuario.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, nombre: true, rol: true, activo: true, createdAt: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/usuarios/:id (desactivación lógica)
router.delete('/:id', auth, requireRol('ADMIN'), [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    if (req.params.id === req.usuario.id) {
      return res.status(400).json({ error: 'No puede desactivar su propio usuario' });
    }
    const existing = await prisma.usuario.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

    await prisma.usuario.update({ where: { id: req.params.id }, data: { activo: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
