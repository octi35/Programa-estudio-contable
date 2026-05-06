const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');

const prisma = new PrismaClient();

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
  validate,
], async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { estudio: true },
    });

    if (!usuario || !await bcrypt.compare(password, usuario.password)) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (!usuario.activo) {
      return res.status(401).json({ error: 'Usuario inactivo' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        estudio: usuario.estudio,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario.id },
    select: { id: true, email: true, nombre: true, rol: true, estudio: { select: { id: true, razonSocial: true, cuit: true } } },
  });
  res.json(usuario);
});

// POST /api/auth/change-password
router.post('/change-password', auth, [
  body('passwordActual').notEmpty(),
  body('passwordNuevo').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  validate,
], async (req, res, next) => {
  try {
    const { passwordActual, passwordNuevo } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });

    if (!await bcrypt.compare(passwordActual, usuario.password)) {
      return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    }

    const hashedPassword = await bcrypt.hash(passwordNuevo, 10);
    await prisma.usuario.update({ where: { id: req.usuario.id }, data: { password: hashedPassword } });

    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
