/**
 * Control inteligente de liquidaciones (pre-cierre).
 *
 * Automatiza la revisión manual que hace el contador antes de confirmar
 * un período: compara contra el mes anterior y detecta anomalías típicas.
 *
 * Severidades:
 *   CRITICO     → no debería cerrarse el período sin resolverlo
 *   ADVERTENCIA → revisar; puede ser legítimo (aumento paritario, premio)
 *   INFO        → cambio esperable que conviene tener a la vista
 */

const prisma = require('../../lib/prisma');

const UMBRAL_VARIACION_NETO = 0.25; // ±25% vs mes anterior
const UMBRAL_DESCUENTOS = 0.45; // descuentos > 45% del bruto

const toNum = (v) => Number(v) || 0;

async function liquidacionesDePeriodo(empresaId, anio, mes, tipo) {
  return prisma.liquidacion.findMany({
    where: {
      periodo: { empresaId, anio, mes, tipo },
      estado: { in: ['BORRADOR', 'CALCULADO', 'CONFIRMADO'] },
    },
    include: {
      empleado: { select: { id: true, apellido: true, nombre: true, cuil: true, legajoNumero: true, basicoMensual: true, activo: true } },
      detalles: { select: { conceptoId: true, descripcion: true, naturaleza: true, importe: true, remunerativo: true } },
    },
  });
}

/**
 * Ejecuta todos los controles sobre un período y devuelve los hallazgos.
 */
async function controlarPeriodo(estudioId, empresaId, anio, mes, tipo = 'MENSUAL') {
  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, estudioId },
    select: { id: true, razonSocial: true },
  });
  if (!empresa) throw Object.assign(new Error('Empresa no encontrada'), { statusCode: 404 });

  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anioAnt = mes === 1 ? anio - 1 : anio;

  const [actuales, anteriores, empleadosActivos] = await Promise.all([
    liquidacionesDePeriodo(empresaId, anio, mes, tipo),
    liquidacionesDePeriodo(empresaId, anioAnt, mesAnt, tipo),
    prisma.empleado.findMany({
      where: { empresaId, activo: true },
      select: { id: true, apellido: true, nombre: true, fechaIngreso: true },
    }),
  ]);

  const hallazgos = [];
  const agregar = (severidad, codigo, mensaje, empleado = null, datos = {}) =>
    hallazgos.push({
      severidad,
      codigo,
      mensaje,
      empleado: empleado ? `${empleado.apellido}, ${empleado.nombre}` : null,
      empleadoId: empleado ? empleado.id : null,
      datos,
    });

  const anteriorPorEmpleado = new Map(anteriores.map(l => [l.empleadoId, l]));
  const actualPorEmpleado = new Map(actuales.map(l => [l.empleadoId, l]));

  for (const liq of actuales) {
    const emp = liq.empleado;
    const neto = toNum(liq.totalNeto);
    const haberes = toNum(liq.totalHaberes);
    const descuentos = toNum(liq.totalDescuentos);

    // 1. Neto negativo o cero
    if (neto <= 0) {
      agregar('CRITICO', 'NETO_NO_POSITIVO',
        `El neto de la liquidación es $${neto.toLocaleString('es-AR')} (≤ 0)`, emp, { neto });
    }

    // 2. Descuentos desproporcionados (LCT art. 133: tope de retenciones)
    if (haberes > 0 && descuentos / haberes > UMBRAL_DESCUENTOS) {
      agregar('CRITICO', 'DESCUENTOS_EXCESIVOS',
        `Los descuentos representan ${Math.round((descuentos / haberes) * 100)}% del bruto (tope LCT art. 133)`,
        emp, { haberes, descuentos });
    }

    // 3. Sin aportes de ley (jubilación/OS/PAMI ausentes)
    const tieneAportes = liq.detalles.some(d => d.naturaleza === 'DESCUENTO' && toNum(d.importe) > 0);
    if (haberes > 0 && !tieneAportes) {
      agregar('ADVERTENCIA', 'SIN_APORTES',
        'La liquidación no tiene ningún descuento de ley (¿jubilación/obra social/PAMI?)', emp);
    }

    // 4. Conceptos duplicados dentro de la misma liquidación
    const vistos = new Map();
    for (const d of liq.detalles) {
      const key = d.conceptoId;
      if (vistos.has(key)) {
        agregar('ADVERTENCIA', 'CONCEPTO_DUPLICADO',
          `El concepto "${d.descripcion}" aparece más de una vez en el recibo`, emp, { concepto: d.descripcion });
      }
      vistos.set(key, true);
    }

    // 5. Variación de neto vs mes anterior
    const ant = anteriorPorEmpleado.get(liq.empleadoId);
    if (ant) {
      const netoAnt = toNum(ant.totalNeto);
      if (netoAnt > 0) {
        const variacion = (neto - netoAnt) / netoAnt;
        if (Math.abs(variacion) > UMBRAL_VARIACION_NETO) {
          agregar('ADVERTENCIA', 'VARIACION_NETO',
            `El neto varió ${(variacion * 100).toFixed(1)}% vs ${mesAnt}/${anioAnt} ` +
            `($${netoAnt.toLocaleString('es-AR')} → $${neto.toLocaleString('es-AR')})`,
            emp, { netoAnterior: netoAnt, netoActual: neto, variacion: Math.round(variacion * 1000) / 10 });
        }
      }
    } else if (anteriores.length > 0) {
      agregar('INFO', 'EMPLEADO_NUEVO_EN_PERIODO',
        `No tenía liquidación en ${mesAnt}/${anioAnt} (¿ingreso reciente?)`, emp);
    }

    // 6. Liquidación de empleado dado de baja
    if (!emp.activo) {
      agregar('ADVERTENCIA', 'EMPLEADO_INACTIVO',
        'Tiene liquidación en este período pero figura dado de baja', emp);
    }
  }

  // 7. Empleados activos sin liquidar (que sí estaban el mes pasado)
  for (const emp of empleadosActivos) {
    if (!actualPorEmpleado.has(emp.id) && anteriorPorEmpleado.has(emp.id)) {
      agregar('CRITICO', 'EMPLEADO_SIN_LIQUIDAR',
        `Está activo y se liquidó en ${mesAnt}/${anioAnt}, pero no tiene liquidación en este período`, emp);
    }
  }

  // 8. Control de masa salarial total
  const masaActual = actuales.reduce((s, l) => s + toNum(l.totalNeto), 0);
  const masaAnterior = anteriores.reduce((s, l) => s + toNum(l.totalNeto), 0);
  if (masaAnterior > 0) {
    const variacionMasa = (masaActual - masaAnterior) / masaAnterior;
    if (Math.abs(variacionMasa) > UMBRAL_VARIACION_NETO) {
      agregar('ADVERTENCIA', 'VARIACION_MASA_SALARIAL',
        `La masa salarial neta varió ${(variacionMasa * 100).toFixed(1)}% vs ${mesAnt}/${anioAnt} ` +
        `($${masaAnterior.toLocaleString('es-AR')} → $${masaActual.toLocaleString('es-AR')})`,
        null, { masaAnterior, masaActual });
    }
  }

  const criticos = hallazgos.filter(h => h.severidad === 'CRITICO').length;
  const advertencias = hallazgos.filter(h => h.severidad === 'ADVERTENCIA').length;

  return {
    empresa,
    periodo: { anio, mes, tipo },
    liquidacionesAnalizadas: actuales.length,
    comparadoContra: anteriores.length > 0 ? { anio: anioAnt, mes: mesAnt, liquidaciones: anteriores.length } : null,
    resumen: {
      criticos,
      advertencias,
      info: hallazgos.length - criticos - advertencias,
      apto: criticos === 0,
    },
    hallazgos,
  };
}

module.exports = { controlarPeriodo, UMBRAL_VARIACION_NETO, UMBRAL_DESCUENTOS };
