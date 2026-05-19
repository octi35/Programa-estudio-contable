jest.mock('../../src/lib/prisma', () => ({
  monotributoCategoria: { findMany: jest.fn() },
}));

const prisma = require('../../src/lib/prisma');
const { getCategoriasVigentes, determinarCategoriaPara, FALLBACK_2024 } = require('../../src/lib/monotributoCategorias');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCategoriasVigentes', () => {
  test('devuelve fallback si DB vacía', async () => {
    prisma.monotributoCategoria.findMany.mockResolvedValue([]);
    const r = await getCategoriasVigentes('est-1');
    expect(r).toHaveLength(FALLBACK_2024.length);
    expect(r[0]._source).toBe('fallback');
  });

  test('devuelve fallback si estudioId no se pasa', async () => {
    const r = await getCategoriasVigentes(null);
    expect(r[0]._source).toBe('fallback');
    expect(prisma.monotributoCategoria.findMany).not.toHaveBeenCalled();
  });

  test('toma la vigencia más reciente por categoría', async () => {
    prisma.monotributoCategoria.findMany.mockResolvedValue([
      { categoria: 'A', limiteIngresos: 100, cuotaImpuesto: 1, cuotaObraSocial: 1, cuotaJubilacion: 1, total: 3, vigenciaDesde: new Date('2026-01-01') },
      { categoria: 'A', limiteIngresos: 80,  cuotaImpuesto: 1, cuotaObraSocial: 1, cuotaJubilacion: 1, total: 3, vigenciaDesde: new Date('2025-01-01') },
      { categoria: 'B', limiteIngresos: 200, cuotaImpuesto: 2, cuotaObraSocial: 1, cuotaJubilacion: 1, total: 4, vigenciaDesde: new Date('2026-01-01') },
    ]);
    const r = await getCategoriasVigentes('est-1');
    const catA = r.find(c => c.categoria === 'A');
    expect(catA.limiteIngresos).toBe(100); // tomó la del 2026, no la del 2025
    expect(r).toHaveLength(2);
  });

  test('ordena por límite ascendente', async () => {
    prisma.monotributoCategoria.findMany.mockResolvedValue([
      { categoria: 'C', limiteIngresos: 300, cuotaImpuesto: 1, cuotaObraSocial: 1, cuotaJubilacion: 1, total: 3, vigenciaDesde: new Date() },
      { categoria: 'A', limiteIngresos: 100, cuotaImpuesto: 1, cuotaObraSocial: 1, cuotaJubilacion: 1, total: 3, vigenciaDesde: new Date() },
      { categoria: 'B', limiteIngresos: 200, cuotaImpuesto: 1, cuotaObraSocial: 1, cuotaJubilacion: 1, total: 3, vigenciaDesde: new Date() },
    ]);
    const r = await getCategoriasVigentes('est-1');
    expect(r.map(c => c.categoria)).toEqual(['A', 'B', 'C']);
  });
});

describe('determinarCategoriaPara', () => {
  const cats = [
    { categoria: 'A', limiteIngresos: 100 },
    { categoria: 'B', limiteIngresos: 200 },
    { categoria: 'C', limiteIngresos: 300 },
  ];

  test('devuelve la categoría donde encaja el ingreso', () => {
    expect(determinarCategoriaPara(50,  cats).categoria).toBe('A');
    expect(determinarCategoriaPara(150, cats).categoria).toBe('B');
    expect(determinarCategoriaPara(250, cats).categoria).toBe('C');
  });

  test('si supera todos, devuelve la última', () => {
    expect(determinarCategoriaPara(99999, cats).categoria).toBe('C');
  });

  test('límite exacto encaja en esa categoría', () => {
    expect(determinarCategoriaPara(100, cats).categoria).toBe('A');
    expect(determinarCategoriaPara(200, cats).categoria).toBe('B');
  });
});
