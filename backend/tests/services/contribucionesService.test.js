// Tests del cálculo de contribuciones patronales. Mockea prisma.

jest.mock('../../src/lib/prisma', () => ({
  tipoContribucion: { findMany: jest.fn() },
  liquidacion: { findMany: jest.fn() },
  empresa: { findFirst: jest.fn() },
}));

const prisma = require('../../src/lib/prisma');
const {
  getTiposVigentes,
  calcularContribucionesEmpresa,
  FALLBACK_AR_2026,
} = require('../../src/services/sueldos/contribucionesService');

beforeEach(() => jest.clearAllMocks());

describe('getTiposVigentes', () => {
  test('devuelve fallback legal AR si DB está vacía', async () => {
    prisma.tipoContribucion.findMany.mockResolvedValue([]);
    const r = await getTiposVigentes('est-1');
    expect(r).toHaveLength(FALLBACK_AR_2026.length);
    expect(r[0]._source).toBe('fallback');
    // Jubilación patronal AR 2026 PyME
    const jub = r.find(t => t.codigo === 'JUB_PATRONAL');
    expect(jub.alicuota).toBe(0.16);
  });

  test('fila específica por empresa pisa fila general', async () => {
    prisma.tipoContribucion.findMany.mockResolvedValue([
      { id: '1', codigo: 'JUB_PATRONAL', nombre: 'Jub estudio', alicuota: 0.16, base: 'REMUNERATIVO', empresaId: null, convenioId: null, vigenciaDesde: new Date('2026-01-01'), cuentaContableId: null },
      { id: '2', codigo: 'JUB_PATRONAL', nombre: 'Jub empresa', alicuota: 0.20, base: 'REMUNERATIVO', empresaId: 'emp-1', convenioId: null, vigenciaDesde: new Date('2026-01-01'), cuentaContableId: null },
    ]);
    const r = await getTiposVigentes('est-1', 'emp-1');
    expect(r).toHaveLength(1);
    expect(r[0].alicuota).toBe(0.20);
    expect(r[0].nombre).toBe('Jub empresa');
  });

  test('fila específica por convenio pisa la general', async () => {
    prisma.tipoContribucion.findMany.mockResolvedValue([
      { id: '1', codigo: 'ART', nombre: 'ART default', alicuota: 0.025, base: 'REMUNERATIVO', empresaId: null, convenioId: null, vigenciaDesde: new Date('2026-01-01'), cuentaContableId: null },
      { id: '2', codigo: 'ART', nombre: 'ART construcción', alicuota: 0.060, base: 'REMUNERATIVO', empresaId: null, convenioId: 'conv-uocra', vigenciaDesde: new Date('2026-01-01'), cuentaContableId: null },
    ]);
    const r = await getTiposVigentes('est-1', null, 'conv-uocra');
    expect(r[0].alicuota).toBe(0.06);
  });

  test('empresa + convenio (más específico) gana sobre solo empresa', async () => {
    prisma.tipoContribucion.findMany.mockResolvedValue([
      { id: '1', codigo: 'ART', nombre: 'ART empresa', alicuota: 0.03, base: 'REMUNERATIVO', empresaId: 'emp-1', convenioId: null, vigenciaDesde: new Date('2026-01-01'), cuentaContableId: null },
      { id: '2', codigo: 'ART', nombre: 'ART empresa+conv', alicuota: 0.05, base: 'REMUNERATIVO', empresaId: 'emp-1', convenioId: 'conv-1', vigenciaDesde: new Date('2026-01-01'), cuentaContableId: null },
    ]);
    const r = await getTiposVigentes('est-1', 'emp-1', 'conv-1');
    expect(r[0].alicuota).toBe(0.05);
  });

  test('toma la vigencia más reciente con misma especificidad', async () => {
    prisma.tipoContribucion.findMany.mockResolvedValue([
      { id: '1', codigo: 'FNE', nombre: 'FNE viejo', alicuota: 0.0089, base: 'REMUNERATIVO', empresaId: null, convenioId: null, vigenciaDesde: new Date('2025-01-01'), cuentaContableId: null },
      { id: '2', codigo: 'FNE', nombre: 'FNE nuevo', alicuota: 0.0100, base: 'REMUNERATIVO', empresaId: null, convenioId: null, vigenciaDesde: new Date('2026-01-01'), cuentaContableId: null },
    ]);
    const r = await getTiposVigentes('est-1');
    expect(r[0].alicuota).toBe(0.01);
  });
});

describe('calcularContribucionesEmpresa', () => {
  test('aplica alícuotas legales y agrega totales', async () => {
    prisma.empresa.findFirst.mockResolvedValue({
      id: 'emp-1', razonSocial: 'ACME', cuit: '30-12345678-1', convenioId: null,
    });
    prisma.liquidacion.findMany.mockResolvedValue([
      {
        empleado: { id: 'e-1', apellido: 'Pérez', nombre: 'Juan', cuil: '20-11111111-1', legajoNumero: '1', convenioId: null },
        detalles: [
          { naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true,  importe: 100000 },
          { naturaleza: 'HABER', tipo: 'NO_REMUNERATIVO', remunerativo: false, importe: 20000 },
        ],
      },
      {
        empleado: { id: 'e-2', apellido: 'García', nombre: 'Ana', cuil: '27-22222222-2', legajoNumero: '2', convenioId: null },
        detalles: [
          { naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, importe: 200000 },
        ],
      },
    ]);
    prisma.tipoContribucion.findMany.mockResolvedValue([]); // → usa fallback

    const r = await calcularContribucionesEmpresa('est-1', 'emp-1', 2026, 5);

    expect(r.cantidadEmpleados).toBe(2);
    expect(r.totalRemunerativo).toBe(300000);
    // Jubilación patronal: 16% de 300000 = 48000
    expect(r.totales.JUB_PATRONAL).toBe(48000);
    // ART: 2.5% de 300000 = 7500
    expect(r.totales.ART).toBe(7500);
    // Total contribuciones según fallback (16+6+1.5+2.5+0.89+0.03+5.4 = 32.32%)
    expect(r.totalGeneral).toBeCloseTo(300000 * 0.3232, 1);
    // Costo total = bruto + contribuciones
    expect(r.costoTotal).toBeCloseTo(r.totalBruto + r.totalGeneral, 1);
  });

  test('devuelve objeto vacío si no hay liquidaciones', async () => {
    prisma.empresa.findFirst.mockResolvedValue({ id: 'emp-1', razonSocial: 'X', cuit: '30-1', convenioId: null });
    prisma.liquidacion.findMany.mockResolvedValue([]);
    const r = await calcularContribucionesEmpresa('est-1', 'emp-1', 2026, 5);
    expect(r.cantidadEmpleados).toBe(0);
    expect(r.detallePorEmpleado).toEqual([]);
  });

  test('error 404 si la empresa no pertenece al estudio', async () => {
    prisma.empresa.findFirst.mockResolvedValue(null);
    await expect(calcularContribucionesEmpresa('est-1', 'emp-X', 2026, 5))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
