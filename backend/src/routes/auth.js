const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const logAccion = require('../utils/logAccion');


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

    // Cookie httpOnly: la fuente principal de auth ahora. SameSite=Lax permite
    // navegación top-level (window.open de descargas) sin abrir CSRF.
    setAuthCookie(res, token);

    res.json({
      token, // se mantiene por compat con clientes que lo guarden en localStorage
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

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    path: '/',
  });
}

// POST /api/auth/logout — limpia la cookie de sesión
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ ok: true });
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

// ─── PASSWORD RESET ──────────────────────────────────────────────────────────
// Usa JWT firmado de uso único: payload incluye un nonce que se invalida cuando
// el usuario cambia su contraseña (porque el hash de password cambia → el JWT
// firmado con el hash anterior como "salt" deja de validar).

function tokenSecretFor(usuario) {
  // El secret incluye el hash actual del password → cambiar password invalida tokens viejos
  return `${process.env.JWT_SECRET}::${usuario.password}`;
}

// POST /api/auth/forgot-password — siempre responde OK aunque el email no exista
// para no filtrar qué cuentas están registradas.
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Email inválido'),
  validate,
], async (req, res, next) => {
  try {
    const { email } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { email } });

    if (usuario && usuario.activo) {
      const token = jwt.sign(
        { id: usuario.id, purpose: 'reset' },
        tokenSecretFor(usuario),
        { expiresIn: '60m' }
      );
      const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}&uid=${usuario.id}`;

      try {
        const { enviarPasswordReset } = require('../services/emailService');
        await enviarPasswordReset(usuario.email, usuario.nombre, resetUrl);
      } catch (mailErr) {
        // Loguear pero no romper la respuesta: el endpoint no debe revelar nada
        console.error('Error enviando email de reset:', mailErr.message);
      }

      await logAccion({
        usuarioId: usuario.id,
        estudioId: usuario.estudioId,
        accion: 'SOLICITAR_RESET_PASSWORD',
        entidad: 'Usuario',
        entidadId: usuario.id,
        ip: req.ip,
      });
    }

    // Respuesta unificada para no filtrar existencia de la cuenta
    res.json({ ok: true, message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.' });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('uid').isUUID(),
  body('token').isString().notEmpty(),
  body('passwordNuevo').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  validate,
], async (req, res, next) => {
  try {
    const { uid, token, passwordNuevo } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { id: uid } });
    if (!usuario || !usuario.activo) return res.status(400).json({ error: 'Enlace inválido o expirado' });

    try {
      const payload = jwt.verify(token, tokenSecretFor(usuario));
      if (payload.purpose !== 'reset' || payload.id !== usuario.id) {
        return res.status(400).json({ error: 'Enlace inválido' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Enlace inválido o expirado. Solicitá uno nuevo.' });
    }

    const hashedPassword = await bcrypt.hash(passwordNuevo, 10);
    await prisma.usuario.update({ where: { id: uid }, data: { password: hashedPassword } });

    await logAccion({
      usuarioId: usuario.id,
      estudioId: usuario.estudioId,
      accion: 'RESETEAR_PASSWORD',
      entidad: 'Usuario',
      entidadId: usuario.id,
      ip: req.ip,
    });

    res.json({ ok: true, message: 'Contraseña actualizada. Ya podés iniciar sesión.' });
  } catch (err) { next(err); }
});

// GET /api/auth/reset-password/verify?uid=&token=
// Valida el token sin consumirlo. Usado por la pantalla de reset para mostrar el form.
router.get('/reset-password/verify', async (req, res) => {
  try {
    const { uid, token } = req.query;
    if (!uid || !token) return res.json({ valido: false });
    const usuario = await prisma.usuario.findUnique({ where: { id: String(uid) } });
    if (!usuario || !usuario.activo) return res.json({ valido: false });
    try {
      const payload = jwt.verify(String(token), tokenSecretFor(usuario));
      if (payload.purpose !== 'reset' || payload.id !== usuario.id) return res.json({ valido: false });
      return res.json({ valido: true, nombre: usuario.nombre, email: usuario.email });
    } catch (_) { return res.json({ valido: false }); }
  } catch (_) { return res.json({ valido: false }); }
});

module.exports = router;
