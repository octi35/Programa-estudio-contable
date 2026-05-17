const prisma = require('./prisma');

// Fallback hardcodeado (categorías 2024) si el estudio aún no cargó las suyas.
const FALLBACK_2024 = [
  { categoria: 'A', limiteIngresos: 6450000,  cuotaImpuesto: 2960,   cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 9499 },
  { categoria: 'B', limiteIngresos: 9450000,  cuotaImpuesto: 5020,   cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 11559 },
  { categoria: 'C', limiteIngresos: 13250000, cuotaImpuesto: 7960,   cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 14499 },
  { categoria: 'D', limiteIngresos: 16450000, cuotaImpuesto: 11860,  cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 18399 },
  { categoria: 'E', limiteIngresos: 19350000, cuotaImpuesto: 17360,  cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 23899 },
  { categoria: 'F', limiteIngresos: 24250000, cuotaImpuesto: 24060,  cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 30599 },
  { categoria: 'G', limiteIngresos: 29000000, cuotaImpuesto: 30960,  cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 37499 },
  { categoria: 'H', limiteIngresos: 44000000, cuotaImpuesto: 70160,  cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 76699 },
  { categoria: 'I', limiteIngresos: 49250000, cuotaImpuesto: 86560,  cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 93099 },
  { categoria: 'J', limiteIngresos: 56400000, cuotaImpuesto: 104060, cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 110599 },
  { categoria: 'K', limiteIngresos: 68000000, cuotaImpuesto: 124360, cuotaObraSocial: 5018, cuotaJubilacion: 1521, total: 130899 },
];

const toNumberObj = (c) => ({
  categoria: c.categoria,
  limiteIngresos: Number(c.limiteIngresos),
  cuotaImpuesto: Number(c.cuotaImpuesto),
  cuotaObraSocial: Number(c.cuotaObraSocial),
  cuotaJubilacion: Number(c.cuotaJubilacion),
  total: Number(c.total),
  vigenciaDesde: c.vigenciaDesde,
});

/**
 * Devuelve las categorías vigentes al momento `enFecha` para el `estudioId`.
 * Para cada categoria (A, B, C, ...) toma la fila con vigenciaDesde más reciente <= enFecha.
 * Si la DB no tiene categorías, devuelve el fallback hardcodeado.
 */
async function getCategoriasVigentes(estudioId, enFecha = new Date()) {
  if (!estudioId) return FALLBACK_2024.map(c => ({ ...c, _source: 'fallback' }));

  const filas = await prisma.monotributoCategoria.findMany({
    where: { estudioId, vigenciaDesde: { lte: enFecha } },
    orderBy: [{ categoria: 'asc' }, { vigenciaDesde: 'desc' }],
  });

  if (filas.length === 0) return FALLBACK_2024.map(c => ({ ...c, _source: 'fallback' }));

  // Quedarme con la fila más reciente por categoría
  const vistos = new Set();
  const out = [];
  for (const f of filas) {
    if (vistos.has(f.categoria)) continue;
    vistos.add(f.categoria);
    out.push({ ...toNumberObj(f), _source: 'db' });
  }
  return out.sort((a, b) => a.limiteIngresos - b.limiteIngresos);
}

function determinarCategoriaPara(ingresosBrutosAnuales, categorias) {
  const ingresos = Number(ingresosBrutosAnuales);
  const orden = [...categorias].sort((a, b) => a.limiteIngresos - b.limiteIngresos);
  const cat = orden.find(c => ingresos <= c.limiteIngresos);
  return cat || orden[orden.length - 1];
}

module.exports = { getCategoriasVigentes, determinarCategoriaPara, FALLBACK_2024 };
