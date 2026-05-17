/**
 * Servicio de integración con AFIP Web Services.
 *
 * Usa @afipsdk/afip.js para conectarse a los WS de AFIP.
 * Por defecto apunta a HOMOLOGACIÓN (testing). Para producción,
 * setear AFIP_PRODUCTION=true en variables de entorno.
 *
 * Certificados: se cargan desde variables de entorno o desde el
 * campo afipCertificado/afipClavePrivada del modelo Estudio en BD.
 */

const Afip = require('@afipsdk/afip.js');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

// ── Logger ──────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `${timestamp} [afipService] ${level.toUpperCase()}: ${message}${extra}`;
    })
  ),
  transports: [new winston.transports.Console({ silent: process.env.NODE_ENV === 'test' })],
});

// ── Directorio de certificados ───────────────────────────────────────────────
const CERTS_DIR = path.join(process.cwd(), 'certs');
if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

// ── Caché de instancias Afip por CUIT ────────────────────────────────────────
//    Evita crear una instancia nueva en cada request (la autenticación WSAA
//    genera un Ticket de Acceso válido por 12 hs que se cachea internamente).
const instancias = {};

/**
 * Obtiene (o crea) una instancia de Afip para el CUIT dado.
 *
 * @param {string} cuit          CUIT del estudio/empresa (sin guiones)
 * @param {string|null} cert     Contenido PEM del certificado (opcional, usa env si no se pasa)
 * @param {string|null} key      Contenido PEM de la clave privada (opcional)
 * @returns {Afip}
 */
function getAfipInstance(cuit, cert = null, key = null) {
  const cuitLimpio = String(cuit).replace(/-/g, '');
  const esProduccion = process.env.AFIP_PRODUCTION === 'true';
  const cacheKey = `${cuitLimpio}_${esProduccion ? 'prod' : 'homo'}`;

  if (instancias[cacheKey]) return instancias[cacheKey];

  // Resolver certificado: parámetro → env → archivo en ./certs/
  const certContent = cert
    || process.env.AFIP_CERT
    || leerArchivoSiExiste(path.join(CERTS_DIR, `${cuitLimpio}.crt`));

  const keyContent = key
    || process.env.AFIP_KEY
    || leerArchivoSiExiste(path.join(CERTS_DIR, `${cuitLimpio}.key`));

  const config = {
    CUIT: parseInt(cuitLimpio, 10),
    production: esProduccion,
  };

  // Si hay certificados, escribirlos temporalmente para que afipsdk los lea
  if (certContent && keyContent) {
    const certPath = path.join(CERTS_DIR, `${cuitLimpio}_tmp.crt`);
    const keyPath = path.join(CERTS_DIR, `${cuitLimpio}_tmp.key`);
    fs.writeFileSync(certPath, certContent, 'utf8');
    fs.writeFileSync(keyPath, keyContent, 'utf8');
    config.cert = certPath;
    config.key = keyPath;
    logger.info('Certificados cargados para instancia AFIP', { cuit: cuitLimpio, produccion: esProduccion });
  } else {
    logger.warn('Sin certificados — solo funciones que no requieren autenticación estarán disponibles', { cuit: cuitLimpio });
  }

  const instancia = new Afip(config);
  instancias[cacheKey] = instancia;
  return instancia;
}

function leerArchivoSiExiste(ruta) {
  try { return fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null; } catch { return null; }
}

// ── PADRÓN — Consulta de CUIT (Scope 5 / ws_sr_padron_a5) ───────────────────

/**
 * Consulta el Padrón AFIP (Scope 5) para obtener razón social y domicilio
 * a partir de un CUIT. No requiere certificado propio en homologación para
 * CUITs de prueba; en producción sí lo requiere.
 *
 * @param {string} cuitConsulta   CUIT a buscar (con o sin guiones)
 * @param {string} cuitEstudio    CUIT del estudio que realiza la consulta
 * @param {string|null} cert      Cert PEM (opcional)
 * @param {string|null} key       Key PEM (opcional)
 * @returns {Promise<{
 *   cuit: string,
 *   razonSocial: string,
 *   domicilio: string,
 *   condicionIVA: string,
 *   estado: string,
 *   raw: object
 * }>}
 */
async function consultarCUIT(cuitConsulta, cuitEstudio, cert = null, key = null) {
  const cuitBuscado = String(cuitConsulta).replace(/-/g, '');
  const cuitEst = String(cuitEstudio).replace(/-/g, '');

  if (!/^\d{11}$/.test(cuitBuscado)) {
    throw Object.assign(new Error(`CUIT inválido: ${cuitConsulta}`), { statusCode: 400 });
  }

  logger.info('Consultando CUIT en Padrón AFIP A13', { cuitBuscado, cuitEstudio: cuitEst });

  try {
    const afip = getAfipInstance(cuitEst, cert, key);

    // Padrón A13 (alcance 13) — más completo que A5/A4: incluye actividades,
    // régimen, monotributo, IVA y datos consolidados. Caemos a A5 si no hay
    // permisos para A13 en homologación.
    let datos;
    try {
      datos = await afip.RegisterScopeThirteen.getTaxpayerDetails(parseInt(cuitBuscado, 10));
      logger.info('Datos obtenidos de Padrón A13', { cuitBuscado });
    } catch (errA13) {
      logger.warn('A13 no disponible, fallback a A5', { error: errA13.message });
      datos = await afip.RegisterScopeFive.GetTaxpayerDetails(parseInt(cuitBuscado, 10));
    }

    if (!datos || !datos.datosGenerales) {
      throw Object.assign(new Error(`CUIT ${cuitBuscado} no encontrado en el padrón AFIP`), { statusCode: 404 });
    }

    const gen = datos.datosGenerales;

    // A13 puede devolver el domicilio como array de objetos (por orden de relevancia
    // — fiscal, legal, etc.) o como un único `domicilioFiscal`. Soportamos ambos.
    const domFiscal = gen.domicilioFiscal
      || (Array.isArray(gen.domicilio) ? gen.domicilio[0] : gen.domicilio)
      || {};

    const razonSocial = gen.razonSocial
      || `${gen.apellido || ''} ${gen.nombre || ''}`.trim()
      || 'Sin denominación';

    const domicilio = [
      `${domFiscal.direccion || ''} ${domFiscal.numero || ''}`.trim(),
      domFiscal.localidad,
      domFiscal.descripcionProvincia || domFiscal.idProvincia,
      domFiscal.codigoPostal,
    ].filter(Boolean).join(', ');

    // Condición IVA desde categorías de monotributo o RI
    const condicionIVA = extraerCondicionIVA(datos);

    const resultado = {
      cuit: cuitBuscado,
      razonSocial: razonSocial.trim(),
      nombreFantasia: gen.nombreFantasia || null,
      domicilio,
      localidad: domFiscal.localidad || null,
      provincia: domFiscal.descripcionProvincia || null,
      codigoPostal: domFiscal.codigoPostal || null,
      condicionIVA,
      tipoPersona: gen.tipoPersona || (gen.apellido ? 'FISICA' : 'JURIDICA'),
      tipoClave: gen.tipoClave || 'CUIT',
      estado: gen.estadoClave || 'ACTIVO',
      raw: datos,
    };

    logger.info('CUIT consultado exitosamente', { cuit: cuitBuscado, razonSocial: resultado.razonSocial });
    return resultado;

  } catch (err) {
    if (err.statusCode) throw err;

    // Errores de AFIP (servicio no disponible, timeout, etc.)
    const msg = err.message || String(err);
    logger.error('Error consultando AFIP Padrón', { cuitBuscado, error: msg });

    if (msg.includes('WSAA') || msg.includes('Token') || msg.includes('certificate')) {
      throw Object.assign(
        new Error('Error de autenticación AFIP. Verificá el certificado y clave privada.'),
        { statusCode: 503 }
      );
    }
    throw Object.assign(new Error(`Error al consultar AFIP: ${msg}`), { statusCode: 502 });
  }
}

function extraerCondicionIVA(datos) {
  try {
    const actividades = datos.datosMonotributo?.categoriaMonotributo;
    if (actividades) return 'MONOTRIBUTISTA';
    const impuestos = datos.datosRegimenGeneral?.impuesto || [];
    const tieneIVA = impuestos.some(i => i?.idImpuesto === 30);
    return tieneIVA ? 'RESPONSABLE_INSCRIPTO' : 'EXENTO';
  } catch {
    return 'NO_CATEGORIZADO';
  }
}

// ── Verificación de estado del servicio ──────────────────────────────────────

/**
 * Ping simple que comprueba conectividad con los servidores de AFIP.
 * No requiere autenticación.
 */
async function verificarConectividad() {
  const esProduccion = process.env.AFIP_PRODUCTION === 'true';
  const host = esProduccion
    ? 'https://serviciosjava.afip.gob.ar'
    : 'https://wsaahomo.afip.gov.ar';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(host, { signal: controller.signal });
    clearTimeout(timer);
    return { disponible: true, ambiente: esProduccion ? 'PRODUCCION' : 'HOMOLOGACION', httpStatus: res.status };
  } catch (err) {
    logger.warn('AFIP no disponible', { host, error: err.message });
    return { disponible: false, ambiente: esProduccion ? 'PRODUCCION' : 'HOMOLOGACION', error: err.message };
  }
}

module.exports = { consultarCUIT, verificarConectividad, getAfipInstance };
