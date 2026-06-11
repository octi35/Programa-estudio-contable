/**
 * Servicio de cálculo de contribuciones patronales argentinas.
 *
 * Lee tipos de contribución desde la DB (modelo TipoContribucion). Si no hay
 * tipos configurados, usa el fallback FALLBACK_AR_2026 con las alícuotas
 * vigentes según legislación AR para PyME (Decreto 814/2001).
 *
 * Resolución en cascada (más específico gana):
 *   1. Empresa específica + Convenio específico
 *   2. Empresa específica
 *   3. Convenio específico
 *   4. Estudio (sin filtros)
 */

const prisma = require('../../lib/prisma');

// Alícuotas legales AR vigentes en 2026 — PyME (Decreto 814/2001)
// Estos valores se usan si el estudio no configuró sus propios tipos.
const FALLBACK_AR_2026 = [
  { codigo: 'JUB_PATRONAL',     nombre: 'Aporte Jubilatorio Patronal (SIPA)', alicuota: 0.1600, base: 'REMUNERATIVO' },
  { codigo: 'OS_PATRONAL',      nombre: 'Contribución Obra Social',           alicuota: 0.0600, base: 'REMUNERATIVO' },
  { codigo: 'PAMI',             nombre: 'PAMI (Ley 19.032)',                  alicuota: 0.0150, base: 'REMUNERATIVO' },
  { codigo: 'ART',              nombre: 'ART (Riesgos del Trabajo)',          alicuota: 0.0250, base: 'REMUNERATIVO' },
  { codigo: 'FNE',              nombre: 'Fondo Nacional de Empleo',           alicuota: 0.0089, base: 'REMUNERATIVO' },
  { codigo: 'SEGURO_VIDA',      nombre: 'Seguro de Vida Obligatorio',         alicuota: 0.0003, base: 'REMUNERATIVO' },
  { codigo: 'ASIG_FAMILIARES',  nombre: 'Asignaciones Familiares',            alicuota: 0.0540, base: 'REMUNERATIVO' },
];

const APORTES_EMPLEADO_FALLBACK = [
  { codigo: 'APORTE_JUB',  nombre: 'Aporte Jubilatorio',   alicuota: 0.1100, base: 'REMUNERATIVO' },
  { codigo: 'APORTE_OS',   nombre: 'Aporte Obra Social',   alicuota: 0.0300, base: 'REMUNERATIVO' },
  { codigo: 'APORTE_PAMI', nombre: 'Aporte PAMI',          alicuota: 0.0300, base: 'REMUNERATIVO' },
];

const toNumber = (v) => Number(v);

/**
 * Devuelve los tipos vigentes para un (empresa, convenio) en una fecha dada.
 * Para cada `codigo`, toma la fila más específica vigente.
 */
async function getTiposVigentes(estudioId, empresaId = null, convenioId = null, fecha = new Date()) {
  const filas = await prisma.tipoContribucion.findMany({
    where: {
      estudioId,
      activo: true,
      vigenciaDesde: { lte: fecha },
      OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: fecha } }],
      AND: [
        { OR: [{ empresaId: null }, { empresaId }] },
        { OR: [{ convenioId: null }, { convenioId }] },
      ],
    },
    orderBy: { vigenciaDesde: 'desc' },
  });

  if (filas.length === 0) {
    return FALLBACK_AR_2026.map(f => ({ ...f, alicuota: f.alicuota, _source: 'fallback' }));
  }

  // Resolución en cascada: más específico gana por código
  const especificidad = (f) =>
    (f.empresaId ? 2 : 0) + (f.convenioId ? 1 : 0);

  const porCodigo = new Map();
  for (const f of filas) {
    const actual = porCodigo.get(f.codigo);
    if (!actual ||
        especificidad(f) > especificidad(actual) ||
        (especificidad(f) === especificidad(actual) && new Date(f.vigenciaDesde) > new Date(actual.vigenciaDesde))) {
      porCodigo.set(f.codigo, f);
    }
  }

  return Array.from(porCodigo.values()).map(f => ({
    id: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    alicuota: toNumber(f.alicuota),
    base: f.base,
    cuentaContableId: f.cuentaContableId,
    _source: 'db',
  }));
}

/**
 * Calcula las contribuciones patronales para todas las liquidaciones
 * CONFIRMADAS o CALCULADAS del período. Devuelve detalle por empleado +
 * totales agregados por tipo.
 */
async function calcularContribucionesEmpresa(estudioId, empresaId, anio, mes, tipo = 'MENSUAL') {
  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId, estudioId },
    select: { id: true, razonSocial: true, cuit: true, convenioId: true },
  });
  if (!empresa) throw Object.assign(new Error('Empresa no encontrada'), { statusCode: 404 });

  const liquidaciones = await prisma.liquidacion.findMany({
    where: {
      periodo: { empresaId, anio, mes, tipo },
      estado: { in: ['CALCULADO', 'CONFIRMADO'] },
    },
    include: {
      empleado: { select: { id: true, apellido: true, nombre: true, cuil: true, legajoNumero: true, convenioId: true } },
      detalles: { select: { naturaleza: true, tipo: true, remunerativo: true, importe: true } },
    },
    orderBy: { empleado: { apellido: 'asc' } },
  });

  if (liquidaciones.length === 0) {
    return {
      empresa, periodo: { anio, mes, tipo },
      tiposAplicados: [], detallePorEmpleado: [], totales: {}, totalGeneral: 0,
      cantidadEmpleados: 0,
    };
  }

  // Para cada liquidación, obtenemos los tipos aplicables (puede variar por convenio del empleado)
  const tiposPorConvenio = new Map();
  const obtenerTipos = async (convenioId) => {
    const key = convenioId || '__sin_convenio__';
    if (!tiposPorConvenio.has(key)) {
      tiposPorConvenio.set(key, await getTiposVigentes(estudioId, empresaId, convenioId));
    }
    return tiposPorConvenio.get(key);
  };

  const detallePorEmpleado = [];
  const totalesPorCodigo = {};

  for (const liq of liquidaciones) {
    const tipos = await obtenerTipos(liq.empleado.convenioId || empresa.convenioId);

    // Calcular bases
    const remunerativo = liq.detalles
      .filter(d => d.naturaleza === 'HABER' && d.remunerativo)
      .reduce((s, d) => s + toNumber(d.importe), 0);
    const noRemunerativo = liq.detalles
      .filter(d => d.naturaleza === 'HABER' && !d.remunerativo)
      .reduce((s, d) => s + toNumber(d.importe), 0);
    const bruto = remunerativo + noRemunerativo;

    const lineas = {};
    let totalEmpleado = 0;
    for (const t of tipos) {
      let base;
      if (t.base === 'REMUNERATIVO') base = remunerativo;
      else if (t.base === 'BRUTO') base = bruto;
      else if (t.base === 'FIJO') { lineas[t.codigo] = toNumber(t.alicuota); totalEmpleado += toNumber(t.alicuota); continue; }
      else base = remunerativo;

      const importe = Math.round(base * Number(t.alicuota) * 100) / 100;
      lineas[t.codigo] = importe;
      totalEmpleado += importe;
      totalesPorCodigo[t.codigo] = (totalesPorCodigo[t.codigo] || 0) + importe;
    }

    detallePorEmpleado.push({
      empleadoId: liq.empleado.id,
      empleado: `${liq.empleado.apellido}, ${liq.empleado.nombre}`,
      cuil: liq.empleado.cuil,
      legajo: liq.empleado.legajoNumero,
      remunerativo, noRemunerativo, bruto,
      contribuciones: lineas,
      totalContribuciones: Math.round(totalEmpleado * 100) / 100,
      costoTotal: Math.round((bruto + totalEmpleado) * 100) / 100,
    });
  }

  // Tipos aplicados (tomamos los del primer empleado como referencia para la UI)
  const tiposAplicados = liquidaciones.length
    ? (await obtenerTipos(liquidaciones[0].empleado.convenioId || empresa.convenioId))
    : [];

  const totalGeneral = Object.values(totalesPorCodigo).reduce((s, v) => s + v, 0);
  const totalRemunerativo = detallePorEmpleado.reduce((s, d) => s + d.remunerativo, 0);
  const totalBruto = detallePorEmpleado.reduce((s, d) => s + d.bruto, 0);

  return {
    empresa,
    periodo: { anio, mes, tipo },
    cantidadEmpleados: detallePorEmpleado.length,
    tiposAplicados,
    detallePorEmpleado,
    totales: totalesPorCodigo,
    totalGeneral: Math.round(totalGeneral * 100) / 100,
    totalRemunerativo: Math.round(totalRemunerativo * 100) / 100,
    totalBruto: Math.round(totalBruto * 100) / 100,
    costoTotal: Math.round((totalBruto + totalGeneral) * 100) / 100,
  };
}

/**
 * Devuelve un comparativo del período actual contra el mes anterior.
 */
async function comparativoMesAnterior(estudioId, empresaId, anio, mes) {
  const mesAnteriorM = mes === 1 ? 12 : mes - 1;
  const anioAnterior = mes === 1 ? anio - 1 : anio;
  const [actual, anterior] = await Promise.all([
    calcularContribucionesEmpresa(estudioId, empresaId, anio, mes),
    calcularContribucionesEmpresa(estudioId, empresaId, anioAnterior, mesAnteriorM).catch(() => null),
  ]);
  const variacion = anterior && anterior.totalGeneral > 0
    ? Math.round(((actual.totalGeneral - anterior.totalGeneral) / anterior.totalGeneral) * 1000) / 10
    : null;
  return { actual, anterior, variacion };
}

module.exports = {
  getTiposVigentes,
  calcularContribucionesEmpresa,
  comparativoMesAnterior,
  FALLBACK_AR_2026,
  APORTES_EMPLEADO_FALLBACK,
};
