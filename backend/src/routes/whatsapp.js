/**
 * Rutas del bot de WhatsApp (Evolution API).
 *
 *  Públicas (las llama Evolution o n8n):
 *   POST /api/whatsapp/webhook[/:instance]  ← Evolution empuja los mensajes acá
 *   POST /api/whatsapp/procesar             ← n8n manda {instance,telefono,texto} y recibe {replies}
 *
 *  Privadas (panel del estudio, requieren login):
 *   GET  /api/whatsapp/estado               estado de conexión + config
 *   POST /api/whatsapp/conectar             crea/reconecta la instancia y devuelve el QR
 *   GET  /api/whatsapp/qr                   devuelve el QR para escanear
 *   POST /api/whatsapp/desconectar          cierra la sesión de WhatsApp
 *   POST /api/whatsapp/enviar-prueba        envía un mensaje de prueba
 */

const express = require('express');
const router = express.Router();
const { auth, requireRol } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');
const evolution = require('../services/whatsapp/evolutionClient');
const botService = require('../services/whatsapp/botService');

// ── Helpers de extracción del payload de Evolution ──────────────────────────

/** Normaliza el/los mensajes entrantes de un webhook de Evolution. */
function extraerMensajes(body) {
  const evento = String(body?.event || body?.evento || '').toLowerCase().replace(/_/g, '.');
  const instance = body?.instance || body?.instanceName || null;
  if (evento && evento !== 'messages.upsert') return { instance, evento, mensajes: [] };

  const datos = Array.isArray(body?.data) ? body.data : [body?.data].filter(Boolean);
  const mensajes = [];
  for (const d of datos) {
    if (!d?.key || d.key.fromMe) continue;                  // ignorar salientes
    const jid = d.key.remoteJid || '';
    if (jid.endsWith('@g.us')) continue;                    // ignorar grupos
    const texto =
      d.message?.conversation ||
      d.message?.extendedTextMessage?.text ||
      d.message?.imageMessage?.caption ||
      d.message?.buttonsResponseMessage?.selectedDisplayText ||
      d.message?.listResponseMessage?.title ||
      '';
    mensajes.push({
      telefono: jid.replace(/@.*/, ''),
      texto,
      pushName: d.pushName || null,
      tipo: d.messageType || (texto ? 'texto' : 'otro'),
    });
  }
  return { instance, evento: 'messages.upsert', mensajes };
}

/** Envía una lista de respuestas del bot por Evolution, con pausa humana. */
async function enviarReplies(telefono, replies, instance) {
  for (const r of replies) {
    try {
      await evolution.presencia(telefono, instance);
      if (r.tipo === 'media') {
        await evolution.enviarMedia(telefono, {
          media: r.media,
          fileName: r.fileName,
          caption: r.caption,
          mimetype: r.mimetype || 'application/pdf',
          mediatype: 'document',
        }, instance);
      } else {
        await evolution.enviarTexto(telefono, r.texto, instance);
      }
    } catch (e) {
      logger.error?.(`[whatsapp] error enviando reply a ${telefono}: ${e.message}`);
    }
  }
}

// ── WEBHOOK público (Evolution) ─────────────────────────────────────────────

async function manejarWebhook(req, res) {
  // 200 inmediato: Evolution reintenta si no recibe 2xx rápido.
  res.json({ ok: true });

  try {
    const token = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (token && req.query.token !== token && req.header('x-webhook-token') !== token) {
      logger.warn?.(`[whatsapp] webhook con token inválido desde ${req.ip}`);
      return;
    }

    const { instance: instanceBody, mensajes } = extraerMensajes(req.body);
    const instance = req.params.instance || instanceBody || evolution.DEFAULT_INSTANCE;
    if (!mensajes.length) return;

    const estudio = await botService.estudioDeInstancia(instance);
    if (!estudio) {
      logger.warn?.(`[whatsapp] no hay estudio para la instancia "${instance}"`);
      return;
    }

    for (const m of mensajes) {
      try {
        const { replies } = await botService.procesar({
          estudio,
          telefono: m.telefono,
          texto: m.texto,
          pushName: m.pushName,
        });
        await enviarReplies(m.telefono, replies, instance);
      } catch (e) {
        logger.error?.(`[whatsapp] error procesando mensaje de ${m.telefono}: ${e.message}`);
      }
    }
  } catch (err) {
    logger.error?.(`[whatsapp] webhook error: ${err.message}`);
  }
}

router.post('/webhook', manejarWebhook);
router.post('/webhook/:instance', manejarWebhook);

// ── Endpoint para n8n: procesa y devuelve replies (sin enviar) ──────────────
// Body: { instance, telefono, texto, pushName, enviar? }
// Si enviar=true, además las manda por Evolution. Si no, n8n las envía.
router.post('/procesar', async (req, res) => {
  try {
    const token = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (token && req.query.token !== token && req.header('x-webhook-token') !== token) {
      return res.status(401).json({ error: 'token inválido' });
    }
    const { instance: inst, telefono, texto, pushName, enviar } = req.body || {};
    const instance = inst || evolution.DEFAULT_INSTANCE;
    if (!telefono || !texto) return res.status(400).json({ error: 'telefono y texto requeridos' });

    const estudio = await botService.estudioDeInstancia(instance);
    if (!estudio) return res.status(404).json({ error: `sin estudio para instancia ${instance}` });

    const { replies } = await botService.procesar({ estudio, telefono, texto, pushName });
    if (enviar) await enviarReplies(telefono, replies, instance);

    res.json({ ok: true, instance, telefono, replies });
  } catch (err) {
    logger.error?.(`[whatsapp] /procesar error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Panel del estudio (privado) ─────────────────────────────────────────────

function instanciaDe(estudio) {
  return estudio?.waInstance || process.env.EVOLUTION_INSTANCE || evolution.DEFAULT_INSTANCE;
}

router.get('/estado', auth, async (req, res) => {
  const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
  const instance = instanciaDe(estudio);
  const config = {
    habilitado: evolution.habilitado(),
    provider: process.env.WHATSAPP_PROVIDER || 'mock',
    instance,
    numero: estudio?.waNumero || null,
    operadores: estudio?.waOperadores || null,
  };
  if (!evolution.habilitado()) return res.json({ ...config, conexion: 'no_configurado' });
  try {
    const estado = await evolution.estadoConexion(instance);
    res.json({ ...config, conexion: estado?.instance?.state || estado?.state || 'desconocido', raw: estado });
  } catch (e) {
    res.json({ ...config, conexion: 'error', error: e.message });
  }
});

router.post('/conectar', auth, requireRol('ADMIN', 'CONTADOR'), async (req, res) => {
  try {
    const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
    const instance = req.body.instance || instanciaDe(estudio);

    // Persistir la instancia en el estudio (1 instancia = 1 estudio).
    if (estudio && estudio.waInstance !== instance) {
      await prisma.estudio.update({ where: { id: estudio.id }, data: { waInstance: instance } });
    }

    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${base}/api/whatsapp/webhook/${instance}` + (process.env.WHATSAPP_WEBHOOK_TOKEN ? `?token=${process.env.WHATSAPP_WEBHOOK_TOKEN}` : '');

    let qr;
    try {
      qr = await evolution.crearInstancia(instance, webhookUrl);
    } catch (e) {
      // Si ya existe, sólo reconfiguramos webhook y pedimos el QR.
      if (e.statusCode === 403 || e.statusCode === 409) {
        await evolution.configurarWebhook(instance, webhookUrl).catch(() => {});
        qr = await evolution.obtenerQR(instance);
      } else { throw e; }
    }
    res.json({ ok: true, instance, webhookUrl, qr: qr?.qrcode || qr?.base64 || qr });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.get('/qr', auth, async (req, res) => {
  try {
    const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
    const qr = await evolution.obtenerQR(instanciaDe(estudio));
    res.json({ ok: true, qr: qr?.qrcode || qr?.base64 || qr });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.post('/desconectar', auth, requireRol('ADMIN', 'CONTADOR'), async (req, res) => {
  try {
    const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
    const r = await evolution.desconectar(instanciaDe(estudio));
    res.json({ ok: true, r });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

router.post('/enviar-prueba', auth, requireRol('ADMIN', 'CONTADOR'), async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;
    if (!telefono) return res.status(400).json({ error: 'telefono requerido' });
    const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
    const r = await evolution.enviarTexto(telefono, mensaje || '✅ Mensaje de prueba del estudio contable. El bot está conectado.', instanciaDe(estudio));
    res.json({ ok: true, r });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// Guardar config del bot (operadores autorizados, número).
router.put('/config', auth, requireRol('ADMIN', 'CONTADOR'), async (req, res) => {
  try {
    const { waNumero, waOperadores, waInstance } = req.body;
    const estudio = await prisma.estudio.update({
      where: { id: req.usuario.estudioId },
      data: {
        ...(waNumero !== undefined ? { waNumero } : {}),
        ...(waOperadores !== undefined ? { waOperadores } : {}),
        ...(waInstance !== undefined ? { waInstance } : {}),
      },
    });
    res.json({ ok: true, waNumero: estudio.waNumero, waOperadores: estudio.waOperadores, waInstance: estudio.waInstance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
