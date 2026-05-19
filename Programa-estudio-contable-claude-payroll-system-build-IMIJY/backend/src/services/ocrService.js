// Servicio de OCR para comprobantes IVA.
//
// Arquitectura de adapter: el provider se elige por configuración (env).
// Si no hay provider configurado / disponible, devuelve `{ requiereManual: true }`
// para que el frontend muestre el formulario vacío sin romper.
//
// Providers soportados:
//   - 'aws':       AWS Textract (requiere @aws-sdk/client-textract + credenciales)
//   - 'tesseract': tesseract.js local (requiere instalar la dependencia)
//   - 'manual':    no extrae nada (default)
//
// Para activar OCR real:
//   1) AWS: instalar @aws-sdk/client-textract, setear OCR_PROVIDER=aws +
//      AWS_REGION + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
//   2) Tesseract: instalar tesseract.js, setear OCR_PROVIDER=tesseract

const logger = require('../utils/logger');

const PROVIDER = (process.env.OCR_PROVIDER || 'manual').toLowerCase();

/**
 * Extrae campos del comprobante de un buffer (PDF o imagen).
 * Devuelve un objeto con los campos detectados (parciales) + `confianza`.
 * Si no hay provider disponible → `{ requiereManual: true, provider: 'none' }`.
 */
async function extraerDatosComprobante(buffer, opts = {}) {
  switch (PROVIDER) {
    case 'aws':       return extraerConAws(buffer, opts).catch(fallbackManual);
    case 'tesseract': return extraerConTesseract(buffer, opts).catch(fallbackManual);
    case 'manual':
    default:
      return fallbackManual(new Error('OCR_PROVIDER no configurado'));
  }
}

function fallbackManual(err) {
  if (err) logger.warn?.(`[OCR] usando fallback manual: ${err.message}`);
  return {
    requiereManual: true,
    provider: 'none',
    confianza: 0,
    mensaje: 'OCR no configurado. Cargá los datos manualmente.',
    datos: {},
  };
}

// ── Provider: AWS Textract ─────────────────────────────────────────────────
async function extraerConAws(buffer, opts) {
  let TextractClient, AnalyzeExpenseCommand;
  try {
    ({ TextractClient, AnalyzeExpenseCommand } = require('@aws-sdk/client-textract'));
  } catch (e) {
    throw new Error('Falta instalar @aws-sdk/client-textract en backend/');
  }

  const client = new TextractClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const resp = await client.send(new AnalyzeExpenseCommand({ Document: { Bytes: buffer } }));

  const datos = {};
  const docs = resp.ExpenseDocuments || [];
  if (docs.length === 0) return fallbackManual(new Error('Textract no detectó campos'));

  const summaryFields = docs[0].SummaryFields || [];
  const mapType = {
    INVOICE_RECEIPT_DATE: 'fecha',
    DUE_DATE: 'fecha_vencimiento',
    INVOICE_RECEIPT_ID: 'numero',
    VENDOR_NAME: 'razon_social',
    VENDOR_VAT_NUMBER: 'cuit',
    TAX_PAYER_ID: 'cuit',
    TOTAL: 'total',
    SUBTOTAL: 'neto',
    TAX: 'iva',
  };
  for (const f of summaryFields) {
    const tipo = f.Type?.Text;
    const valor = f.ValueDetection?.Text;
    if (mapType[tipo] && valor) datos[mapType[tipo]] = valor;
  }

  return {
    requiereManual: false,
    provider: 'aws-textract',
    confianza: 'alta',
    datos: normalizarCampos(datos),
  };
}

// ── Provider: Tesseract.js (local, sin API externa) ──────────────────────
async function extraerConTesseract(buffer, opts) {
  let Tesseract;
  try {
    Tesseract = require('tesseract.js');
  } catch (e) {
    throw new Error('Falta instalar tesseract.js en backend/');
  }

  const { data } = await Tesseract.recognize(buffer, 'spa');
  const texto = data.text || '';

  // Extracción heurística por regex (mejor que nada)
  const datos = {};

  const mFecha = texto.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/);
  if (mFecha) datos.fecha = mFecha[1];

  const mCuit = texto.match(/\b(\d{2}[-\s]?\d{8}[-\s]?\d)\b/);
  if (mCuit) datos.cuit = mCuit[1].replace(/[-\s]/g, '');

  const mNum = texto.match(/(?:N[º°ro]+\.?\s*)?(\d{4,5}\s*[-]\s*\d{6,8})/i);
  if (mNum) {
    const partes = mNum[1].split('-').map(s => s.trim());
    datos.pto_venta = parseInt(partes[0], 10);
    datos.numero = parseInt(partes[1], 10);
  }

  const mTotal = texto.match(/total[:\s]+\$?\s*([\d.,]+)/i);
  if (mTotal) datos.total = mTotal[1].replace(/\./g, '').replace(',', '.');

  const mIVA = texto.match(/IVA\s*(?:21\s*%)?[:\s]+\$?\s*([\d.,]+)/i);
  if (mIVA) datos.iva_21 = mIVA[1].replace(/\./g, '').replace(',', '.');

  // Tipo de comprobante
  if (/FACTURA\s+A/i.test(texto)) datos.tipo_comprobante = 'FACTURA_A';
  else if (/FACTURA\s+B/i.test(texto)) datos.tipo_comprobante = 'FACTURA_B';
  else if (/FACTURA\s+C/i.test(texto)) datos.tipo_comprobante = 'FACTURA_C';

  return {
    requiereManual: Object.keys(datos).length === 0,
    provider: 'tesseract',
    confianza: Object.keys(datos).length >= 4 ? 'media' : 'baja',
    datos: normalizarCampos(datos),
    textoCrudo: texto.slice(0, 2000),
  };
}

function normalizarCampos(d) {
  const out = { ...d };
  if (out.fecha) {
    const m = String(out.fecha).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) {
      const yyyy = m[3].length === 2 ? '20' + m[3] : m[3];
      out.fecha = `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
  }
  ['total', 'neto', 'iva', 'iva_21', 'iva_105', 'iva_27'].forEach(k => {
    if (out[k]) out[k] = Number(out[k]) || 0;
  });
  if (out.cuit) out.cuit = String(out.cuit).replace(/[-\s]/g, '');
  return out;
}

module.exports = { extraerDatosComprobante, PROVIDER };
