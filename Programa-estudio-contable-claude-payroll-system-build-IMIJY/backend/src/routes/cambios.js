const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');


// GET /api/cambios?moneda&fecha
router.get('/', auth, async (req, res, next) => {
  try {
    const { moneda, fecha, desde, hasta } = req.query;
    const where = { estudioId: req.usuario.estudioId };
    if (moneda) where.moneda = moneda;
    if (fecha) {
      const d = new Date(fecha);
      d.setHours(0, 0, 0, 0);
      const h = new Date(fecha);
      h.setHours(23, 59, 59, 999);
      where.fecha = { gte: d, lte: h };
    }
    if (desde) where.fecha = { ...where.fecha, gte: new Date(desde) };
    if (hasta) where.fecha = { ...where.fecha, lte: new Date(hasta) };

    const tipos = await prisma.tipoCambio.findMany({
      where,
      orderBy: [{ fecha: 'desc' }, { moneda: 'asc' }],
    });
    res.json(tipos);
  } catch (err) { next(err); }
});

// GET /api/cambios/historico?moneda&desde&hasta
router.get('/historico', auth, [
  query('moneda').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const { moneda, desde, hasta, tipo } = req.query;
    const where = { estudioId: req.usuario.estudioId, moneda };
    if (tipo) where.tipo = tipo;
    if (desde) where.fecha = { ...where.fecha, gte: new Date(desde) };
    if (hasta) where.fecha = { ...where.fecha, lte: new Date(hasta) };

    const historico = await prisma.tipoCambio.findMany({
      where,
      orderBy: { fecha: 'asc' },
    });
    res.json(historico);
  } catch (err) { next(err); }
});

// POST /api/cambios
router.post('/', auth, [
  body('moneda').notEmpty(),
  body('fecha').isISO8601(),
  body('compra').isFloat({ min: 0 }),
  body('venta').isFloat({ min: 0 }),
  validate,
], async (req, res, next) => {
  try {
    const { moneda, fecha, tipo = 'OFICIAL', compra, venta } = req.body;

    const tipoCambio = await prisma.tipoCambio.upsert({
      where: {
        estudioId_moneda_fecha_tipo: {
          estudioId: req.usuario.estudioId,
          moneda,
          fecha: new Date(fecha),
          tipo,
        },
      },
      create: { estudioId: req.usuario.estudioId, moneda, fecha: new Date(fecha), tipo, compra, venta },
      update: { compra, venta },
    });
    res.status(201).json(tipoCambio);
  } catch (err) { next(err); }
});

// POST /api/cambios/sync — Sincroniza el tipo de cambio actual desde dolarapi.com
// Disponible también como POST /api/tipos-cambio/sync
async function ejecutarSync(estudioId) {
  // Llamamos directamente a la API pública sin pasar por nuestro endpoint /externo/dolar
  // para evitar dependencias circulares y para que pueda llamarse desde el cron job.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let cotizaciones;
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares', {
      signal: controller.signal,
      headers: { 'User-Agent': 'EstudioPRO/1.0' },
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    cotizaciones = await r.json();
  } finally {
    clearTimeout(timer);
  }

  if (!Array.isArray(cotizaciones)) throw new Error('Respuesta inválida del proveedor');

  // Mapeo dolarapi.casa -> tipo interno
  const TIPO_MAP = {
    oficial: 'OFICIAL',
    blue: 'BLUE',
    bolsa: 'MEP',
    contadoconliqui: 'CCL',
  };

  const fechaHoy = new Date();
  fechaHoy.setHours(0, 0, 0, 0);

  const resultados = [];
  for (const c of cotizaciones) {
    const tipo = TIPO_MAP[c.casa];
    if (!tipo) continue;
    if (c.venta == null) continue;

    // ¿Tenemos el último registro? Si el valor es igual, no insertamos otra fila
    const ultimo = await prisma.tipoCambio.findFirst({
      where: { estudioId, moneda: 'USD', tipo },
      orderBy: { fecha: 'desc' },
    });

    if (ultimo && Number(ultimo.venta) === Number(c.venta) && Number(ultimo.compra) === Number(c.compra || 0)) {
      resultados.push({ tipo, accion: 'sin_cambios', valor: Number(c.venta) });
      continue;
    }

    const upserted = await prisma.tipoCambio.upsert({
      where: {
        estudioId_moneda_fecha_tipo: { estudioId, moneda: 'USD', fecha: fechaHoy, tipo },
      },
      create: { estudioId, moneda: 'USD', fecha: fechaHoy, tipo, compra: c.compra || 0, venta: c.venta },
      update: { compra: c.compra || 0, venta: c.venta },
    });
    resultados.push({ tipo, accion: 'actualizado', valor: Number(c.venta), id: upserted.id });
  }

  return { ok: true, fecha: fechaHoy.toISOString(), resultados };
}

router.post('/sync', auth, async (req, res, next) => {
  try {
    const out = await ejecutarSync(req.usuario.estudioId);
    res.json(out);
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message || 'No se pudo sincronizar' });
  }
});

async function syncTodosLosEstudios() {
  try {
    const estudios = await prisma.estudio.findMany({ select: { id: true, razonSocial: true } });
    const resultados = [];
    for (const est of estudios) {
      try {
        const r = await ejecutarSync(est.id);
        resultados.push({ estudioId: est.id, ok: true, cambios: r.resultados.filter(x => x.accion === 'actualizado').length });
      } catch (e) {
        resultados.push({ estudioId: est.id, ok: false, error: e.message });
      }
    }
    return resultados;
  } catch (err) {
    return [{ ok: false, error: err.message }];
  }
}

// DELETE /api/cambios/:id
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.tipoCambio.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existing) return res.status(404).json({ error: 'Tipo de cambio no encontrado' });

    await prisma.tipoCambio.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.ejecutarSyncCron = syncTodosLosEstudios;
