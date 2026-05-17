// Endpoints públicos de webhooks (no requieren login).
// Auth por HMAC SHA-256 con el `webhookSecret` del estudio.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

function verificarFirma(req, secret) {
  const firma = req.header('X-Webhook-Signature') || req.header('x-webhook-signature');
  if (!firma) return false;
  const body = JSON.stringify(req.body || {});
  const esperada = crypto.createHmac('sha256', secret).update(body).digest('hex');
  // timingSafeEqual requiere buffers del mismo tamaño
  const a = Buffer.from(firma.replace(/^sha256=/, ''), 'hex');
  const b = Buffer.from(esperada, 'hex');
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (_) { return false; }
}

// POST /api/webhooks/pagos/:estudioId
// Body: { banco, cuenta_cbu?, cuenta_id?, fecha, importe, referencia?, descripcion?,
//         comprobante_numero?, cuit_emisor?, medio_pago? }
// O un array de pagos en `pagos: [...]` para procesamiento batch.
router.post('/pagos/:estudioId', async (req, res) => {
  try {
    const estudio = await prisma.estudio.findUnique({ where: { id: req.params.estudioId } });
    if (!estudio) return res.status(404).json({ error: 'Estudio no encontrado' });
    if (!estudio.webhookSecret) {
      return res.status(403).json({ error: 'Webhook deshabilitado: el estudio no tiene webhookSecret configurado' });
    }

    if (!verificarFirma(req, estudio.webhookSecret)) {
      logger.warn?.(`[Webhook] firma inválida para estudio ${estudio.id} desde ${req.ip}`);
      return res.status(401).json({ error: 'Firma inválida' });
    }

    const { procesarPago } = require('../services/webhookBancarioService');

    const pagos = Array.isArray(req.body?.pagos) ? req.body.pagos : [req.body];

    const resultados = [];
    for (const p of pagos) {
      try {
        const r = await procesarPago(estudio.id, p);
        resultados.push(r);
      } catch (err) {
        logger.error?.(`[Webhook] error procesando pago: ${err.message}`);
        resultados.push({ error: err.message });
      }
    }

    res.json({
      ok: true,
      procesados: resultados.length,
      matched: resultados.filter(r => r.matched).length,
      sin_match: resultados.filter(r => !r.matched && !r.error).length,
      errores: resultados.filter(r => r.error).length,
      resultados,
    });
  } catch (err) {
    logger.error?.(`[Webhook] error: ${err.message}`);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});

module.exports = router;
