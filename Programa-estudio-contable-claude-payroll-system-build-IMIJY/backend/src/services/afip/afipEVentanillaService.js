/**
 * AFIP E-Ventanilla — Sincronización del Buzón Electrónico AFIP/ARCA.
 *
 * Notas técnicas:
 *  - AFIP no publica un WS "estándar" para descargar mensajes del e-ventanilla.
 *    El acceso oficial es vía clave fiscal en el portal web. Algunas
 *    implementaciones usan scraping autenticado o el servicio "WS_DOMICILIO_FISCAL"
 *    (en homologación pocas veces disponible).
 *  - Esta implementación usa @afipsdk/afip.js cuando expone notificaciones
 *    (a través de WebService genérico). Si el servicio no responde,
 *    devuelve [] sin romper. La lógica de DB / cron sigue funcionando.
 *  - Para producción real: integrar con servicio de scraping externo
 *    (ej. https://afipsdk.com/ tiene endpoints para esto) o reemplazar
 *    la función `fetchMensajesDesdeAfip` por una llamada directa.
 *
 * Pasos para activar real:
 *   1) AFIP_PRODUCTION=true
 *   2) Cert + key configurados (afipService.getAfipInstance)
 *   3) Implementar fetchMensajesDesdeAfip si el SDK no lo soporta nativamente.
 */

const prisma = require('../../lib/prisma');
const logger = require('../../utils/logger');
const { getAfipInstance } = require('./afipService');

// Clasificación heurística por asunto/cuerpo → prioridad
const PALABRAS_CRITICAS = ['intimación', 'intimacion', 'embargo', 'requerimiento urgente', 'multa', 'cautelar'];
const PALABRAS_ALTAS = ['requerimiento', 'vencimiento', 'inscripción', 'inscripcion', 'inspección', 'inspeccion'];

function clasificarPrioridad(asunto = '', cuerpo = '') {
  const txt = `${asunto} ${cuerpo}`.toLowerCase();
  if (PALABRAS_CRITICAS.some(p => txt.includes(p))) return 'CRITICA';
  if (PALABRAS_ALTAS.some(p => txt.includes(p))) return 'ALTA';
  return 'NORMAL';
}

function clasificarCategoria(asunto = '') {
  const a = asunto.toLowerCase();
  if (a.includes('intim')) return 'INTIMACION';
  if (a.includes('requerimiento')) return 'REQUERIMIENTO';
  if (a.includes('vencimiento')) return 'VENCIMIENTO';
  if (a.includes('inscrip')) return 'INSCRIPCION';
  return 'INFORMATIVA';
}

/**
 * Descarga los mensajes de e-ventanilla para una empresa.
 * Devuelve un array de objetos normalizados o [] si el servicio no está disponible.
 *
 * Si AFIPSDK_API_KEY está definido y AFIPSDK_API_BASE apunta al servicio
 * cloud de afipsdk.com, usa su endpoint /api/v1/afip/electronic-mailbox/messages.
 * Sino, intenta el método nativo del SDK (puede no estar implementado).
 */
async function fetchMensajesDesdeAfip(estudio, empresa) {
  // 1) Vía API cloud de afipsdk.com (la más estable para e-ventanilla)
  if (process.env.AFIPSDK_API_KEY) {
    return fetchViaAfipSdkCloud(empresa);
  }

  // 2) Intento nativo via afip.js — depende de la versión del SDK
  try {
    const cuit = (estudio.cuit || '').replace(/-/g, '');
    const afip = getAfipInstance(cuit);
    // En afip.js esto puede no existir según la versión; lo invocamos defensivamente
    if (afip?.EVentanilla?.getMessages) {
      const mensajes = await afip.EVentanilla.getMessages(parseInt((empresa.cuit || '').replace(/-/g, ''), 10));
      return Array.isArray(mensajes) ? mensajes : [];
    }
  } catch (err) {
    logger.warn?.(`[EVentanilla] SDK nativo no disponible: ${err.message}`);
  }

  return [];
}

async function fetchViaAfipSdkCloud(empresa) {
  const base = process.env.AFIPSDK_API_BASE || 'https://app.afipsdk.com';
  const cuit = (empresa.cuit || '').replace(/-/g, '');
  if (!/^\d{11}$/.test(cuit)) return [];

  try {
    const url = `${base}/api/v1/afip/electronic-mailbox/messages?cuit_representado=${cuit}`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.AFIPSDK_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    if (!resp.ok) {
      logger.warn?.(`[EVentanilla] AfipSDK respondió ${resp.status} para CUIT ${cuit}`);
      return [];
    }
    const json = await resp.json();
    return (json?.messages || json?.data || []).map(normalizarMensajeAfipSdk);
  } catch (err) {
    logger.error?.(`[EVentanilla] error AfipSDK cloud: ${err.message}`);
    return [];
  }
}

function normalizarMensajeAfipSdk(m) {
  return {
    mensajeIdAfip: m.id || m.messageId || m.codigo,
    asunto: m.subject || m.asunto || m.titulo || '(sin asunto)',
    cuerpo: m.body || m.cuerpo || m.contenido || null,
    origen: m.from || m.origen || m.organismo || 'AFIP',
    fechaAfip: new Date(m.date || m.fecha || m.createdAt || Date.now()),
    urlOriginal: m.url || m.linkOriginal || null,
    raw: m,
  };
}

/**
 * Sincroniza mensajes para una empresa: descarga del WS, guarda los nuevos
 * en DB (idempotente vía unique [empresaId, mensajeIdAfip]).
 * Devuelve { nuevos, total }.
 */
async function sincronizarEmpresa(estudio, empresa) {
  const mensajes = await fetchMensajesDesdeAfip(estudio, empresa);
  if (mensajes.length === 0) return { nuevos: 0, total: 0 };

  let nuevos = 0;
  for (const m of mensajes) {
    const prioridad = clasificarPrioridad(m.asunto, m.cuerpo);
    const categoria = clasificarCategoria(m.asunto);
    try {
      await prisma.notificacionAfip.upsert({
        where: {
          empresaId_mensajeIdAfip: {
            empresaId: empresa.id,
            mensajeIdAfip: m.mensajeIdAfip || '',
          },
        },
        create: {
          empresaId: empresa.id,
          mensajeIdAfip: m.mensajeIdAfip || `${empresa.id}_${m.fechaAfip.getTime()}`,
          asunto: m.asunto,
          cuerpo: m.cuerpo,
          origen: m.origen,
          prioridad,
          categoria,
          fechaAfip: m.fechaAfip,
          urlOriginal: m.urlOriginal,
          raw: m.raw,
        },
        // Si ya existe, no la actualizamos (no queremos marcar como no-leídas mensajes ya leídos)
        update: {},
      });
      nuevos++;
    } catch (err) {
      logger.warn?.(`[EVentanilla] no se pudo guardar mensaje: ${err.message}`);
    }
  }

  return { nuevos, total: mensajes.length };
}

/**
 * Sincroniza todas las empresas de todos los estudios.
 * Pensado para correr desde un cron diario.
 */
async function sincronizarTodos() {
  const estudios = await prisma.estudio.findMany({
    include: { empresas: { where: { activa: true } } },
  });
  const resultado = [];
  for (const estudio of estudios) {
    for (const empresa of estudio.empresas) {
      if (!empresa.cuit) continue;
      try {
        const r = await sincronizarEmpresa(estudio, empresa);
        resultado.push({ empresa: empresa.razonSocial, ...r });
      } catch (err) {
        resultado.push({ empresa: empresa.razonSocial, error: err.message });
      }
    }
  }
  return resultado;
}

module.exports = {
  fetchMensajesDesdeAfip,
  sincronizarEmpresa,
  sincronizarTodos,
};
