/**
 * Servicio unificado de emisión de comprobantes electrónicos AFIP/ARCA.
 *
 * Reemplaza al viejo afipWsfeService (firmado CMS casero que ARCA rechazaba)
 * usando @afipsdk/afip.js (WSAA + WSFEv1 reales) en HOMOLOGACION y PRODUCCION,
 * y manteniendo el modo SIMULADO para trabajar sin certificado.
 *
 * Además provee:
 *   - esErrorConectividad(): clasifica errores para encolar comprobantes
 *     cuando ARCA está caído (estilo Facturitas) en vez de fallar.
 *   - generarQRUrl(): payload del QR fiscal según RG 4892/2020.
 *
 * CbteTipo: 1=FA, 2=NDA, 3=NCA, 6=FB, 7=NDB, 8=NCB, 11=FC, 12=NDC, 13=NCC
 */
const Afip = require('@afipsdk/afip.js');
const path = require('path');
const fs = require('fs');

const CERTS_DIR = path.join(process.cwd(), 'certs');

// Instancias cacheadas por cuit+ambiente (el TA de WSAA dura 12hs y el SDK lo cachea)
const instancias = {};

function getInstancia(config) {
  const cuit = String(config.cuit || '').replace(/-/g, '');
  const produccion = config.ambiente === 'PRODUCCION';
  const cacheKey = `${cuit}_${produccion ? 'prod' : 'homo'}`;
  if (instancias[cacheKey]) return instancias[cacheKey];

  const opts = { CUIT: parseInt(cuit, 10), production: produccion };

  if (config.certificado && config.clavePrivada) {
    if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });
    const certPath = path.join(CERTS_DIR, `${cacheKey}.crt`);
    const keyPath = path.join(CERTS_DIR, `${cacheKey}.key`);
    fs.writeFileSync(certPath, config.certificado, 'utf8');
    fs.writeFileSync(keyPath, config.clavePrivada, 'utf8');
    opts.cert = certPath;
    opts.key = keyPath;
  }

  const instancia = new Afip(opts);
  instancias[cacheKey] = instancia;
  return instancia;
}

/** Condición IVA del receptor → id de AFIP (RG 5616, obligatorio desde 2025) */
const CONDICION_IVA_RECEPTOR = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTISTA: 6,
  NO_RESPONSABLE: 7,
};

function fechaAfip(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${day}`, 10);
}

/**
 * Emite un comprobante electrónico y devuelve { cae, caeFchVto, nroComprobante, simulado }.
 *
 * @param {object} config  { cuit, ambiente: 'SIMULADO'|'HOMOLOGACION'|'PRODUCCION', certificado, clavePrivada }
 * @param {object} datos   {
 *   ptoVta, cbteTipo, concepto (1|2|3), docTipo (80 CUIT|86 CUIL|96 DNI|99 CF), docNro,
 *   neto, iva, total, fecha?,
 *   ivaAlicuotas?: [{ Id, BaseImp, Importe }],   // discriminación por alícuota (no para Factura C)
 *   condicionIVAReceptor?: 'RESPONSABLE_INSCRIPTO'|'MONOTRIBUTISTA'|'CONSUMIDOR_FINAL'|...
 * }
 */
async function emitirComprobante(config, datos) {
  const esSimulado = config.ambiente === 'SIMULADO' || (!config.certificado && !config.clavePrivada);
  if (esSimulado) return emitirSimulado(datos);

  const afip = getInstancia(config);
  const ptoVta = Number(datos.ptoVta || 1);
  const cbteTipo = Number(datos.cbteTipo);

  const ultimo = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
  const nroComprobante = (Number(ultimo) || 0) + 1;

  const fch = fechaAfip(datos.fecha ? new Date(datos.fecha) : new Date());
  const docNro = String(datos.docNro || '0').replace(/[^\d]/g, '') || '0';
  const docTipo = Number(datos.docTipo || (docNro.length === 11 ? 80 : 99));
  const esServicio = Number(datos.concepto || 1) !== 1;

  const payload = {
    CantReg: 1,
    PtoVta: ptoVta,
    CbteTipo: cbteTipo,
    Concepto: Number(datos.concepto || 1),
    DocTipo: docTipo,
    DocNro: docTipo === 99 ? 0 : parseInt(docNro, 10),
    CbteDesde: nroComprobante,
    CbteHasta: nroComprobante,
    CbteFch: fch,
    ImpTotal: round2(datos.total),
    ImpTotConc: 0,
    ImpNeto: round2(datos.neto),
    ImpOpEx: 0,
    ImpIVA: round2(datos.iva),
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId:
      CONDICION_IVA_RECEPTOR[String(datos.condicionIVAReceptor || '').toUpperCase()]
      || (docTipo === 99 ? 5 : 1),
  };

  // Servicios requieren período facturado y vencimiento de pago
  if (esServicio) {
    payload.FchServDesde = fch;
    payload.FchServHasta = fch;
    payload.FchVtoPago = fch;
  }

  // Factura C (11/12/13) no discrimina IVA
  const esTipoC = [11, 12, 13].includes(cbteTipo);
  if (!esTipoC && datos.ivaAlicuotas?.length) {
    payload.Iva = datos.ivaAlicuotas.map(a => ({
      Id: Number(a.Id || a.ivaId),
      BaseImp: round2(a.BaseImp ?? a.baseImp),
      Importe: round2(a.Importe ?? a.importe),
    })).filter(a => a.BaseImp > 0 || a.Importe > 0);
  }
  if (esTipoC) {
    payload.ImpNeto = round2(datos.total); // en C el "neto" es el total
    payload.ImpIVA = 0;
  }

  const resp = await afip.ElectronicBilling.createVoucher(payload);

  return {
    cae: resp.CAE,
    caeFchVto: String(resp.CAEFchVto || '').replace(/-/g, ''),
    nroComprobante,
    ptoVta,
    cbteTipo,
    simulado: false,
    raw: resp,
  };
}

function emitirSimulado(datos) {
  const cae = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  const vto = new Date(Date.now() + 10 * 86400000);
  return {
    cae,
    caeFchVto: String(fechaAfip(vto)),
    nroComprobante: null, // lo asigna el caller con la secuencia local
    ptoVta: Number(datos.ptoVta || 1),
    cbteTipo: Number(datos.cbteTipo),
    simulado: true,
  };
}

/**
 * Devuelve el último número autorizado en ARCA para un pto de venta y tipo.
 */
async function ultimoAutorizado(config, ptoVta, cbteTipo) {
  const afip = getInstancia(config);
  const ultimo = await afip.ElectronicBilling.getLastVoucher(Number(ptoVta), Number(cbteTipo));
  return Number(ultimo) || 0;
}

/**
 * ¿El error es de conectividad/caída de ARCA (reintetable) o un rechazo real?
 * Si es de conectividad, el comprobante se encola (estado PENDIENTE_CAE) y un
 * cron lo reintenta — la factura "sale igual" aunque ARCA esté caído.
 */
function esErrorConectividad(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return [
    'timeout', 'timedout', 'econnrefused', 'econnreset', 'enotfound', 'eai_again',
    'socket hang up', 'network', 'fetch failed', '502', '503', '504',
    'service unavailable', 'no disponible', 'temporarily',
  ].some(t => msg.includes(t));
}

/**
 * URL del QR fiscal (RG 4892/2020) que debe imprimirse en el comprobante.
 * @param {object} p { fecha: Date, cuitEmisor, ptoVta, cbteTipo, nroComprobante,
 *                     importe, docTipo, docNro, cae }
 */
function generarQRUrl(p) {
  const payload = {
    ver: 1,
    fecha: new Date(p.fecha).toISOString().slice(0, 10),
    cuit: parseInt(String(p.cuitEmisor).replace(/-/g, ''), 10),
    ptoVta: Number(p.ptoVta),
    tipoCmp: Number(p.cbteTipo),
    nroCmp: Number(p.nroComprobante),
    importe: round2(p.importe),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: Number(p.docTipo || 99),
    nroDocRec: parseInt(String(p.docNro || '0').replace(/[^\d]/g, '') || '0', 10),
    tipoCodAut: 'E',
    codAut: parseInt(String(p.cae), 10),
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = {
  emitirComprobante,
  ultimoAutorizado,
  esErrorConectividad,
  generarQRUrl,
  CONDICION_IVA_RECEPTOR,
};
