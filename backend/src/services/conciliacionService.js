/**
 * Conciliación bancaria inteligente.
 *
 * Para cada movimiento bancario sin conciliar propone candidatos y un score:
 *   - Cobros (haber > 0)  → comprobantes de VENTA pendientes de la empresa
 *   - Pagos  (debe > 0)   → comprobantes de COMPRA pendientes + facturas de
 *                           honorarios del estudio a esa empresa
 *
 * Score (0-100): importe (50) + cercanía de fecha (25) + CUIT del tercero
 * presente en la descripción del movimiento (25). El contador solo confirma.
 */

const prisma = require('../lib/prisma');

const r2 = (n) => Math.round(n * 100) / 100;
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

const TOLERANCIA_IMPORTE = 0.005; // 0.5%
const VENTANA_DIAS = 30;

function scoreImporte(importeMov, importeDoc) {
  if (importeDoc <= 0) return 0;
  const diff = Math.abs(importeMov - importeDoc) / importeDoc;
  if (diff <= 0.0001) return 50;            // exacto
  if (diff <= TOLERANCIA_IMPORTE) return 40; // dentro del 0.5%
  return 0;
}

function scoreFecha(fechaMov, fechaDoc) {
  const dias = Math.abs((fechaMov - fechaDoc) / (24 * 60 * 60 * 1000));
  if (dias > VENTANA_DIAS) return 0;
  return Math.round(25 * (1 - dias / VENTANA_DIAS));
}

function scoreCuit(descripcionMov, cuit) {
  const cuitDigits = soloDigitos(cuit);
  if (cuitDigits.length !== 11) return 0;
  const movDigits = soloDigitos(descripcionMov);
  return movDigits.includes(cuitDigits) ? 25 : 0;
}

/**
 * Sugerencias de conciliación para los movimientos pendientes de una cuenta.
 */
async function sugerirConciliacion(estudioId, cuentaBancariaId, { limite = 100 } = {}) {
  const cuenta = await prisma.cuentaBancaria.findFirst({
    where: { id: cuentaBancariaId, empresa: { estudioId } },
    select: { id: true, banco: true, numeroCuenta: true, empresaId: true, empresa: { select: { razonSocial: true } } },
  });
  if (!cuenta) throw Object.assign(new Error('Cuenta bancaria no encontrada'), { statusCode: 404 });

  const movimientos = await prisma.movimientoBancario.findMany({
    where: { cuentaBancariaId, conciliado: false },
    orderBy: { fecha: 'desc' },
    take: limite,
  });
  if (movimientos.length === 0) {
    return { cuenta, pendientes: 0, sugerencias: [] };
  }

  // Candidatos: comprobantes con saldo pendiente de la empresa (ventana amplia)
  const fechaMin = new Date(Math.min(...movimientos.map(m => m.fecha.getTime())) - VENTANA_DIAS * 86400000);
  const fechaMax = new Date(Math.max(...movimientos.map(m => m.fecha.getTime())) + VENTANA_DIAS * 86400000);

  const comprobantes = await prisma.comprobanteIVA.findMany({
    where: {
      empresaId: cuenta.empresaId,
      anulado: false,
      fecha: { gte: fechaMin, lte: fechaMax },
    },
    include: {
      proveedorCliente: { select: { razonSocial: true, cuit: true } },
      pagos: { select: { importe: true } },
    },
  });

  const facturasHonorarios = await prisma.facturaHonorarios.findMany({
    where: {
      estudioId,
      empresaId: cuenta.empresaId,
      estado: { in: ['PENDIENTE', 'ENVIADA'] },
      fecha: { gte: fechaMin, lte: fechaMax },
    },
  });

  // Pre-calcular saldo pendiente por comprobante
  const candidatosComprobante = comprobantes
    .map(c => {
      const pagado = c.pagos.reduce((s, p) => s + Number(p.importe), 0);
      return { ...c, saldoPendiente: r2(Number(c.total) - pagado) };
    })
    .filter(c => c.saldoPendiente > 0);

  const sugerencias = [];
  const usados = new Set(); // un documento no se sugiere dos veces como mejor opción

  for (const mov of movimientos) {
    const esCobro = Number(mov.haber) > 0;
    const importeMov = esCobro ? Number(mov.haber) : Number(mov.debe);
    if (importeMov <= 0) continue;

    const candidatos = [];

    // Comprobantes: VENTA para cobros, COMPRA para pagos
    for (const c of candidatosComprobante) {
      if (esCobro && c.tipoMovimiento !== 'VENTA') continue;
      if (!esCobro && c.tipoMovimiento !== 'COMPRA') continue;

      const sImporte = scoreImporte(importeMov, c.saldoPendiente);
      if (sImporte === 0) continue;
      const score = sImporte + scoreFecha(mov.fecha, c.fecha) + scoreCuit(mov.descripcion, c.proveedorCliente?.cuit);
      candidatos.push({
        tipo: 'COMPROBANTE',
        referenciaId: c.id,
        score,
        detalle: {
          descripcion: `${c.tipoComprobante.replace(/_/g, ' ')} ${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`,
          tercero: c.proveedorCliente?.razonSocial || '—',
          cuit: c.proveedorCliente?.cuit || null,
          fecha: c.fecha,
          importe: c.saldoPendiente,
        },
      });
    }

    // Facturas de honorarios del estudio (el cliente las paga = débito en su cuenta)
    if (!esCobro) {
      for (const f of facturasHonorarios) {
        const sImporte = scoreImporte(importeMov, Number(f.total));
        if (sImporte === 0) continue;
        const score = sImporte + scoreFecha(mov.fecha, f.fecha) + (/honorario|estudio/i.test(mov.descripcion) ? 15 : 0);
        candidatos.push({
          tipo: 'FACTURA_HONORARIOS',
          referenciaId: f.id,
          score,
          detalle: {
            descripcion: `Honorarios ${f.numero || ''} — ${f.concepto}`,
            tercero: 'Estudio contable',
            cuit: null,
            fecha: f.fecha,
            importe: Number(f.total),
          },
        });
      }
    }

    candidatos.sort((a, b) => b.score - a.score);
    const mejores = candidatos.filter(c => c.score >= 50 && !usados.has(`${c.tipo}:${c.referenciaId}`)).slice(0, 3);
    if (mejores.length > 0) usados.add(`${mejores[0].tipo}:${mejores[0].referenciaId}`);

    sugerencias.push({
      movimiento: {
        id: mov.id,
        fecha: mov.fecha,
        descripcion: mov.descripcion,
        referencia: mov.referencia,
        importe: importeMov,
        sentido: esCobro ? 'COBRO' : 'PAGO',
      },
      candidatos: mejores,
      confianza: mejores[0] ? (mejores[0].score >= 75 ? 'ALTA' : 'MEDIA') : 'SIN_MATCH',
    });
  }

  const conMatch = sugerencias.filter(s => s.candidatos.length > 0).length;
  return {
    cuenta,
    pendientes: movimientos.length,
    conMatch,
    sinMatch: movimientos.length - conMatch,
    sugerencias,
  };
}

/**
 * Confirma una conciliación: marca el movimiento y registra el efecto
 * (pago del comprobante o cobro de la factura de honorarios).
 */
async function confirmarConciliacion(estudioId, movimientoId, { tipo, referenciaId }) {
  const mov = await prisma.movimientoBancario.findFirst({
    where: { id: movimientoId, cuentaBancaria: { empresa: { estudioId } } },
  });
  if (!mov) throw Object.assign(new Error('Movimiento no encontrado'), { statusCode: 404 });
  if (mov.conciliado) throw Object.assign(new Error('El movimiento ya está conciliado'), { statusCode: 409 });

  const importeMov = Number(mov.haber) > 0 ? Number(mov.haber) : Number(mov.debe);

  await prisma.$transaction(async (tx) => {
    if (tipo === 'COMPROBANTE') {
      const comp = await tx.comprobanteIVA.findFirst({
        where: { id: referenciaId, empresa: { estudioId } },
      });
      if (!comp) throw Object.assign(new Error('Comprobante no encontrado'), { statusCode: 404 });
      await tx.pagoComprobante.create({
        data: {
          comprobanteId: comp.id,
          fecha: mov.fecha,
          importe: importeMov,
          medioPago: 'TRANSFERENCIA',
          referencia: mov.referencia || mov.descripcion.slice(0, 80),
          observaciones: 'Conciliación bancaria automática',
        },
      });
    } else if (tipo === 'FACTURA_HONORARIOS') {
      const fact = await tx.facturaHonorarios.findFirst({ where: { id: referenciaId, estudioId } });
      if (!fact) throw Object.assign(new Error('Factura de honorarios no encontrada'), { statusCode: 404 });
      await tx.facturaHonorarios.update({
        where: { id: fact.id },
        data: { estado: 'COBRADA', fechaCobro: mov.fecha },
      });
    } else {
      throw Object.assign(new Error('Tipo de conciliación inválido'), { statusCode: 400 });
    }

    await tx.movimientoBancario.update({ where: { id: mov.id }, data: { conciliado: true } });
  });

  return { ok: true, movimientoId: mov.id, tipo, referenciaId };
}

module.exports = { sugerirConciliacion, confirmarConciliacion, scoreImporte, scoreFecha, scoreCuit };
