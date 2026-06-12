const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asistenteService = require('../services/ia/asistenteService');

// GET /api/asistente/estado — el frontend muestra el chat solo si está habilitado
router.get('/estado', auth, (req, res) => {
  const { habilitado } = require('../services/ia/llmClient');
  res.json({ habilitado: habilitado() });
});

// POST /api/asistente/chat — un turno de conversación
// Body: { mensajes: [{ role: 'user'|'assistant', content: string }] }
router.post('/chat', auth, [
  body('mensajes').isArray({ min: 1, max: 40 }),
  body('mensajes.*.role').isIn(['user', 'assistant']),
  body('mensajes.*.content').isString().notEmpty().isLength({ max: 4000 }),
  validate,
], async (req, res, next) => {
  try {
    const estudio = await prisma.estudio.findUnique({
      where: { id: req.usuario.estudioId },
      select: { razonSocial: true },
    });
    const r = await asistenteService.chat(
      req.usuario.estudioId,
      estudio?.razonSocial || 'el estudio',
      req.body.mensajes,
    );
    res.json(r);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
