// Tests del control pre-cierre de liquidaciones. Mockea prisma.

jest.mock('../../src/lib/prisma', () => ({
  empresa: { findFirst: jest.fn() },
  liquidacion: { findMany: jest.fn() },
  empleado: { findMany: jest.fn() },
}));

const prisma = require('../../src/lib/prisma');
const { controlarPeriodo } = require('../../src/services/sueldos/controlLiquidacionService');

beforeEach(() => jest.clearAllMocks());

const mkEmpleado = (id, apellido = 'Pérez', activo = true) => ({
  id, apellido, nombre: 'Juan', cuil: `20-${id}-1`, legajoNumero: id, basicoMensual: 100, activo,
});

const mkLiq = (empleadoId, { neto = 100000, haberes = 120000, descuentos = 20000, detalles, activo = true, apellido } = {}) => ({
  empleadoId,
  totalNeto: neto,
  totalHaberes: haberes,
  totalDescuentos: descuentos,
  empleado: mkEmpleado(empleadoId, apellido ?? `Emp${empleadoId}`, activo),
  detalles: detalles ?? [
    { conceptoId: 'c-basico', descripcion: 'Sueldo básico', naturaleza: 'HABER', importe: haberes, remunerativo: true },
    { conceptoId: 'c-jub', descripcion: 'Jubilación', naturaleza: 'DESCUENTO', importe: descuentos, remunerativo: true },
  ],
});

function mockEscenario({ actuales = [], anteriores = [], activos = [] }) {
  prisma.empresa.findFirst.mockResolvedValue({ id: 'emp-1', razonSocial: 'ACME' });
  // Promise.all invoca primero el período actual y después el anterior
  prisma.liquidacion.findMany
    .mockResolvedValueOnce(actuales)
    .mockResolvedValueOnce(anteriores);
  prisma.empleado.findMany.mockResolvedValue(activos);
}

describe('controlarPeriodo', () => {
  test('404 si la empresa no es del estudio', async () => {
    prisma.empresa.findFirst.mockResolvedValue(null);
    await expect(controlarPeriodo('est-1', 'emp-X', 2026, 5))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('período limpio → apto, sin hallazgos', async () => {
    mockEscenario({
      actuales: [mkLiq('e-1'), mkLiq('e-2')],
      anteriores: [mkLiq('e-1'), mkLiq('e-2')],
      activos: [mkEmpleado('e-1'), mkEmpleado('e-2')],
    });
    const r = await controlarPeriodo('est-1', 'emp-1', 2026, 5);
    expect(r.resumen.apto).toBe(true);
    expect(r.hallazgos).toHaveLength(0);
    expect(r.liquidacionesAnalizadas).toBe(2);
  });

  test('detecta neto negativo como CRITICO', async () => {
    mockEscenario({ actuales: [mkLiq('e-1', { neto: -500 })], anteriores: [], activos: [] });
    const r = await controlarPeriodo('est-1', 'emp-1', 2026, 5);
    expect(r.resumen.apto).toBe(false);
    expect(r.hallazgos.some(h => h.codigo === 'NETO_NO_POSITIVO' && h.severidad === 'CRITICO')).toBe(true);
  });

  test('detecta variación de neto > 25% vs mes anterior', async () => {
    mockEscenario({
      actuales: [mkLiq('e-1', { neto: 200000 })],
      anteriores: [mkLiq('e-1', { neto: 100000 })],
      activos: [mkEmpleado('e-1')],
    });
    const r = await controlarPeriodo('est-1', 'emp-1', 2026, 5);
    const hallazgo = r.hallazgos.find(h => h.codigo === 'VARIACION_NETO');
    expect(hallazgo).toBeDefined();
    expect(hallazgo.datos.variacion).toBe(100);
  });

  test('detecta empleado activo sin liquidar (estaba el mes pasado)', async () => {
    mockEscenario({
      actuales: [mkLiq('e-1')],
      anteriores: [mkLiq('e-1'), mkLiq('e-2')],
      activos: [mkEmpleado('e-1'), mkEmpleado('e-2')],
    });
    const r = await controlarPeriodo('est-1', 'emp-1', 2026, 5);
    const hallazgo = r.hallazgos.find(h => h.codigo === 'EMPLEADO_SIN_LIQUIDAR');
    expect(hallazgo).toBeDefined();
    expect(hallazgo.severidad).toBe('CRITICO');
    expect(r.resumen.apto).toBe(false);
  });

  test('detecta descuentos excesivos (> 45% del bruto)', async () => {
    mockEscenario({
      actuales: [mkLiq('e-1', { haberes: 100000, descuentos: 60000, neto: 40000 })],
      anteriores: [], activos: [],
    });
    const r = await controlarPeriodo('est-1', 'emp-1', 2026, 5);
    expect(r.hallazgos.some(h => h.codigo === 'DESCUENTOS_EXCESIVOS')).toBe(true);
  });

  test('detecta concepto duplicado y falta de aportes', async () => {
    mockEscenario({
      actuales: [mkLiq('e-1', {
        detalles: [
          { conceptoId: 'c-1', descripcion: 'Básico', naturaleza: 'HABER', importe: 50000, remunerativo: true },
          { conceptoId: 'c-1', descripcion: 'Básico', naturaleza: 'HABER', importe: 50000, remunerativo: true },
        ],
      })],
      anteriores: [], activos: [],
    });
    const r = await controlarPeriodo('est-1', 'emp-1', 2026, 5);
    expect(r.hallazgos.some(h => h.codigo === 'CONCEPTO_DUPLICADO')).toBe(true);
    expect(r.hallazgos.some(h => h.codigo === 'SIN_APORTES')).toBe(true);
  });

  test('informa empleado nuevo en el período (INFO, no bloquea)', async () => {
    mockEscenario({
      actuales: [mkLiq('e-1'), mkLiq('e-nuevo')],
      anteriores: [mkLiq('e-1')],
      activos: [mkEmpleado('e-1'), mkEmpleado('e-nuevo')],
    });
    const r = await controlarPeriodo('est-1', 'emp-1', 2026, 5);
    const hallazgo = r.hallazgos.find(h => h.codigo === 'EMPLEADO_NUEVO_EN_PERIODO');
    expect(hallazgo?.severidad).toBe('INFO');
    expect(r.resumen.apto).toBe(true);
  });
});
