// Servicio de OCR para comprobantes IVA.
//
// Arquitectura de adapter: el provider se elige por configuración (env).
// Si no hay provider configurado / disponible, devuelve `{ requiereManual: true }`
// para que el frontend muestre el formulario vacío sin romper.
//
// Providers soportados:
//   - 'llama':     visión de Llama vía Groq u otra API compatible (default si
//                  hay LLM_API_KEY/GROQ_API_KEY — tier gratuito en console.groq.com)
//   - 'aws':       AWS Textract (requiere @aws-sdk/client-textract + credenciales)
//   - 'tesseract': tesseract.js local (requiere instalar la dependencia)
//   - 'manual':    no extrae nada (default sin API key)
//
// Para activar OCR real:
//   1) Llama: setear LLM_API_KEY o GROQ_API_KEY (gratis en console.groq.com)
//   2) AWS: instalar @aws-sdk/client-textract, setear OCR_PROVIDER=aws +
//      AWS_REGION + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
//   3) Tesseract: instalar tesseract.js, setear OCR_PROVIDER=tesseract

const logger = require('../utils/logger');

const PROVIDER = (process.env.OCR_PROVIDER
  || ((process.env.LLM_API_KEY || process.env.GROQ_API_KEY) ? 'llama' : 'manual')).toLowerCase();

/**
 * Extrae campos del comprobante de un buffer (PDF o imagen).
 * Devuelve un objeto con los campos detectados (parciales) + `confianza`.
 * Si no hay provider disponible → `{ requiereManual: true, provider: 'none' }`.
 */
async function extraerDatosComprobante(buffer, opts = {}) {
  switch (PROVIDER) {
    case 'llama':     return extraerConLlama(buffer, opts).catch(fallbackManual);
    case 'aws':       return extraerConAws(buffer, opts).catch(fallbackManual);
    case 'tesseract': return extraerConTesseract(buffer, opts).catch(fallbackManual);
    case 'manual':
    default:
      return fallbackManual(new Error('OCR_PROVIDER no configurado'));
  }
}

// ── Provider: Llama (visión, vía Groq u otra API compatible) ───────────────
// Foto de la factura → JSON estructurado listo para el formulario.
// Usa json_object mode para forzar JSON válido. Solo imágenes (JPG/PNG/WebP);
// para PDF, el usuario puede subir una captura o usar carga manual.

const CAMPOS_PROMPT = `{
  "tipo_movimiento": "COMPRA si es factura recibida de un proveedor, VENTA si es emitida, o null",
  "tipo_comprobante": "FACTURA_A | FACTURA_B | FACTURA_C | NOTA_CREDITO_A | NOTA_CREDITO_B | NOTA_CREDITO_C | NOTA_DEBITO_A | NOTA_DEBITO_B | NOTA_DEBITO_C | null",
  "fecha": "fecha de emisión YYYY-MM-DD o null",
  "pto_venta": "punto de venta como entero (los primeros 4-5 dígitos del número, ej 0003 → 3) o null",
  "numero": "número del comprobante como entero (los 8 dígitos después del guión) o null",
  "cuit": "CUIT del emisor, solo 11 dígitos sin guiones, como string, o null",
  "razon_social": "razón social del emisor o null",
  "neto_21": "neto gravado al 21% como número o null",
  "neto_105": "neto gravado al 10.5% como número o null",
  "neto_27": "neto gravado al 27% como número o null",
  "exento": "número o null",
  "no_gravado": "número o null",
  "iva_21": "número o null",
  "iva_105": "número o null",
  "iva_27": "número o null",
  "percep_iva": "percepciones de IVA, número o null",
  "percep_iibb": "percepciones de IIBB, número o null",
  "total": "número o null",
  "confianza": "alta | media | baja según legibilidad"
}`;

async function extraerConLlama(buffer, opts) {
  const { chatCompletion, habilitado, VISION_MODEL } = require('./ia/llmClient');
  if (!habilitado()) throw new Error('LLM_API_KEY / GROQ_API_KEY no configurada');

  const mimeType = opts.mimeType || 'image/jpeg';
  const esPdf = mimeType === 'application/pdf' || (opts.filename || '').toLowerCase().endsWith('.pdf');
  if (esPdf) {
    // Los modelos de visión de Groq aceptan imágenes, no PDFs
    return {
      requiereManual: true,
      provider: 'llama',
      confianza: 0,
      mensaje: 'El OCR con Llama procesa imágenes (JPG/PNG). Subí una foto o captura del comprobante.',
      datos: {},
    };
  }

  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

  const data = await chatCompletion({
    model: VISION_MODEL,
    max_tokens: 1024,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        {
          type: 'text',
          text: 'Sos un contador argentino cargando este comprobante al libro IVA. ' +
            'Extraé los datos fiscales y devolvé SOLO un JSON con exactamente esta estructura:\n' +
            CAMPOS_PROMPT +
            '\nLos importes usan formato argentino (punto de miles, coma decimal): convertilos a número. ' +
            'Si un campo no aparece o no es legible, devolvé null. La letra del comprobante (A/B/C) suele estar en un recuadro arriba al centro. ' +
            'En facturas B y C el IVA no está discriminado: dejá los netos e IVA en null y completá solo el total.',
        },
      ],
    }],
  });

  const texto = data.choices?.[0]?.message?.content;
  if (!texto) throw new Error('Respuesta sin contenido');
  const { confianza, ...datos } = JSON.parse(texto);

  // Quitar nulls para que el form solo pre-llene lo detectado
  const limpios = Object.fromEntries(Object.entries(datos).filter(([, v]) => v != null));

  return {
    requiereManual: Object.keys(limpios).length === 0,
    provider: 'llama',
    confianza: confianza || 'media',
    datos: normalizarCampos(limpios),
  };
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
