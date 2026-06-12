/**
 * Facturación Electrónica AFIP/ARCA — Facturas A/B/C, NC/ND
 * Emisión real via @afipsdk/afip.js (WSAA + WSFEv1), modo SIMULADO sin
 * certificado, y cola offline con reintentos cuando ARCA está caído.
 */
const prisma = require('../lib/prisma');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { auth, requireRol } = require('../middleware/auth');
const emision = require('../services/afip/afipEmisionService');
const { procesarColaFacturacion, configAfipDeEstudio } = require('../services/afip/afipColaService');
const pdfService = require('../services/pdfService');
const { chatCompletion, habilitado: llmHabilitado, MODEL } = require('../services/ia/llmClient');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const TIPOS_COMPROBANTE = {
  1: 'Factura A', 2: 'Nota Débito A', 3: 'Nota Crédito A',
  6: 'Factura B', 7: 'Nota Débito B', 8: 'Nota Crédito B',
  11: 'Factura C', 12: 'Nota Débito C', 13: 'Nota Crédito C',
};

// GET /api/facturacion/config
router.get('/config', auth, async (req, res, next) => {
  try {
    const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
    res.json({
      cuit: estudio?.cuit || '',
      ambiente: estudio?.afipAmbiente || 'HOMOLOGACION',
      ptoVta: estudio?.afipPtoVta || 1,
      tieneCertificado: !!estudio?.afipCertificado,
      tieneClavePrivada: !!estudio?.afipClavePrivada,
    });
  } catch (err) { next(err); }
});

// PUT /api/facturacion/config
router.put('/config', auth, requireRol('ADMIN'), async (req, res, next) => {
  try {
    const { ambiente, ptoVta, certificado, clavePrivada } = req.body;
    const data = {};
    if (ambiente) data.afipAmbiente = ambiente;
    if (ptoVta) data.afipPtoVta = Number(ptoVta);
    if (certificado) data.afipCertificado = certificado;
    if (clavePrivada) data.afipClavePrivada = clavePrivada;
    const estudio = await prisma.estudio.update({ where: { id: req.usuario.estudioId }, data });
    res.json({ ok: true, ambiente: estudio.afipAmbiente, ptoVta: estudio.afipPtoVta });
  } catch (err) { next(err); }
});

// GET /api/facturacion/comprobantes
router.get('/comprobantes', auth, async (req, res, next) => {
  try {
    const { empresaId, tipo, estado, page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { empresa: { estudioId: req.usuario.estudioId } };
    if (empresaId) where.empresaId = empresaId;
    if (tipo) where.tipoComprobante = Number(tipo);
    if (estado) where.estado = estado;

    const [items, total] = await Promise.all([
      prisma.comprobanteElectronico.findMany({
        where, skip, take: Number(limit),
        include: { empresa: { select: { razonSocial: true, cuit: true } } },
        orderBy: { fechaEmision: 'desc' },
      }),
      prisma.comprobanteElectronico.count({ where }),
    ]);

    res.json({ data: items, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/facturacion/cola — comprobantes esperando CAE (ARCA caído al emitir)
router.get('/cola', auth, async (req, res, next) => {
  try {
    const items = await prisma.comprobanteElectronico.findMany({
      where: { estudioId: req.usuario.estudioId, estado: 'PENDIENTE_CAE' },
      include: { empresa: { select: { razonSocial: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: items, total: items.length });
  } catch (err) { next(err); }
});

// POST /api/facturacion/cola/procesar — reintenta ahora los encolados
router.post('/cola/procesar', auth, async (req, res, next) => {
  try {
    const resultado = await procesarColaFacturacion(req.usuario.estudioId);
    res.json(resultado);
  } catch (err) { next(err); }
});

/**
 * Emite un comprobante y lo persiste. Si ARCA está caído lo deja PENDIENTE_CAE
 * (encolado=true). Lanza error con statusCode 422 ante rechazos reales.
 */
async function emitirYGuardar(estudioId, body) {
  const {
    empresaId, receptorCuit, receptorRazonSocial, receptorDomicilio,
    receptorCondicionIVA,
    tipoComprobante = 11, concepto = 1,
    items, observaciones, ptoVta: ptoVtaOverride,
  } = body;

  if (!items?.length) throw Object.assign(new Error('items requerido'), { statusCode: 400 });

  const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId } });
  if (!empresa) throw Object.assign(new Error('Empresa no encontrada'), { statusCode: 404 });

  const config = await configAfipDeEstudio(estudioId);
  const ptoVta = Number(ptoVtaOverride || config.ptoVta);

  // Calcular importes + discriminación por alícuota
  let neto = 0, iva = 0;
  const ivaMap = {};
  const detalles = items.map(it => {
    const base = Number(it.cantidad) * Number(it.precioUnit);
    const alicuota = it.alicuotaIva ?? 21;
    const ivaItem = alicuota > 0 ? base * (alicuota / 100) : 0;
    neto += base;
    iva += ivaItem;
    const ivaId = { 0: 3, 2.5: 9, 5: 8, 10.5: 4, 21: 5, 27: 6 }[alicuota] || 5;
    ivaMap[ivaId] = (ivaMap[ivaId] || { Id: ivaId, BaseImp: 0, Importe: 0 });
    ivaMap[ivaId].BaseImp += base;
    ivaMap[ivaId].Importe += ivaItem;
    return { ...it, base, ivaItem };
  });
  const total = neto + iva;

  const esSimulado = config.ambiente === 'SIMULADO' || (!config.certificado && !config.clavePrivada);

  let caeData = null;
  let estado = 'EMITIDO';
  let encolado = false;

  try {
    caeData = await emision.emitirComprobante(config, {
      ptoVta,
      cbteTipo: Number(tipoComprobante),
      concepto: Number(concepto),
      docNro: receptorCuit || '0',
      neto, iva, total,
      ivaAlicuotas: Object.values(ivaMap),
      condicionIVAReceptor: receptorCondicionIVA,
    });
  } catch (err) {
    if (!esSimulado && emision.esErrorConectividad(err)) {
      // ARCA caído: encolar — el cron lo emite cuando vuelva el servicio
      estado = 'PENDIENTE_CAE';
      encolado = true;
    } else {
      throw Object.assign(new Error(`ARCA rechazó la solicitud: ${err.message}`), { statusCode: 422 });
    }
  }

  const nroComprobante = caeData?.nroComprobante
    ?? (esSimulado ? await getNextNroSimulado(estudioId, Number(tipoComprobante), ptoVta) : 0);

  const comprobante = await prisma.comprobanteElectronico.create({
    data: {
      empresaId,
      estudioId,
      tipoComprobante: Number(tipoComprobante),
      ptoVta,
      nroComprobante,
      fechaEmision: new Date(),
      cae: caeData?.cae || null,
      caeFchVto: caeData?.caeFchVto || null,
      receptorCuit: receptorCuit || '',
      receptorRazonSocial: receptorRazonSocial || '',
      receptorDomicilio: receptorDomicilio || '',
      neto, iva, total,
      estado,
      simulado: caeData?.simulado || false,
      observaciones,
      detalles: { create: detalles.map((d, i) => ({ descripcion: d.descripcion, cantidad: Number(d.cantidad), precioUnit: Number(d.precioUnit), alicuotaIva: d.alicuotaIva ?? 21, subtotal: d.base, ivaImporte: d.ivaItem, orden: i + 1 })) },
    },
    include: { detalles: true, empresa: true },
  });

  return { comprobante, encolado };
}

// POST /api/facturacion/emitir
router.post('/emitir', auth, async (req, res, next) => {
  try {
    const { comprobante, encolado } = await emitirYGuardar(req.usuario.estudioId, req.body);
    res.status(encolado ? 202 : 201).json({
      ...comprobante,
      tipoDescripcion: TIPOS_COMPROBANTE[comprobante.tipoComprobante],
      encolado,
      mensaje: encolado
        ? 'ARCA no responde — el comprobante quedó en cola y se emitirá automáticamente cuando vuelva el servicio'
        : undefined,
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// POST /api/facturacion/interpretar — factura por frase (texto libre o dictado)
// Body: { texto: "facturale 50 mil de honorarios de mayo a 30-98765432-1" }
// Devuelve un borrador estructurado para precargar el formulario de emisión.
router.post('/interpretar', auth, async (req, res, next) => {
  try {
    const texto = (req.body.texto || '').trim();
    if (texto.length < 5) return res.status(400).json({ error: 'Escribí qué querés facturar' });
    if (!llmHabilitado()) return res.status(503).json({ error: 'Asistente IA no configurado (falta GROQ_API_KEY en el servidor)' });

    const resp = await chatCompletion({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Sos un asistente de facturación electrónica argentina (ARCA/AFIP). Convertís una frase en un borrador de factura. Respondé SOLO un JSON con esta forma:
{
  "cuit": "CUIT del receptor con o sin guiones, o null si no se menciona",
  "razonSocial": "nombre del receptor o null",
  "tipoComprobante": 1 | 6 | 11 | null,  // 1=Factura A, 6=Factura B, 11=Factura C; null si no se especifica
  "items": [{ "descripcion": "...", "cantidad": 1, "precioUnit": 50000, "alicuotaIva": 21 }],
  "observaciones": "string o null"
}
Reglas: importes en pesos argentinos ("50 mil"=50000, "1,5 palos"=1500000). Si dicen "más IVA" el precio es neto con alicuotaIva 21; si dicen "IVA incluido" calculá el neto dividiendo por 1.21 y redondeá a 2 decimales. Si no se aclara alícuota usá 21. Si mencionan factura C o monotributo usá tipoComprobante 11 y alicuotaIva 0.`,
        },
        { role: 'user', content: texto },
      ],
    });

    const contenido = resp.choices?.[0]?.message?.content || '{}';
    let borrador;
    try { borrador = JSON.parse(contenido); } catch { return res.status(502).json({ error: 'La IA devolvió una respuesta inválida, probá reformular' }); }
    if (!borrador.items?.length) return res.status(422).json({ error: 'No pude identificar qué facturar — incluí descripción e importe' });

    res.json(borrador);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// POST /api/facturacion/importar — carga masiva Excel/CSV
// Columnas: cuit | razonSocial | tipo (A/B/C) | descripcion | cantidad | precioUnit | alicuotaIva
// Cada fila = un comprobante. Si ARCA está caído, quedan en cola.
router.post('/importar', auth, requireRol('ADMIN', 'CONTADOR'), upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido (Excel o CSV)' });
    const { empresaId } = req.body;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const filas = [];
    const nombre = (req.file.originalname || '').toLowerCase();
    if (nombre.endsWith('.csv') || req.file.mimetype === 'text/csv') {
      const lineas = req.file.buffer.toString('utf8').split(/\r?\n/).filter(l => l.trim());
      const sep = lineas[0]?.includes(';') ? ';' : ',';
      for (let i = 1; i < lineas.length; i++) {
        const [cuit, razonSocial, tipo, descripcion, cantidad, precioUnit, alicuotaIva] = lineas[i].split(sep);
        filas.push({ cuit, razonSocial, tipo, descripcion, cantidad, precioUnit, alicuotaIva });
      }
    } else {
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      ws.eachRow((row, idx) => {
        if (idx === 1) return; // header
        filas.push({
          cuit: row.getCell(1).text, razonSocial: row.getCell(2).text, tipo: row.getCell(3).text,
          descripcion: row.getCell(4).text, cantidad: row.getCell(5).text,
          precioUnit: row.getCell(6).text, alicuotaIva: row.getCell(7).text,
        });
      });
    }

    if (!filas.length) return res.status(400).json({ error: 'El archivo no tiene filas de datos' });
    if (filas.length > 200) return res.status(400).json({ error: 'Máximo 200 comprobantes por archivo' });

    const TIPO_MAP = { A: 1, B: 6, C: 11, '1': 1, '6': 6, '11': 11 };
    const out = { total: filas.length, emitidos: 0, encolados: 0, errores: [] };

    for (let i = 0; i < filas.length; i++) {
      const f = filas[i];
      try {
        const precio = Number(String(f.precioUnit || '').replace(/\./g, '').replace(',', '.')) || Number(f.precioUnit);
        const tipoComprobante = TIPO_MAP[String(f.tipo || 'B').trim().toUpperCase()] || 6;
        const { encolado } = await emitirYGuardar(req.usuario.estudioId, {
          empresaId,
          tipoComprobante,
          receptorCuit: String(f.cuit || '').trim(),
          receptorRazonSocial: String(f.razonSocial || '').trim(),
          items: [{
            descripcion: String(f.descripcion || 'Servicio').trim(),
            cantidad: Number(f.cantidad) || 1,
            precioUnit: precio,
            alicuotaIva: f.alicuotaIva === '' || f.alicuotaIva === undefined ? (tipoComprobante === 11 ? 0 : 21) : Number(f.alicuotaIva),
          }],
          observaciones: 'Importación masiva',
        });
        if (encolado) out.encolados++; else out.emitidos++;
      } catch (err) {
        out.errores.push({ fila: i + 2, error: err.message });
      }
    }

    res.json(out);
  } catch (err) { next(err); }
});

// GET /api/facturacion/comprobantes/:id/pdf
router.get('/comprobantes/:id/pdf', auth, async (req, res, next) => {
  try {
    const comp = await prisma.comprobanteElectronico.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: { detalles: { orderBy: { orden: 'asc' } }, empresa: { include: { estudio: true } } },
    });
    if (!comp) return res.status(404).json({ error: 'Comprobante no encontrado' });

    const pdfBuffer = await pdfService.generarComprobanteElectronico(comp, TIPOS_COMPROBANTE[comp.tipoComprobante]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="comprobante_${comp.nroComprobante}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// GET /api/facturacion/tipos-comprobante
router.get('/tipos-comprobante', auth, (req, res) => {
  res.json(Object.entries(TIPOS_COMPROBANTE).map(([id, nombre]) => ({ id: Number(id), nombre })));
});

// GET /api/facturacion/ultimo-nro?tipoComprobante&ptoVta
router.get('/ultimo-nro', auth, async (req, res, next) => {
  try {
    const { tipoComprobante = 11, ptoVta } = req.query;
    const config = await configAfipDeEstudio(req.usuario.estudioId);
    const pv = Number(ptoVta || config.ptoVta);
    const esSimulado = config.ambiente === 'SIMULADO' || (!config.certificado && !config.clavePrivada);
    let nro = 0;
    if (!esSimulado) {
      nro = await emision.ultimoAutorizado(config, pv, Number(tipoComprobante));
    } else {
      const ultimo = await prisma.comprobanteElectronico.findFirst({
        where: { estudioId: req.usuario.estudioId, tipoComprobante: Number(tipoComprobante), ptoVta: pv },
        orderBy: { nroComprobante: 'desc' },
      });
      nro = ultimo?.nroComprobante || 0;
    }
    res.json({ ultimoNro: nro, proximo: nro + 1, simulado: esSimulado });
  } catch (err) { next(err); }
});

async function getNextNroSimulado(estudioId, tipoComprobante, ptoVta) {
  const ultimo = await prisma.comprobanteElectronico.findFirst({
    where: { estudioId, tipoComprobante, ptoVta },
    orderBy: { nroComprobante: 'desc' },
  });
  return (ultimo?.nroComprobante || 0) + 1;
}

module.exports = router;
