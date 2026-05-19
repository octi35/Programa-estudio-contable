
async function buscarCuenta(empresaId, tipo, patron) {
  return prisma.cuentaContable.findFirst({
    where: {
      empresaId,
      tipo,
      nombre: { contains: patron, mode: 'insensitive' },
      permiteMovimientos: true,
      activa: true,
    },
    orderBy: { codigo: 'asc' },
  });
}

async function buscarEjercicioAbierto(empresaId) {
  return prisma.ejercicioContable.findFirst({
    where: { empresaId, estado: 'ABIERTO' },
    orderBy: { fechaInicio: 'desc' },
  });
}

async function proximoNumero(empresaId, ejercicioId) {
const prisma = require('../lib/prisma');
  const ultimo = await prisma.asiento.findFirst({
    where: { empresaId, ejercicioId },
    orderBy: { numero: 'desc' },
  });
  return (ultimo?.numero || 0) + 1;
}

/**
 * Crea asiento contable automático al confirmar una liquidación.
 * Si no hay ejercicio abierto o faltan cuentas, retorna null sin lanzar error.
 */
async function crearAsientoLiquidacion(liquidacion) {
  try {
    const empresaId = liquidacion.empleado?.empresa?.id || liquidacion.empleado?.empresaId;
    if (!empresaId) return null;

    const ejercicio = await buscarEjercicioAbierto(empresaId);
    if (!ejercicio) return null;

    // Buscar cuentas necesarias
    const [
      ctaSueldos,        // Gasto
      ctaCargasSoc,      // Gasto
      ctaSueldosPagar,   // Pasivo
      ctaAportesPagar,   // Pasivo
      ctaCargasPagar,    // Pasivo
    ] = await Promise.all([
      buscarCuenta(empresaId, 'RESULTADO_NEGATIVO', 'sueldo'),
      buscarCuenta(empresaId, 'RESULTADO_NEGATIVO', 'carga'),
      buscarCuenta(empresaId, 'PASIVO', 'sueldo'),
      buscarCuenta(empresaId, 'PASIVO', 'aporte'),
      buscarCuenta(empresaId, 'PASIVO', 'carga'),
    ]);

    // Necesitamos al menos las cuentas básicas
    if (!ctaSueldos || !ctaSueldosPagar) return null;

    const totalHaberes = Number(liquidacion.totalHaberes);
    const totalDescuentos = Number(liquidacion.totalDescuentos);
    const totalNeto = Number(liquidacion.totalNeto);
    const totalContrib = Number(liquidacion.totalContribuciones);

    const lineas = [];
    let totalDebe = 0, totalHaber = 0;

    // Debe: Sueldos y Jornales
    lineas.push({ cuentaContableId: ctaSueldos.id, debe: totalHaberes, haber: 0, descripcion: 'Sueldos devengados', orden: 1 });
    totalDebe += totalHaberes;

    // Debe: Cargas sociales empleador
    if (ctaCargasSoc && totalContrib > 0) {
      lineas.push({ cuentaContableId: ctaCargasSoc.id, debe: totalContrib, haber: 0, descripcion: 'Cargas sociales empleador', orden: 2 });
      totalDebe += totalContrib;
    }

    // Haber: Sueldos a Pagar (neto)
    lineas.push({ cuentaContableId: ctaSueldosPagar.id, debe: 0, haber: totalNeto, descripcion: 'Neto a pagar empleados', orden: 3 });
    totalHaber += totalNeto;

    // Haber: Aportes retenidos
    if (ctaAportesPagar && totalDescuentos > 0) {
      lineas.push({ cuentaContableId: ctaAportesPagar.id, debe: 0, haber: totalDescuentos, descripcion: 'Aportes retenidos empleados', orden: 4 });
      totalHaber += totalDescuentos;
    } else if (totalDescuentos > 0) {
      // Si no hay cuenta separada, agregar al sueldo a pagar
      const idx = lineas.findIndex(l => l.cuentaContableId === ctaSueldosPagar.id);
      if (idx >= 0) { lineas[idx].haber += totalDescuentos; totalHaber += totalDescuentos; }
    }

    // Haber: Cargas sociales a pagar
    if (ctaCargasPagar && totalContrib > 0) {
      lineas.push({ cuentaContableId: ctaCargasPagar.id, debe: 0, haber: totalContrib, descripcion: 'Cargas sociales a pagar', orden: 5 });
      totalHaber += totalContrib;
    } else if (ctaCargasSoc && totalContrib > 0) {
      // Cuadrar con ajuste
      const diff = totalDebe - totalHaber;
      if (Math.abs(diff) > 0.01 && ctaSueldosPagar) {
        lineas.push({ cuentaContableId: ctaSueldosPagar.id, debe: 0, haber: diff, descripcion: 'Cargas sociales a pagar', orden: 6 });
        totalHaber += diff;
      }
    }

    // Verificar balance (permitir diferencia centavos)
    if (Math.abs(totalDebe - totalHaber) > 1) return null;

    const mes = liquidacion.mes;
    const anio = liquidacion.anio;
    const numero = await proximoNumero(empresaId, ejercicio.id);
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const asiento = await prisma.asiento.create({
      data: {
        empresaId,
        ejercicioId: ejercicio.id,
        numero,
        fecha: new Date(`${anio}-${String(mes).padStart(2,'0')}-28`),
        descripcion: `Sueldos ${meses[mes-1]} ${anio} — ${liquidacion.empleado?.apellido || 'empleado'}`,
        origen: 'SUELDOS',
        origenId: liquidacion.id,
        totalDebe: Math.round(totalDebe * 100) / 100,
        totalHaber: Math.round(totalHaber * 100) / 100,
        lineas: { create: lineas },
      },
    });

    return asiento;
  } catch (err) {
    console.error('asientosAutoService.crearAsientoLiquidacion:', err.message);
    return null;
  }
}

/**
 * Crea asiento contable automático al registrar un comprobante IVA.
 */
async function crearAsientoIVA(comprobante, empresaId) {
  try {
    const ejercicio = await buscarEjercicioAbierto(empresaId);
    if (!ejercicio) return null;

    const total = Number(comprobante.total);
    const netoGravado = Number(comprobante.netoGravado21 || 0) + Number(comprobante.netoGravado105 || 0) + Number(comprobante.netoGravado27 || 0);
    const totalIVA = Number(comprobante.iva21 || 0) + Number(comprobante.iva105 || 0) + Number(comprobante.iva27 || 0);

    if (total <= 0) return null;

    const lineas = [];
    let totalDebe = 0, totalHaber = 0;

    if (comprobante.tipoMovimiento === 'COMPRA') {
      const ctaGasto = await buscarCuenta(empresaId, 'RESULTADO_NEGATIVO', 'compra') ||
                       await buscarCuenta(empresaId, 'RESULTADO_NEGATIVO', 'gasto');
      const ctaIVA = await buscarCuenta(empresaId, 'ACTIVO', 'iva');
      const ctaProveedor = await buscarCuenta(empresaId, 'PASIVO', 'proveedor') ||
                           await buscarCuenta(empresaId, 'PASIVO', 'cuenta a pagar');

      if (!ctaGasto || !ctaProveedor) return null;

      if (netoGravado > 0) {
        lineas.push({ cuentaContableId: ctaGasto.id, debe: netoGravado, haber: 0, descripcion: 'Neto compra', orden: 1 });
        totalDebe += netoGravado;
      }
      if (ctaIVA && totalIVA > 0) {
        lineas.push({ cuentaContableId: ctaIVA.id, debe: totalIVA, haber: 0, descripcion: 'IVA Crédito Fiscal', orden: 2 });
        totalDebe += totalIVA;
      }

      const importeProveedor = netoGravado + (ctaIVA ? totalIVA : 0);
      lineas.push({ cuentaContableId: ctaProveedor.id, debe: 0, haber: importeProveedor, descripcion: comprobante.proveedorCliente?.razonSocial || 'Proveedor', orden: 3 });
      totalHaber += importeProveedor;

    } else { // VENTA
      const ctaVenta = await buscarCuenta(empresaId, 'RESULTADO_POSITIVO', 'venta');
      const ctaIVA = await buscarCuenta(empresaId, 'PASIVO', 'iva');
      const ctaCliente = await buscarCuenta(empresaId, 'ACTIVO', 'cliente') ||
                         await buscarCuenta(empresaId, 'ACTIVO', 'cuenta a cobrar');

      if (!ctaVenta || !ctaCliente) return null;

      lineas.push({ cuentaContableId: ctaCliente.id, debe: total, haber: 0, descripcion: comprobante.proveedorCliente?.razonSocial || 'Cliente', orden: 1 });
      totalDebe += total;

      if (netoGravado > 0) {
        lineas.push({ cuentaContableId: ctaVenta.id, debe: 0, haber: netoGravado, descripcion: 'Neto venta', orden: 2 });
        totalHaber += netoGravado;
      }
      if (ctaIVA && totalIVA > 0) {
        lineas.push({ cuentaContableId: ctaIVA.id, debe: 0, haber: totalIVA, descripcion: 'IVA Débito Fiscal', orden: 3 });
        totalHaber += totalIVA;
      }
    }

    if (Math.abs(totalDebe - totalHaber) > 1) return null;

    const numero = await proximoNumero(empresaId, ejercicio.id);
    const fecha = comprobante.fecha ? new Date(comprobante.fecha) : new Date();

    const asiento = await prisma.asiento.create({
      data: {
        empresaId,
        ejercicioId: ejercicio.id,
        numero,
        fecha,
        descripcion: `${comprobante.tipoMovimiento} ${comprobante.tipoComprobante} ${comprobante.puntoVenta}-${comprobante.numero}`,
        origen: comprobante.tipoMovimiento === 'COMPRA' ? 'IVA_COMPRAS' : 'IVA_VENTAS',
        origenId: comprobante.id,
        totalDebe: Math.round(totalDebe * 100) / 100,
        totalHaber: Math.round(totalHaber * 100) / 100,
        lineas: { create: lineas },
      },
    });

    return asiento;
  } catch (err) {
    console.error('asientosAutoService.crearAsientoIVA:', err.message);
    return null;
  }
}

module.exports = { crearAsientoLiquidacion, crearAsientoIVA };
