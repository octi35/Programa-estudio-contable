/**
 * Rutas AFIP — Padrón, validación de CUIT, conectividad
 */
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { consultarCUIT, verificarConectividad } = require('../services/afip/afipService');
const { evaluarFormula, validarFormula, evaluarConceptos } = require('../services/sueldos/motorFormulas');

// GET /api/afip/padron/:cuit — busca razón social y domicilio desde el padrón
router.get('/padron/:cuit', auth, async (req, res, next) => {
  try {
    const { cuit } = req.params;
    const cuitEstudio = req.usuario.estudio?.cuit || process.env.AFIP_CUIT_DEFAULT;

    if (!cuitEstudio) {
      return res.status(400).json({ error: 'Configure el CUIT del estudio en Perfil del Estudio antes de consultar el padrón.' });
    }

    const datos = await consultarCUIT(cuit, cuitEstudio);
    res.json({ ok: true, datos });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

// GET /api/afip/estado — ping a los servidores de AFIP
router.get('/estado', auth, async (req, res) => {
  const resultado = await verificarConectividad();
  res.json(resultado);
});

// POST /api/afip/formulas/evaluar — evalúa una fórmula con variables del empleado
router.post('/formulas/evaluar', auth, (req, res) => {
  const { formula, variables } = req.body;
  if (!formula) return res.status(400).json({ error: 'formula requerida' });
  const resultado = evaluarFormula(formula, variables || {});
  res.json(resultado);
});

// POST /api/afip/formulas/validar — valida sintaxis sin datos reales
router.post('/formulas/validar', auth, (req, res) => {
  const { formula } = req.body;
  if (!formula) return res.status(400).json({ error: 'formula requerida' });
  res.json(validarFormula(formula));
});

// POST /api/afip/formulas/conceptos — evalúa lista de conceptos con scope acumulado
router.post('/formulas/conceptos', auth, (req, res) => {
  const { conceptos, variables } = req.body;
  if (!Array.isArray(conceptos)) return res.status(400).json({ error: 'conceptos debe ser un array' });
  res.json(evaluarConceptos(conceptos, variables || {}));
});

module.exports = router;
