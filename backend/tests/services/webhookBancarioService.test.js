// Tests del matching pago→factura. Mockea prisma completo para no usar DB.

jest.mock('../../src/lib/prisma', () => {
  const mockFns = {};
  ['comprobanteIVA', 'proveedorCliente', 'cuentaBancaria', 'movimientoBancario', 'pagoComprobante', 'logAccion'].forEach(modelo => {
    mockFns[modelo] = {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    };
  });
  return mockFns;
});

const prisma = require('../../src/lib/prisma');
const { buscarComprobanteCandidato, procesarPago } = require('../../src/services/webhookBancarioService');

beforeEach(() => {
  jest.clearAllMocks();
  // Default seguro: findMany devuelve [] salvo que el test lo redefina
  prisma.comprobanteIVA.findMany.mockResolvedValue([]);
});

describe('buscarComprobanteCandidato', () => {
  test('devuelve null si el importe es 0', async () => {
    const r = await buscarComprobanteCandidato('est-1', { importe: 0 });
    expect(r).toBeNull();
  });

  test('match alta confianza por número de comprobante + monto exacto', async () => {
    // Paso 1: lookup por número exacto encuentra 1 candidato pendiente
    prisma.comprobanteIVA.findMany.mockResolvedValueOnce([
      { id: 'c-1', numero: 12345, total: 50000, pagos: [], empresa: { razonSocial: 'ACME' } },
    ]);
    const r = await buscarComprobanteCandidato('est-1', { importe: 50000, comprobante_numero: '12345' });
    expect(r).not.toBeNull();
    expect(r.confianza).toBe('alta');
    expect(r.comprobante.id).toBe('c-1');
  });

  test('descarta comprobantes ya pagados', async () => {
    // Paso 1: candidato 100% pagado → no aplica
    // Paso 3 (fallback monto único): nada
    prisma.comprobanteIVA.findMany.mockResolvedValue([
      { id: 'c-1', numero: 12345, total: 50000, pagos: [{ importe: 50000 }], empresa: { razonSocial: 'ACME' } },
    ]);
    const r = await buscarComprobanteCandidato('est-1', { importe: 50000, comprobante_numero: '12345' });
    expect(r).toBeNull();
  });

  test('match por CUIT del proveedor + monto', async () => {
    // No hay comprobante_numero → salta paso 1 sin consumir mock
    prisma.proveedorCliente.findFirst.mockResolvedValue({ id: 'p-1' });
    // Paso 2: findMany por proveedor+monto devuelve 1 candidato
    prisma.comprobanteIVA.findMany.mockResolvedValueOnce([
      { id: 'c-2', numero: 999, total: 30000, pagos: [], empresa: { razonSocial: 'XYZ' } },
    ]);
    const r = await buscarComprobanteCandidato('est-1', { importe: 30000, cuit_emisor: '30712345678' });
    expect(r).not.toBeNull();
    expect(r.confianza).toBe('alta');
  });

  test('fallback baja confianza si monto único en últimos 60 días', async () => {
    // Sin número y sin CUIT → cae directo al paso 3
    prisma.comprobanteIVA.findMany.mockResolvedValueOnce([
      { id: 'c-3', total: 12345, pagos: [], empresa: { razonSocial: 'OTRO' } },
    ]);
    const r = await buscarComprobanteCandidato('est-1', { importe: 12345 });
    expect(r).not.toBeNull();
    expect(r.confianza).toBe('baja');
  });

  test('devuelve null si hay múltiples candidatos por monto único', async () => {
    prisma.comprobanteIVA.findMany.mockResolvedValueOnce([
      { id: 'a', total: 1000, pagos: [] },
      { id: 'b', total: 1000, pagos: [] },
    ]);
    const r = await buscarComprobanteCandidato('est-1', { importe: 1000 });
    expect(r).toBeNull();
  });
});

describe('procesarPago', () => {
  test('crea PagoComprobante + MovimientoBancario cuando hay match', async () => {
    prisma.comprobanteIVA.findMany.mockResolvedValueOnce([
      { id: 'c-1', numero: 100, total: 5000, pagos: [], empresa: { razonSocial: 'ACME' } },
    ]);
    prisma.cuentaBancaria.findFirst.mockResolvedValue({ id: 'cb-1', saldoInicial: 0 });
    prisma.movimientoBancario.findFirst.mockResolvedValue(null);
    prisma.movimientoBancario.create.mockResolvedValue({ id: 'mov-1' });
    prisma.pagoComprobante.create.mockResolvedValue({ id: 'pago-1' });
    prisma.logAccion.create.mockResolvedValue({});

    const r = await procesarPago('est-1', {
      importe: 5000,
      comprobante_numero: '100',
      cuenta_cbu: '0110599520000001234567',
      fecha: '2026-05-15',
    });

    expect(r.matched).toBe(true);
    expect(r.confianza).toBe('alta');
    expect(prisma.movimientoBancario.create).toHaveBeenCalled();
    expect(prisma.pagoComprobante.create).toHaveBeenCalled();
  });

  test('sin match: registra movimiento + log, sin PagoComprobante', async () => {
    // findMany devuelve [] (default del beforeEach)
    prisma.cuentaBancaria.findFirst.mockResolvedValue({ id: 'cb-1', saldoInicial: 1000 });
    prisma.movimientoBancario.findFirst.mockResolvedValue({ saldo: 1500 });
    prisma.movimientoBancario.create.mockResolvedValue({ id: 'mov-2' });
    prisma.logAccion.create.mockResolvedValue({});

    const r = await procesarPago('est-1', { importe: 9999, cuenta_cbu: '0110599520000001234567' });

    expect(r.matched).toBe(false);
    expect(prisma.pagoComprobante.create).not.toHaveBeenCalled();
    expect(prisma.movimientoBancario.create).toHaveBeenCalled();
  });
});
