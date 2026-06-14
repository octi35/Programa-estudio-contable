/**
 * Cliente de Evolution API (https://github.com/EvolutionAPI/evolution-api).
 *
 * Evolution API es un gateway de WhatsApp self-hosted que usa el protocolo de
 * WhatsApp Web (Baileys). Al conectarse con un número real escaneando un QR,
 * el riesgo de baneo es mucho menor que con APIs no oficiales que falsean
 * el dispositivo. Para producción seria conviene igual la Cloud API de Meta,
 * pero para empezar (y para números argentinos de prueba) Evolution es ideal.
 *
 * Configuración (env):
 *   EVOLUTION_API_URL   ej: http://localhost:8080  (o la URL pública del server)
 *   EVOLUTION_API_KEY   la AUTHENTICATION_API_KEY global de Evolution
 *   EVOLUTION_INSTANCE  nombre de instancia por defecto (ej: "estudio")
 *
 * Apunta a Evolution API v2. Usa fetch nativo (Node 18+), sin dependencias.
 */

const logger = require('../../utils/logger');

const BASE_URL = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
const API_KEY = process.env.EVOLUTION_API_KEY || '';
const DEFAULT_INSTANCE = process.env.EVOLUTION_INSTANCE || 'estudio';

function habilitado() {
  return Boolean(API_KEY && BASE_URL);
}

/** Convierte un teléfono a JID de WhatsApp (sólo dígitos + dominio). */
function aJid(numero) {
  const limpio = String(numero || '').replace(/\D/g, '');
  return limpio.includes('@') ? numero : `${limpio}@s.whatsapp.net`;
}

/** Extrae sólo el número (dígitos) de un JID o teléfono. */
function aNumero(jidOTelefono) {
  return String(jidOTelefono || '').replace(/@.*/, '').replace(/\D/g, '');
}

async function request(method, ruta, body) {
  if (!habilitado()) {
    throw Object.assign(new Error('Evolution API no configurada (faltan EVOLUTION_API_URL / EVOLUTION_API_KEY)'), { statusCode: 503 });
  }
  const url = `${BASE_URL}${ruta}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const texto = await resp.text();
    let data;
    try { data = texto ? JSON.parse(texto) : {}; } catch { data = { raw: texto }; }
    if (!resp.ok) {
      const msg = data?.response?.message || data?.message || data?.error || texto.slice(0, 200);
      throw Object.assign(new Error(`Evolution ${resp.status}: ${Array.isArray(msg) ? msg.join('; ') : msg}`), { statusCode: resp.status });
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// ── Mensajería ──────────────────────────────────────────────────────────────

/** Envía un mensaje de texto. */
async function enviarTexto(numero, texto, instance = DEFAULT_INSTANCE) {
  return request('POST', `/message/sendText/${instance}`, {
    number: aNumero(numero),
    text: texto,
  });
}

/**
 * Envía un documento/imagen.
 * @param {object} opts { numero, media (base64 o URL), fileName, caption, mimetype, mediatype }
 */
async function enviarMedia(numero, { media, fileName, caption, mimetype = 'application/pdf', mediatype = 'document' }, instance = DEFAULT_INSTANCE) {
  return request('POST', `/message/sendMedia/${instance}`, {
    number: aNumero(numero),
    mediatype,
    mimetype,
    media,
    fileName,
    caption,
  });
}

/** Marca "escribiendo..." para dar feedback humano antes de responder. */
async function presencia(numero, instance = DEFAULT_INSTANCE, estado = 'composing', delay = 1200) {
  try {
    await request('POST', `/chat/sendPresence/${instance}`, {
      number: aNumero(numero),
      presence: estado,
      delay,
    });
  } catch (e) {
    // No es crítico; logueamos y seguimos.
    logger.debug?.(`[evolution] presencia falló: ${e.message}`);
  }
}

/**
 * Marca como leído el mensaje entrante (doble tilde azul). Es una señal de
 * comportamiento humano que reduce el riesgo de baneo: los números que reciben
 * y nunca "leen" parecen bots/spam.
 * @param {object} key  La key del mensaje de WhatsApp: { remoteJid, fromMe, id }
 */
async function marcarLeido(key, instance = DEFAULT_INSTANCE) {
  if (!key?.id || !key?.remoteJid) return;
  try {
    await request('POST', `/chat/markMessageAsRead/${instance}`, {
      readMessages: [{ remoteJid: key.remoteJid, fromMe: !!key.fromMe, id: key.id }],
    });
  } catch (e) {
    logger.debug?.(`[evolution] markRead falló: ${e.message}`);
  }
}

// ── Administración de instancia ──────────────────────────────────────────────

/** Crea la instancia (idempotente: si ya existe, Evolution devuelve 403/409). */
async function crearInstancia(instance = DEFAULT_INSTANCE, webhookUrl = null) {
  const body = {
    instanceName: instance,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  };
  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    };
  }
  return request('POST', '/instance/create', body);
}

/** Devuelve el QR (base64) para vincular el número. */
async function obtenerQR(instance = DEFAULT_INSTANCE) {
  return request('GET', `/instance/connect/${instance}`);
}

/** Estado de conexión: open | connecting | close. */
async function estadoConexion(instance = DEFAULT_INSTANCE) {
  return request('GET', `/instance/connectionState/${instance}`);
}

/** (Re)configura el webhook de la instancia. */
async function configurarWebhook(instance = DEFAULT_INSTANCE, url) {
  return request('POST', `/webhook/set/${instance}`, {
    webhook: {
      enabled: true,
      url,
      byEvents: false,
      base64: true,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    },
  });
}

/** Desconecta (logout) la sesión de WhatsApp sin borrar la instancia. */
async function desconectar(instance = DEFAULT_INSTANCE) {
  return request('DELETE', `/instance/logout/${instance}`);
}

module.exports = {
  habilitado,
  aJid,
  aNumero,
  enviarTexto,
  enviarMedia,
  presencia,
  marcarLeido,
  crearInstancia,
  obtenerQR,
  estadoConexion,
  configurarWebhook,
  desconectar,
  DEFAULT_INSTANCE,
  BASE_URL,
};
