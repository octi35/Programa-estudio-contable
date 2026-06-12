/**
 * Cola de facturación offline — estilo Facturitas: si ARCA está caído al
 * emitir, el comprobante queda en estado PENDIENTE_CAE y este servicio lo
 * reintenta (cron cada 10 min o disparo manual desde la UI).
 */
const prisma = require('../../lib/prisma');
const logger = require('../../utils/logger');
const { emitirComprobante, esErrorConectividad } = require('./afipEmisionService');

async function configAfipDeEstudio(estudioId) {
  const estudio = await prisma.estudio.findUnique({ where: { id: estudioId } });
  if (!estudio) throw new Error('Estudio no encontrado');
  return {
    cuit: estudio.cuit?.replace(/-/g, '') || '',
    ambiente: estudio.afipAmbiente || 'SIMULADO',
    certificado: estudio.afipCertificado || null,
    clavePrivada: estudio.afipClavePrivada || null,
    ptoVta: estudio.afipPtoVta || 1,
  };
}

/**
 * Config AFIP para emitir a nombre de una empresa (multi-CUIT).
 * Si la empresa tiene certificado propio emite con su CUIT y punto de venta;
 * si no, cae al certificado y CUIT del estudio (comportamiento histórico).
 */
async function configAfipDeEmpresa(empresaId, estudioId) {
  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, ...(estudioId ? { estudioId } : {}) },
    include: { estudio: true },
  });
  if (!empresa) throw Object.assign(new Error('Empresa no encontrada'), { statusCode: 404 });

  const estudio = empresa.estudio;
  const certPropio = !!(empresa.afipCertificado && empresa.afipClavePrivada);

  return {
    cuit: (certPropio ? empresa.cuit : estudio.cuit)?.replace(/-/g, '') || '',
    ambiente: estudio.afipAmbiente || 'SIMULADO',
    certificado: certPropio ? empresa.afipCertificado : (estudio.afipCertificado || null),
    clavePrivada: certPropio ? empresa.afipClavePrivada : (estudio.afipClavePrivada || null),
    ptoVta: certPropio ? (empresa.afipPtoVta || 1) : (estudio.afipPtoVta || 1),
    certPropio,
    condicionIVAEmisor: empresa.condicionIVA || null,
  };
}

/**
 * Procesa los comprobantes encolados (PENDIENTE_CAE). Para cada uno reintenta
 * la emisión real; si ARCA sigue caído lo deja en cola, si ARCA lo rechaza
 * (error de negocio) lo marca RECHAZADO con el motivo.
 *
 * @param {string|null} estudioId  Limitar a un estudio (null = todos)
 * @returns {{ procesados: number, emitidos: number, enCola: number, rechazados: number, detalles: array }}
 */
async function procesarColaFacturacion(estudioId = null) {
  const where = { estado: 'PENDIENTE_CAE' };
  if (estudioId) where.estudioId = estudioId;

  const pendientes = await prisma.comprobanteElectronico.findMany({
    where,
    include: {
      detalles: { orderBy: { orden: 'asc' } },
      comprobanteAsociado: { select: { tipoComprobante: true, ptoVta: true, nroComprobante: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const out = { procesados: pendientes.length, emitidos: 0, enCola: 0, rechazados: 0, detalles: [] };
  const configCache = {};

  for (const comp of pendientes) {
    try {
      configCache[comp.empresaId] = configCache[comp.empresaId]
        || await configAfipDeEmpresa(comp.empresaId, comp.estudioId);
      const config = configCache[comp.empresaId];

      const ivaMap = {};
      for (const d of comp.detalles) {
        const ali = Number(d.alicuotaIva);
        const ivaId = { 0: 3, 2.5: 9, 5: 8, 10.5: 4, 21: 5, 27: 6 }[ali] || 5;
        ivaMap[ivaId] = ivaMap[ivaId] || { Id: ivaId, BaseImp: 0, Importe: 0 };
        ivaMap[ivaId].BaseImp += Number(d.subtotal);
        ivaMap[ivaId].Importe += Number(d.ivaImporte);
      }

      const resultado = await emitirComprobante(config, {
        ptoVta: comp.ptoVta,
        cbteTipo: comp.tipoComprobante,
        concepto: 1,
        docNro: comp.receptorCuit || '0',
        neto: Number(comp.neto),
        iva: Number(comp.iva),
        total: Number(comp.total),
        fecha: new Date(), // ARCA exige fecha dentro de la tolerancia; se re-fecha al emitir
        ivaAlicuotas: Object.values(ivaMap),
        comprobanteAsociado: comp.comprobanteAsociado
          ? {
              Tipo: comp.comprobanteAsociado.tipoComprobante,
              PtoVta: comp.comprobanteAsociado.ptoVta,
              Nro: comp.comprobanteAsociado.nroComprobante,
              Cuit: config.cuit,
            }
          : null,
      });

      await prisma.comprobanteElectronico.update({
        where: { id: comp.id },
        data: {
          estado: 'EMITIDO',
          cae: resultado.cae,
          caeFchVto: resultado.caeFchVto,
          nroComprobante: resultado.nroComprobante ?? comp.nroComprobante,
          fechaEmision: new Date(),
          simulado: !!resultado.simulado,
        },
      });
      out.emitidos++;
      out.detalles.push({ id: comp.id, estado: 'EMITIDO', cae: resultado.cae });
    } catch (err) {
      if (esErrorConectividad(err)) {
        out.enCola++;
        out.detalles.push({ id: comp.id, estado: 'PENDIENTE_CAE', error: err.message });
        // ARCA sigue caído: cortar para no insistir con el resto en esta pasada
        break;
      }
      await prisma.comprobanteElectronico.update({
        where: { id: comp.id },
        data: { estado: 'RECHAZADO', observaciones: `Rechazado por ARCA: ${err.message}`.slice(0, 500) },
      });
      out.rechazados++;
      out.detalles.push({ id: comp.id, estado: 'RECHAZADO', error: err.message });
      logger.error?.(`[afipCola] comprobante ${comp.id} rechazado: ${err.message}`);
    }
  }

  return out;
}

module.exports = { procesarColaFacturacion, configAfipDeEstudio, configAfipDeEmpresa };
