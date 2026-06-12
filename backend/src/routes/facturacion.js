/**
 * Facturación Electrónica AFIP/ARCA — Facturas A/B/C, NC/ND
 * Emisión real via @afipsdk/afip.js (WSAA + WSFEv1), modo SIMULADO sin
 * certificado, y cola offline con reintentos cuando ARCA está caído.
 */
const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { auth, requireRol } = require('../middleware/auth');
const emision = require('../services/afip/afipEmisionService');
const { procesarColaFacturacion, configAfipDeEstudio } = require('../services/afip/afipColaService');
const pdfService = require('../services/pdfService');

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

// POST /api/facturacion/emitir
router.post('/emitir', auth, async (req, res, next) => {
  try {
    const {
      empresaId, receptorCuit, receptorRazonSocial, receptorDomicilio,
      receptorCondicionIVA,
      tipoComprobante = 11, concepto = 1,
      items, // [{descripcion, cantidad, precioUnit, alicuotaIva: 21|10.5|27|0}]
      observaciones, ptoVta: ptoVtaOverride,
    } = req.body;

    if (!items?.length) return res.status(400).json({ error: 'items requerido' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const config = await configAfipDeEstudio(req.usuario.estudioId);
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

    const datosEmision = {
      ptoVta,
      cbteTipo: Number(tipoComprobante),
      concepto: Number(concepto),
      docNro: receptorCuit || '0',
      neto, iva, total,
      ivaAlicuotas: Object.values(ivaMap),
      condicionIVAReceptor: receptorCondicionIVA,
    };

    let caeData = null;
    let estado = 'EMITIDO';
    let encolado = false;

    try {
      caeData = await emision.emitirComprobante(config, datosEmision);
    } catch (err) {
      if (!esSimulado && emision.esErrorConectividad(err)) {
        // ARCA caído: encolar — el cron lo emite cuando vuelva el servicio
        estado = 'PENDIENTE_CAE';
        encolado = true;
      } else {
        return res.status(422).json({ error: `ARCA rechazó la solicitud: ${err.message}` });
      }
    }

    const nroComprobante = caeData?.nroComprobante
      ?? (esSimulado ? await getNextNroSimulado(req.usuario.estudioId, Number(tipoComprobante), ptoVta) : 0);

    const comprobante = await prisma.comprobanteElectronico.create({
      data: {
        empresaId,
        estudioId: req.usuario.estudioId,
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

    res.status(encolado ? 202 : 201).json({
      ...comprobante,
      tipoDescripcion: TIPOS_COMPROBANTE[Number(tipoComprobante)],
      encolado,
      mensaje: encolado
        ? 'ARCA no responde — el comprobante quedó en cola y se emitirá automáticamente cuando vuelva el servicio'
        : undefined,
    });
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
