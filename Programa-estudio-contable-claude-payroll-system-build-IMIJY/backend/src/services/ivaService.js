/**
 * Servicio IVA: cálculos, exportación AFIP Nuevo Régimen
 */
const dayjs = require('dayjs');

// Códigos de tipo de comprobante para exportación AFIP
const CODIGOS_COMPROBANTE_AFIP = {
  FACTURA_A: '001',
  FACTURA_B: '006',
  FACTURA_C: '011',
  NOTA_DEBITO_A: '002',
  NOTA_DEBITO_B: '007',
  NOTA_DEBITO_C: '012',
  NOTA_CREDITO_A: '003',
  NOTA_CREDITO_B: '008',
  NOTA_CREDITO_C: '013',
  RECIBO_A: '004',
  RECIBO_B: '009',
  RECIBO_C: '015',
  LIQUIDACION_A: '063',
  LIQUIDACION_B: '064',
};

const CODIGOS_ALICUOTA_AFIP = {
  0: '0003',
  10.5: '0004',
  21: '0005',
  27: '0006',
  5: '0008',
  2.5: '0009',
};

// Determina si el comprobante genera débito fiscal (ventas) o crédito fiscal (compras)
function esDebito(tipoMovimiento, tipoComprobante) {
  const esNota = tipoComprobante.includes('NOTA_CREDITO');
  if (tipoMovimiento === 'VENTA') return !esNota;
  return esNota; // en compras: una NC de proveedor reduce el CF
}

/**
 * Calcula posición IVA del período
 */
function calcularPosicionIVA(comprobantes) {
  let debitoFiscal = 0;
  let creditoFiscal = 0;

  for (const c of comprobantes) {
    if (c.anulado) continue;
    const ivaTotal = parseFloat(c.iva21) + parseFloat(c.iva105) + parseFloat(c.iva27) + parseFloat(c.percepcionIVA);

    if (c.tipoMovimiento === 'VENTA') {
      const esNC = c.tipoComprobante.includes('NOTA_CREDITO');
      if (esNC) debitoFiscal -= ivaTotal;
      else debitoFiscal += ivaTotal;
    } else {
      const esNC = c.tipoComprobante.includes('NOTA_CREDITO');
      if (esNC) creditoFiscal -= ivaTotal;
      else creditoFiscal += ivaTotal;
    }
  }

  const saldo = debitoFiscal - creditoFiscal;
  return {
    debitoFiscal: Math.round(debitoFiscal * 100) / 100,
    creditoFiscal: Math.round(creditoFiscal * 100) / 100,
    saldo: Math.round(saldo * 100) / 100,
    resultado: saldo > 0 ? 'A_PAGAR' : saldo < 0 ? 'A_FAVOR' : 'NEUTRO',
  };
}

/**
 * Genera archivo TXT formato AFIP Nuevo Régimen de Información
 * Registro de compras y ventas (RG 3685/2014)
 */
function generarArchivoAFIP(comprobantes, cuitEmpresa, anio, mes, tipoMovimiento) {
  const lineas = [];
  const periodoStr = `${anio}${String(mes).padStart(2, '0')}`;
  const cuitLimpio = cuitEmpresa.replace(/[-]/g, '');

  for (const c of comprobantes) {
    if (c.anulado) continue;
    if (c.tipoMovimiento !== tipoMovimiento) continue;

    const fechaStr = dayjs(c.fecha).format('YYYYMMDD');
    const codigoComp = CODIGOS_COMPROBANTE_AFIP[c.tipoComprobante] || '099';
    const pv = String(c.puntoVenta).padStart(5, '0');
    const nroHasta = c.numeroHasta || c.numero;
    const nroDesde = String(c.numero).padStart(20, '0');
    const nroHastaStr = String(nroHasta).padStart(20, '0');
    const cuitProv = (c.proveedorCliente?.cuit || '0').replace(/[-]/g, '').padStart(11, '0');
    const razonSocial = (c.proveedorCliente?.razonSocial || 'CONSUMIDOR FINAL').substring(0, 30).padEnd(30, ' ');

    const importeTotal = String(Math.round(Math.abs(parseFloat(c.total)) * 100)).padStart(15, '0');
    const netoNoGravado = String(Math.round(Math.abs(parseFloat(c.netoNoGravado)) * 100)).padStart(15, '0');
    const exento = String(Math.round(Math.abs(parseFloat(c.exento)) * 100)).padStart(15, '0');
    const percepcionIVA = String(Math.round(Math.abs(parseFloat(c.percepcionIVA)) * 100)).padStart(15, '0');
    const percepcionIIBB = String(Math.round(Math.abs(parseFloat(c.percepcionIIBB)) * 100)).padStart(15, '0');
    const retencion = String(Math.round(Math.abs(parseFloat(c.retencion)) * 100)).padStart(15, '0');

    // Código condición IVA
    const condicionCodigo = {
      RESPONSABLE_INSCRIPTO: '1', MONOTRIBUTISTA: '6', EXENTO: '4',
      CONSUMIDOR_FINAL: '5', NO_RESPONSABLE: '3',
    }[c.proveedorCliente?.condicionIVA || 'CONSUMIDOR_FINAL'] || '5';

    const linea = [
      periodoStr,          // 6: período
      fechaStr,            // 8: fecha
      codigoComp,          // 3: tipo comprobante
      pv,                  // 5: punto venta
      nroDesde,            // 20: número desde
      nroHastaStr,         // 20: número hasta
      cuitProv,            // 11: CUIT proveedor/cliente
      razonSocial,         // 30: razón social
      importeTotal,        // 15: importe total
      netoNoGravado,       // 15: neto no gravado
      exento,              // 15: exento
      percepcionIVA,       // 15: percepción IVA
      percepcionIIBB,      // 15: percepción IIBB
      retencion,           // 15: retención
      condicionCodigo,     // 1: condición IVA
    ].join('');

    lineas.push(linea);
  }

  return lineas.join('\r\n');
}

/**
 * Genera archivo de alícuotas (RG 3685) para AFIP
 */
function generarArchivoAlicuotasAFIP(comprobantes, tipoMovimiento) {
  const lineas = [];

  for (const c of comprobantes) {
    if (c.anulado) continue;
    if (c.tipoMovimiento !== tipoMovimiento) continue;

    const codigoComp = CODIGOS_COMPROBANTE_AFIP[c.tipoComprobante] || '099';
    const pv = String(c.puntoVenta).padStart(5, '0');
    const nro = String(c.numero).padStart(20, '0');

    const alicuotas = [
      { base: c.netoGravado21, iva: c.iva21, alicuota: 21 },
      { base: c.netoGravado105, iva: c.iva105, alicuota: 10.5 },
      { base: c.netoGravado27, iva: c.iva27, alicuota: 27 },
    ].filter(a => Math.abs(parseFloat(a.base || 0)) > 0 || Math.abs(parseFloat(a.iva || 0)) > 0);

    for (const a of alicuotas) {
      const codigoAlic = CODIGOS_ALICUOTA_AFIP[a.alicuota] || '0005';
      const neto = String(Math.round(Math.abs(parseFloat(a.base || 0)) * 100)).padStart(15, '0');
      const iva = String(Math.round(Math.abs(parseFloat(a.iva || 0)) * 100)).padStart(15, '0');
      const linea = [
        codigoComp,   // 3
        pv,           // 5
        nro,          // 20
        neto,         // 15
        codigoAlic,   // 4
        iva,          // 15
      ].join('');
      lineas.push(linea);
    }
  }

  return lineas.join('\r\n');
}

/**
 * Agrupa comprobantes por alícuota para el libro IVA
 */
function agruparPorAlicuota(comprobantes) {
  const totales = {
    base21: 0, iva21: 0,
    base105: 0, iva105: 0,
    base27: 0, iva27: 0,
    netoNoGravado: 0, exento: 0,
    percepcionIVA: 0, percepcionIIBB: 0,
    retencion: 0, total: 0,
  };

  for (const c of comprobantes) {
    if (c.anulado) continue;
    const signo = c.tipoComprobante.includes('NOTA_CREDITO') ? -1 : 1;
    totales.base21 += signo * parseFloat(c.netoGravado21);
    totales.iva21 += signo * parseFloat(c.iva21);
    totales.base105 += signo * parseFloat(c.netoGravado105);
    totales.iva105 += signo * parseFloat(c.iva105);
    totales.base27 += signo * parseFloat(c.netoGravado27);
    totales.iva27 += signo * parseFloat(c.iva27);
    totales.netoNoGravado += signo * parseFloat(c.netoNoGravado);
    totales.exento += signo * parseFloat(c.exento);
    totales.percepcionIVA += signo * parseFloat(c.percepcionIVA);
    totales.percepcionIIBB += signo * parseFloat(c.percepcionIIBB);
    totales.retencion += signo * parseFloat(c.retencion);
    totales.total += signo * parseFloat(c.total);
  }

  return Object.fromEntries(Object.entries(totales).map(([k, v]) => [k, Math.round(v * 100) / 100]));
}

module.exports = {
  calcularPosicionIVA,
  generarArchivoAFIP,
  generarArchivoAlicuotasAFIP,
  agruparPorAlicuota,
  CODIGOS_COMPROBANTE_AFIP,
  CODIGOS_ALICUOTA_AFIP,
};
