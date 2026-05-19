/**
 * Facturación electrónica AFIP via @afipsdk/afip.js (WSFEv1).
 *
 * Emite facturas A/B/C según corresponda y persiste el resultado en:
 *   - ComprobanteElectronico  (con CAE, número, fecha vencimiento)
 *   - FacturaHonorarios       (actualiza estado a ENVIADA cuando aplica)
 *
 * Mapeo de tipo de comprobante AFIP (CbteTipo):
 *   1=Factura A, 2=Nota Débito A, 3=Nota Crédito A
 *   6=Factura B, 7=Nota Débito B, 8=Nota Crédito B
 *   11=Factura C, 12=Nota Débito C, 13=Nota Crédito C
 *
 * Concepto: 1=Productos, 2=Servicios, 3=Productos y Servicios
 * DocTipo:  80=CUIT, 86=CUIL, 96=DNI, 99=Consumidor final
 */

const prisma = require('../../lib/prisma');
const logger = require('../../utils/logger');
const { getAfipInstance } = require('./afipService');

const CBTE_TIPO = { FACTURA_A: 1, FACTURA_B: 6, FACTURA_C: 11 };

// Mapeo condicion IVA del receptor → tipo de comprobante que corresponde emitir.
// Si el emisor es Responsable Inscripto: a otro RI → A; a Monotributista/CF/Exento → B.
// Si el emisor es Monotributista: siempre Factura C.
function tipoComprobantePara(condicionEmisor, condicionReceptor) {
  const emi = String(condicionEmisor || '').toUpperCase();
  const rec = String(condicionReceptor || 'CONSUMIDOR_FINAL').toUpperCase();

  if (emi === 'MONOTRIBUTISTA' || emi === 'MONOTRIBUTO') return 'FACTURA_C';
  if (rec === 'RESPONSABLE_INSCRIPTO') return 'FACTURA_A';
  return 'FACTURA_B';
}

function fechaAAfipFormat(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Emite UNA factura electrónica.
 *
 * @param {object} estudio   Modelo Estudio (con cuit + afipPtoVta + cert/key opcional)
 * @param {object} empresaReceptora  Empresa cliente del estudio (con cuit + condicionIVA)
 * @param {object} datosFactura {
 *   importeNeto: number,    // neto gravado
 *   importeIVA: number,     // 21% del neto (puede ser 0 para Factura C)
 *   importeTotal: number,
 *   concepto: 'Honorarios profesionales mes XX/YYYY',
 *   tipoComprobante?: 'FACTURA_A'|'FACTURA_B'|'FACTURA_C' (auto si no se pasa)
 *   fecha?: Date,
 *   condicionEmisor?: 'RESPONSABLE_INSCRIPTO'|'MONOTRIBUTISTA',
 * }
 * @returns {Promise<{cae, caeFchVto, nroComprobante, ptoVta, tipoComprobante}>}
 */
async function emitirFactura(estudio, empresaReceptora, datosFactura) {
  const cuitEmisor = (estudio.cuit || '').replace(/-/g, '');
  if (!/^\d{11}$/.test(cuitEmisor)) throw new Error('CUIT del estudio inválido');

  const ptoVta = parseInt(process.env.AFIP_PTO_VTA || estudio.afipPtoVta || 1, 10);
  const condicionEmisor = estudio.condicionIVA || process.env.AFIP_CONDICION_EMISOR || 'RESPONSABLE_INSCRIPTO';

  const tipoStr = datosFactura.tipoComprobante || tipoComprobantePara(condicionEmisor, empresaReceptora.condicionIVA);
  const cbteTipo = CBTE_TIPO[tipoStr];
  if (!cbteTipo) throw new Error(`Tipo de comprobante no soportado: ${tipoStr}`);

  const afip = getAfipInstance(cuitEmisor);

  // 1) Obtener último número emitido + sumar 1
  let ultimo;
  try {
    ultimo = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
  } catch (err) {
    throw new Error(`No se pudo obtener el último comprobante AFIP (¿certificado configurado?): ${err.message}`);
  }
  const nroComprobante = (ultimo || 0) + 1;

  // 2) Armar payload
  const docNro = (empresaReceptora.cuit || '').replace(/-/g, '');
  const docTipo = /^\d{11}$/.test(docNro) ? 80 : 99; // CUIT o Consumidor Final
  const fechaCbte = fechaAAfipFormat(datosFactura.fecha || new Date());

  const importeNeto = Number(datosFactura.importeNeto || 0);
  const importeIVA = Number(datosFactura.importeIVA || 0);
  const importeTotal = Number(datosFactura.importeTotal || importeNeto + importeIVA);

  const data = {
    CantReg: 1,
    PtoVta: ptoVta,
    CbteTipo: cbteTipo,
    Concepto: 2, // Servicios (honorarios)
    DocTipo: docTipo,
    DocNro: docTipo === 99 ? 0 : parseInt(docNro, 10),
    CbteDesde: nroComprobante,
    CbteHasta: nroComprobante,
    CbteFch: parseInt(fechaCbte, 10),
    FchServDesde: datosFactura.fechaServDesde ? parseInt(fechaAAfipFormat(datosFactura.fechaServDesde), 10) : parseInt(fechaCbte, 10),
    FchServHasta: datosFactura.fechaServHasta ? parseInt(fechaAAfipFormat(datosFactura.fechaServHasta), 10) : parseInt(fechaCbte, 10),
    FchVtoPago: datosFactura.fechaVtoPago ? parseInt(fechaAAfipFormat(datosFactura.fechaVtoPago), 10) : parseInt(fechaCbte, 10),
    ImpTotal: importeTotal,
    ImpTotConc: 0,
    ImpNeto: importeNeto,
    ImpOpEx: 0,
    ImpIVA: importeIVA,
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
  };

  // Factura C no lleva IVA discriminado
  if (cbteTipo !== 11 && importeIVA > 0) {
    data.Iva = [{ Id: 5, BaseImp: importeNeto, Importe: importeIVA }]; // 5 = 21%
  }

  // 3) Solicitar CAE
  let respCae;
  try {
    respCae = await afip.ElectronicBilling.createVoucher(data);
  } catch (err) {
    throw new Error(`AFIP rechazó la factura: ${err.message}`);
  }

  return {
    cae: respCae.CAE,
    caeFchVto: String(respCae.CAEFchVto || ''),
    nroComprobante,
    ptoVta,
    tipoComprobante: tipoStr,
    cbteTipo,
    importeTotal,
    importeNeto,
    importeIVA,
    raw: respCae,
  };
}

/**
 * Emite facturas masivamente para una lista de items (facturas pendientes de honorarios).
 * Cada item: { empresaId, facturaHonorariosId?, importeNeto, importeIVA, concepto, fecha }
 *
 * Crea ComprobanteElectronico por cada CAE exitoso y actualiza FacturaHonorarios.estado='ENVIADA'.
 */
async function facturarMasivo(estudio, items, { simulado = false } = {}) {
  const out = { exitosos: [], errores: [] };

  for (const item of items) {
    try {
      const empresa = await prisma.empresa.findFirst({
        where: { id: item.empresaId, estudioId: estudio.id },
      });
      if (!empresa) throw new Error(`Empresa ${item.empresaId} no encontrada`);

      let resultado;
      if (simulado || process.env.AFIP_AMBIENTE === 'SIMULADO') {
        resultado = simularEmision(item, empresa, estudio);
      } else {
        resultado = await emitirFactura(estudio, empresa, item);
      }

      // Persistir en ComprobanteElectronico
      const compElect = await prisma.comprobanteElectronico.create({
        data: {
          empresaId: empresa.id,
          estudioId: estudio.id,
          tipoComprobante: resultado.cbteTipo,
          ptoVta: resultado.ptoVta,
          nroComprobante: resultado.nroComprobante,
          fechaEmision: item.fecha || new Date(),
          cae: resultado.cae,
          caeFchVto: resultado.caeFchVto,
          receptorCuit: empresa.cuit,
          receptorRazonSocial: empresa.razonSocial,
          receptorDomicilio: empresa.domicilio,
          neto: resultado.importeNeto,
          iva: resultado.importeIVA,
          total: resultado.importeTotal,
          estado: 'EMITIDO',
          simulado: !!resultado.simulado,
          observaciones: item.concepto,
        },
      });

      // Actualizar FacturaHonorarios si vino vinculado
      if (item.facturaHonorariosId) {
        await prisma.facturaHonorarios.update({
          where: { id: item.facturaHonorariosId },
          data: { estado: 'ENVIADA', numero: `${String(resultado.ptoVta).padStart(5,'0')}-${String(resultado.nroComprobante).padStart(8,'0')}` },
        });
      }

      out.exitosos.push({
        empresaId: empresa.id,
        empresa: empresa.razonSocial,
        comprobanteId: compElect.id,
        cae: resultado.cae,
        nro: `${String(resultado.ptoVta).padStart(5,'0')}-${String(resultado.nroComprobante).padStart(8,'0')}`,
        tipo: resultado.tipoComprobante,
        total: resultado.importeTotal,
      });
    } catch (err) {
      logger.error?.(`[afipFacturacion] error empresa ${item.empresaId}: ${err.message}`);
      out.errores.push({ empresaId: item.empresaId, error: err.message });
    }
  }

  return out;
}

function simularEmision(item, empresa, estudio) {
  const cae = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
  const vto = new Date(Date.now() + 10 * 86400000);
  const condicionEmisor = estudio?.condicionIVA || process.env.AFIP_CONDICION_EMISOR || 'RESPONSABLE_INSCRIPTO';
  const tipo = item.tipoComprobante || tipoComprobantePara(condicionEmisor, empresa.condicionIVA);
  return {
    cae,
    caeFchVto: fechaAAfipFormat(vto),
    nroComprobante: Math.floor(Math.random() * 9000) + 1000,
    ptoVta: parseInt(process.env.AFIP_PTO_VTA || 1, 10),
    tipoComprobante: tipo,
    cbteTipo: CBTE_TIPO[tipo],
    importeNeto: Number(item.importeNeto),
    importeIVA: Number(item.importeIVA),
    importeTotal: Number(item.importeTotal || item.importeNeto + item.importeIVA),
    simulado: true,
  };
}

module.exports = { emitirFactura, facturarMasivo, tipoComprobantePara, CBTE_TIPO };
