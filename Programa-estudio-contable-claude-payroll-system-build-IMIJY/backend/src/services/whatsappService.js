/**
 * Servicio de envío de WhatsApp.
 *
 * Soporta 3 providers via adapter pattern. Se elige con `WHATSAPP_PROVIDER`:
 *   - 'twilio': API de Twilio (Sandbox para dev, número aprobado para prod)
 *   - 'meta':   Meta Cloud API directa (requiere número verificado)
 *   - 'mock':   default — loguea el mensaje sin enviar nada (útil para dev)
 *
 * No agrega dependencias npm: usa fetch nativo (Node 18+).
 *
 * Para Twilio:
 *   WHATSAPP_PROVIDER=twilio
 *   TWILIO_ACCOUNT_SID=ACxxxxxx
 *   TWILIO_AUTH_TOKEN=...
 *   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   (sandbox o número aprobado)
 *
 * Para Meta Cloud API:
 *   WHATSAPP_PROVIDER=meta
 *   META_WHATSAPP_TOKEN=EAAxxxxxxxx
 *   META_WHATSAPP_PHONE_NUMBER_ID=10xxxxxxxxxx
 */

const logger = require('../utils/logger');

const PROVIDER = (process.env.WHATSAPP_PROVIDER || 'mock').toLowerCase();

function normalizarTelefono(tel) {
  // Quita espacios, paréntesis, guiones; asume formato internacional
  let limpio = String(tel || '').replace(/[\s\-\(\)]/g, '');
  // Argentina default: si empieza con 0 o no tiene +, asumir +54
  if (!limpio.startsWith('+')) {
    if (limpio.startsWith('54')) limpio = '+' + limpio;
    else if (limpio.startsWith('0')) limpio = '+54' + limpio.slice(1);
    else if (limpio.startsWith('9')) limpio = '+54' + limpio;
    else if (limpio.length >= 10) limpio = '+54' + limpio;
  }
  return limpio;
}

/**
 * Envía un mensaje de WhatsApp con texto y opcionalmente un PDF adjunto.
 *
 * @param {object} opts
 * @param {string} opts.telefono       Teléfono destino (con o sin formato internacional)
 * @param {string} opts.mensaje        Texto del mensaje
 * @param {Buffer|null} opts.pdfBuffer Buffer del PDF (opcional)
 * @param {string} opts.pdfNombre      Nombre del archivo PDF
 * @param {string} opts.pdfUrl         URL pública del PDF (para providers que requieren URL en vez de buffer)
 * @returns {Promise<{ok: boolean, providerId?: string, mensaje?: string}>}
 */
async function enviarMensaje(opts) {
  const tel = normalizarTelefono(opts.telefono);
  if (!tel) throw new Error('Teléfono inválido');

  switch (PROVIDER) {
    case 'twilio': return enviarConTwilio(tel, opts);
    case 'meta':   return enviarConMeta(tel, opts);
    case 'mock':
    default:       return enviarMock(tel, opts);
  }
}

// ── Mock provider (default) ────────────────────────────────────────────────
async function enviarMock(telefono, opts) {
  logger.info(`[WhatsApp MOCK] → ${telefono}: ${opts.mensaje?.slice(0, 80)}...${opts.pdfBuffer ? ' [+PDF]' : ''}`);
  return { ok: true, providerId: `mock-${Date.now()}`, provider: 'mock' };
}

// ── Twilio provider ────────────────────────────────────────────────────────
async function enviarConTwilio(telefono, opts) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    throw new Error('Twilio no configurado: faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_WHATSAPP_FROM');
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  const body = new URLSearchParams({
    To: `whatsapp:${telefono}`,
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    Body: opts.mensaje,
  });

  // Twilio requiere URL pública para el adjunto, no acepta buffers
  if (opts.pdfUrl) body.append('MediaUrl', opts.pdfUrl);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Twilio ${resp.status}: ${data.message || JSON.stringify(data).slice(0, 200)}`);
  }
  return { ok: true, providerId: data.sid, provider: 'twilio', status: data.status };
}

// ── Meta Cloud API provider ────────────────────────────────────────────────
async function enviarConMeta(telefono, opts) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    throw new Error('Meta WhatsApp no configurado: faltan META_WHATSAPP_TOKEN o META_WHATSAPP_PHONE_NUMBER_ID');
  }

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  // Quitar el + para Meta (espera sólo dígitos)
  const to = telefono.replace(/^\+/, '');

  // Meta requiere "template" para iniciar conversación. Como simplificación, usamos
  // mensaje de texto (sólo funciona si ya hay conversación abierta o es respuesta
  // dentro de las 24h). Para envío masivo proactivo: usar template aprobado.
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: opts.mensaje },
  };

  // Si hay PDF y URL pública, enviar como documento
  if (opts.pdfUrl) {
    payload.type = 'document';
    payload.document = {
      link: opts.pdfUrl,
      filename: opts.pdfNombre || 'documento.pdf',
      caption: opts.mensaje,
    };
    delete payload.text;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Meta ${resp.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`);
  }
  const id = data.messages?.[0]?.id;
  return { ok: true, providerId: id, provider: 'meta' };
}

/**
 * Helper alto nivel: envía un recibo de sueldo por WhatsApp.
 * Construye el texto y delega en enviarMensaje.
 */
async function enviarRecibo({ telefono, empleadoNombre, periodo, neto, pdfBuffer, pdfUrl, pdfNombre, estudioNombre }) {
  const mensaje =
    `Hola ${empleadoNombre} 👋\n\n` +
    `Te enviamos tu recibo de sueldo del período *${periodo}*.\n` +
    `Neto a cobrar: *$${Number(neto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}*\n\n` +
    `Cualquier consulta, respondé este mensaje.\n` +
    (estudioNombre ? `\n_${estudioNombre}_` : '');

  return enviarMensaje({ telefono, mensaje, pdfBuffer, pdfUrl, pdfNombre });
}

module.exports = { enviarMensaje, enviarRecibo, normalizarTelefono, PROVIDER };
