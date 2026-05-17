// Servicio de matching pago bancario → factura
//
// Llega un evento de pago bancario y intenta vincularlo automáticamente con un
// comprobante IVA (factura emitida o recibida). Si encuentra match único:
//   1) Crea PagoComprobante
//   2) Crea MovimientoBancario si hay cuenta configurada
//   3) Marca el evento como conciliado
// Si no hay match → guarda para revisión manual (LogAccion).

const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

/**
 * Busca un ComprobanteIVA candidato según los datos del pago.
 * Estrategia:
 *   1) Si vino comprobante_numero + tipo → match exacto por número
 *   2) Si vino cuit_emisor + importe → match por proveedor + monto
 *   3) Si vino solo importe único en últimos 60 días → match por monto exacto
 *
 * Devuelve: { comprobante, confianza: 'alta'|'media'|'baja' } o null.
 */
async function buscarComprobanteCandidato(estudioId, pago) {
  const importe = Number(pago.importe);
  if (!importe || importe <= 0) return null;

  // 1) Match por número de comprobante
  if (pago.comprobante_numero) {
    const num = parseInt(String(pago.comprobante_numero).replace(/[^\d]/g, ''), 10);
    if (num) {
      const matches = await prisma.comprobanteIVA.findMany({
        where: {
          numero: num,
          anulado: false,
          empresa: { estudioId },
        },
        include: { pagos: true, empresa: { select: { razonSocial: true } } },
        take: 5,
      });
      const pendientes = matches.filter(c => {
        const pagado = c.pagos.reduce((s, p) => s + Number(p.importe), 0);
        return pagado + 0.01 < Number(c.total);
      });
      if (pendientes.length === 1) return { comprobante: pendientes[0], confianza: 'alta' };
      if (pendientes.length > 1) {
        // Desempate por monto exacto
        const conMonto = pendientes.find(c => Math.abs(Number(c.total) - importe) < 0.01);
        if (conMonto) return { comprobante: conMonto, confianza: 'alta' };
      }
    }
  }

  // 2) Match por CUIT emisor + monto
  if (pago.cuit_emisor) {
    const cuitLimpio = String(pago.cuit_emisor).replace(/[-\s]/g, '');
    const proveedor = await prisma.proveedorCliente.findFirst({
      where: { cuit: cuitLimpio, empresa: { estudioId } },
    });
    if (proveedor) {
      const matches = await prisma.comprobanteIVA.findMany({
        where: {
          proveedorClienteId: proveedor.id,
          anulado: false,
          total: { gte: importe - 0.01, lte: importe + 0.01 },
        },
        include: { pagos: true, empresa: { select: { razonSocial: true } } },
        take: 5,
      });
      const pendientes = matches.filter(c => {
        const pagado = c.pagos.reduce((s, p) => s + Number(p.importe), 0);
        return pagado + 0.01 < Number(c.total);
      });
      if (pendientes.length === 1) return { comprobante: pendientes[0], confianza: 'alta' };
      if (pendientes.length > 1) return { comprobante: pendientes[0], confianza: 'media' };
    }
  }

  // 3) Match por monto exacto en últimos 60 días (sólo si es único)
  const desde = new Date();
  desde.setDate(desde.getDate() - 60);
  const porMonto = await prisma.comprobanteIVA.findMany({
    where: {
      anulado: false,
      empresa: { estudioId },
      total: { gte: importe - 0.01, lte: importe + 0.01 },
      fecha: { gte: desde },
    },
    include: { pagos: true, empresa: { select: { razonSocial: true } } },
    take: 5,
  });
  const candidatosPendientes = porMonto.filter(c => {
    const pagado = c.pagos.reduce((s, p) => s + Number(p.importe), 0);
    return pagado + 0.01 < Number(c.total);
  });
  if (candidatosPendientes.length === 1) return { comprobante: candidatosPendientes[0], confianza: 'baja' };

  return null;
}

/**
 * Procesa un pago bancario individual.
 * Devuelve un objeto descriptivo del resultado.
 */
async function procesarPago(estudioId, pago) {
  const fecha = pago.fecha ? new Date(pago.fecha) : new Date();
  const importe = Number(pago.importe);

  const match = await buscarComprobanteCandidato(estudioId, pago);

  // Si hay cuenta bancaria asociada, registramos el movimiento
  let cuentaBancaria = null;
  if (pago.cuenta_cbu) {
    cuentaBancaria = await prisma.cuentaBancaria.findFirst({
      where: { cbu: pago.cuenta_cbu, empresa: { estudioId }, activa: true },
    });
  } else if (pago.cuenta_id) {
    cuentaBancaria = await prisma.cuentaBancaria.findFirst({
      where: { id: pago.cuenta_id, empresa: { estudioId }, activa: true },
    });
  }

  // Crear MovimientoBancario si tenemos cuenta
  let movimiento = null;
  if (cuentaBancaria) {
    const ultimo = await prisma.movimientoBancario.findFirst({
      where: { cuentaBancariaId: cuentaBancaria.id },
      orderBy: { fecha: 'desc' },
    });
    const saldoActual = ultimo ? Number(ultimo.saldo) : Number(cuentaBancaria.saldoInicial);
    movimiento = await prisma.movimientoBancario.create({
      data: {
        cuentaBancariaId: cuentaBancaria.id,
        fecha,
        descripcion: pago.descripcion || 'Pago recibido por webhook',
        referencia: pago.referencia || pago.comprobante_numero || null,
        debe: 0,
        haber: importe,
        saldo: saldoActual + importe,
        conciliado: !!match,
      },
    });
  }

  // Si hay match con un comprobante, registrar el pago
  let pagoCreado = null;
  if (match) {
    pagoCreado = await prisma.pagoComprobante.create({
      data: {
        comprobanteId: match.comprobante.id,
        fecha,
        importe,
        medioPago: pago.medio_pago || pago.banco || 'TRANSFERENCIA',
        referencia: pago.referencia || pago.comprobante_numero || null,
        observaciones: `Auto-imputado por webhook (confianza: ${match.confianza})`,
      },
    });
  }

  await prisma.logAccion.create({
    data: {
      estudioId,
      accion: match ? 'WEBHOOK_PAGO_IMPUTADO' : 'WEBHOOK_PAGO_SIN_IMPUTAR',
      entidad: 'ComprobanteIVA',
      entidadId: match?.comprobante?.id || null,
      detalle: {
        importe, fecha: fecha.toISOString(),
        banco: pago.banco, cbu: pago.cuenta_cbu, referencia: pago.referencia,
        confianza: match?.confianza,
        comprobante: match ? { numero: match.comprobante.numero, total: Number(match.comprobante.total), empresa: match.comprobante.empresa?.razonSocial } : null,
        movimientoCreado: !!movimiento,
      },
    },
  });

  return {
    matched: !!match,
    confianza: match?.confianza || null,
    comprobanteId: match?.comprobante?.id || null,
    pagoId: pagoCreado?.id || null,
    movimientoId: movimiento?.id || null,
  };
}

module.exports = { procesarPago, buscarComprobanteCandidato };
