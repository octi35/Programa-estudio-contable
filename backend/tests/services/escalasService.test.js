// Tests del servicio de escalas salariales (paritarias). Mockea prisma.

jest.mock('../../src/lib/prisma', () => ({
  tablaSueldo: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  empleado: { findMany: jest.fn(), update: jest.fn() },
  novedadEmpleado: { create: jest.fn(), createMany: jest.fn() },
  liquidacion: { findMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../../src/lib/prisma');
const { importarEscala, escalaVigente, aplicarEscala, calcularRetroactivo, norm } = require('../../src/services/sueldos/escalasService');

beforeEach(() => jest.clearAllMocks());

describe('norm', () => {
  test('normaliza categorías para matchear sin importar mayúsculas/espacios', () => {
    expect(norm('  vendedor   B ')).toBe('VENDEDOR B');
  });
});

describe('importarEscala', () => {
  test('rechaza archivo sin filas válidas', async () => {
    await expect(importarEscala('conv-1', [{ categoria: '', basico: 0 }], '2026-06-01'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('crea filas nuevas y cierra vigencias anteriores', async () => {
    const tx = {
      tablaSueldo: {
        updateMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(fn => fn(tx));

    const r = await importarEscala('conv-1', [
      { categoria: 'Vendedor A', basico: '950000' },
      { categoria: 'Vendedor B', basico: 1050000 },
    ], '2026-06-01');

    expect(r.creadas).toBe(2);
    expect(tx.tablaSueldo.updateMany).toHaveBeenCalledTimes(2); // cierre de vigencias
    expect(tx.tablaSueldo.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ categoria: 'VENDEDOR A', basicoMensual: 950000 }),
    }));
  });
});

describe('escalaVigente', () => {
  test('devuelve la fila más reciente por categoría', async () => {
    prisma.tablaSueldo.findMany.mockResolvedValue([
      { id: '2', categoria: 'A', basicoMensual: 1100000, vigenciaDesde: new Date('2026-06-01') },
      { id: '1', categoria: 'A', basicoMensual: 1000000, vigenciaDesde: new Date('2026-01-01') },
      { id: '3', categoria: 'B', basicoMensual: 1200000, vigenciaDesde: new Date('2026-01-01') },
    ]);
    const r = await escalaVigente('conv-1');
    expect(r).toHaveLength(2);
    expect(r.find(f => f.categoria === 'A').id).toBe('2');
  });
});

describe('aplicarEscala', () => {
  const escalaMock = [
    { categoria: 'VENDEDOR A', basicoMensual: 1100000, vigenciaDesde: new Date('2026-06-01') },
  ];

  test('400 si no hay escala vigente', async () => {
    prisma.tablaSueldo.findMany.mockResolvedValue([]);
    await expect(aplicarEscala('est-1', 'conv-1')).rejects.toMatchObject({ statusCode: 400 });
  });

  test('dryRun detecta cambios sin tocar la DB', async () => {
    prisma.tablaSueldo.findMany.mockResolvedValue(escalaMock);
    prisma.empleado.findMany.mockResolvedValue([
      { id: 'e-1', apellido: 'Pérez', nombre: 'Juan', categoria: 'Vendedor A', basicoMensual: 1000000, empresa: { razonSocial: 'ACME' } },
      { id: 'e-2', apellido: 'García', nombre: 'Ana', categoria: 'Vendedor A', basicoMensual: 1100000, empresa: { razonSocial: 'ACME' } },
      { id: 'e-3', apellido: 'Sosa', nombre: 'Luis', categoria: 'Cajero', basicoMensual: 900000, empresa: { razonSocial: 'ACME' } },
    ]);

    const r = await aplicarEscala('est-1', 'conv-1', { dryRun: true });

    expect(r.aplicado).toBe(false);
    expect(r.cambios).toHaveLength(1);
    expect(r.cambios[0].empleadoId).toBe('e-1');
    expect(r.cambios[0].variacion).toBe(10);
    expect(r.sinCambio).toBe(1);          // García ya está al día
    expect(r.sinCategoria).toHaveLength(1); // Sosa no matchea
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('aplica: actualiza básico y registra novedad', async () => {
    prisma.tablaSueldo.findMany.mockResolvedValue(escalaMock);
    prisma.empleado.findMany.mockResolvedValue([
      { id: 'e-1', apellido: 'Pérez', nombre: 'Juan', categoria: 'VENDEDOR A', basicoMensual: 1000000, empresa: { razonSocial: 'ACME' } },
    ]);
    const tx = { empleado: { update: jest.fn() }, novedadEmpleado: { create: jest.fn() } };
    prisma.$transaction.mockImplementation(fn => fn(tx));

    const r = await aplicarEscala('est-1', 'conv-1');

    expect(r.aplicado).toBe(true);
    expect(tx.empleado.update).toHaveBeenCalledWith({ where: { id: 'e-1' }, data: { basicoMensual: 1100000 } });
    expect(tx.novedadEmpleado.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: 'MODIFICACION_SUELDO' }),
    }));
  });
});

describe('calcularRetroactivo', () => {
  test('calcula diferencia de básico por mes liquidado y crea novedades', async () => {
    prisma.tablaSueldo.findMany.mockResolvedValue([
      { categoria: 'VENDEDOR A', basicoMensual: 1100000, vigenciaDesde: new Date('2026-06-01') },
    ]);
    prisma.liquidacion.findMany.mockResolvedValue([
      {
        anio: 2026, mes: 4, diasTrabajados: 22, diasNoTrabajados: 0,
        empleado: { id: 'e-1', apellido: 'Pérez', nombre: 'Juan', categoria: 'Vendedor A', empresa: { razonSocial: 'ACME' } },
        detalles: [{ importe: 1000000, cantidad: 22 }],
      },
      {
        anio: 2026, mes: 5, diasTrabajados: 21, diasNoTrabajados: 0,
        empleado: { id: 'e-1', apellido: 'Pérez', nombre: 'Juan', categoria: 'Vendedor A', empresa: { razonSocial: 'ACME' } },
        detalles: [{ importe: 1000000, cantidad: 21 }],
      },
    ]);
    prisma.novedadEmpleado.createMany.mockResolvedValue({ count: 1 });

    const r = await calcularRetroactivo('est-1', 'conv-1', {
      anioDesde: 2026, mesDesde: 4, anioHasta: 2026, mesHasta: 5, crear: true,
    });

    expect(r.empleadosConRetro).toBe(1);
    // 100000 de diferencia por cada mes completo
    expect(r.detalle[0].total).toBe(200000);
    expect(r.novedadesCreadas).toBe(1);
    expect(prisma.novedadEmpleado.createMany).toHaveBeenCalled();
  });

  test('rango inválido (más de 12 meses) → 400', async () => {
    prisma.tablaSueldo.findMany.mockResolvedValue([
      { categoria: 'A', basicoMensual: 1, vigenciaDesde: new Date('2026-01-01') },
    ]);
    await expect(calcularRetroactivo('est-1', 'conv-1', {
      anioDesde: 2024, mesDesde: 1, anioHasta: 2026, mesHasta: 12, crear: false,
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});
