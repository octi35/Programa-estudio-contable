// Tests del matcheo de conciliación bancaria. Mockea prisma.

jest.mock('../../src/lib/prisma', () => ({
  cuentaBancaria: { findFirst: jest.fn() },
  movimientoBancario: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  comprobanteIVA: { findMany: jest.fn(), findFirst: jest.fn() },
  facturaHonorarios: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  pagoComprobante: { create: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../../src/lib/prisma');
const { sugerirConciliacion, confirmarConciliacion, scoreImporte, scoreFecha, scoreCuit } = require('../../src/services/conciliacionService');

beforeEach(() => jest.clearAllMocks());

describe('scoring', () => {
  test('importe exacto = 50, dentro de 0.5% = 40, fuera = 0', () => {
    expect(scoreImporte(100000, 100000)).toBe(50);
    expect(scoreImporte(100300, 100000)).toBe(40);
    expect(scoreImporte(120000, 100000)).toBe(0);
  });

  test('fecha el mismo día = 25, decae hasta 0 a los 30 días', () => {
    const hoy = new Date('2026-06-10');
    expect(scoreFecha(hoy, new Date('2026-06-10'))).toBe(25);
    expect(scoreFecha(hoy, new Date('2026-08-10'))).toBe(0);
  });

  test('CUIT presente en la descripción del movimiento = 25', () => {
    expect(scoreCuit('TRANSF 30-12345678-1 PAGO FC', '30-12345678-1')).toBe(25);
    expect(scoreCuit('TRANSF SIN DATOS', '30-12345678-1')).toBe(0);
  });
});

describe('sugerirConciliacion', () => {
  test('404 si la cuenta no es del estudio', async () => {
    prisma.cuentaBancaria.findFirst.mockResolvedValue(null);
    await expect(sugerirConciliacion('est-1', 'cta-X')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('matchea cobro con comprobante de VENTA por importe+fecha', async () => {
    prisma.cuentaBancaria.findFirst.mockResolvedValue({
      id: 'cta-1', banco: 'Galicia', numeroCuenta: '123', empresaId: 'emp-1',
      empresa: { razonSocial: 'ACME' },
    });
    prisma.movimientoBancario.findMany.mockResolvedValue([
      { id: 'm-1', fecha: new Date('2026-06-05'), descripcion: 'TRANSF RECIBIDA 30-22222222-7', referencia: null, debe: 0, haber: 121000 },
    ]);
    prisma.comprobanteIVA.findMany.mockResolvedValue([
      {
        id: 'c-1', tipoMovimiento: 'VENTA', tipoComprobante: 'FACTURA_A', puntoVenta: 1, numero: 55,
        fecha: new Date('2026-06-01'), total: 121000, pagos: [],
        proveedorCliente: { razonSocial: 'Cliente SA', cuit: '30-22222222-7' },
      },
      {
        id: 'c-2', tipoMovimiento: 'COMPRA', tipoComprobante: 'FACTURA_A', puntoVenta: 2, numero: 9,
        fecha: new Date('2026-06-01'), total: 121000, pagos: [],
        proveedorCliente: { razonSocial: 'Proveedor SRL', cuit: '30-33333333-3' },
      },
    ]);
    prisma.facturaHonorarios.findMany.mockResolvedValue([]);

    const r = await sugerirConciliacion('est-1', 'cta-1');

    expect(r.pendientes).toBe(1);
    expect(r.conMatch).toBe(1);
    const sug = r.sugerencias[0];
    expect(sug.movimiento.sentido).toBe('COBRO');
    expect(sug.candidatos).toHaveLength(1); // la COMPRA no aplica a un cobro
    expect(sug.candidatos[0].referenciaId).toBe('c-1');
    expect(sug.confianza).toBe('ALTA'); // importe exacto + fecha cercana + CUIT en descripción
  });

  test('ignora comprobantes ya pagados (saldo 0)', async () => {
    prisma.cuentaBancaria.findFirst.mockResolvedValue({
      id: 'cta-1', banco: 'G', numeroCuenta: '1', empresaId: 'emp-1', empresa: { razonSocial: 'ACME' },
    });
    prisma.movimientoBancario.findMany.mockResolvedValue([
      { id: 'm-1', fecha: new Date('2026-06-05'), descripcion: 'PAGO', referencia: null, debe: 50000, haber: 0 },
    ]);
    prisma.comprobanteIVA.findMany.mockResolvedValue([
      {
        id: 'c-1', tipoMovimiento: 'COMPRA', tipoComprobante: 'FACTURA_A', puntoVenta: 1, numero: 1,
        fecha: new Date('2026-06-04'), total: 50000, pagos: [{ importe: 50000 }],
        proveedorCliente: null,
      },
    ]);
    prisma.facturaHonorarios.findMany.mockResolvedValue([]);

    const r = await sugerirConciliacion('est-1', 'cta-1');
    expect(r.sugerencias[0].candidatos).toHaveLength(0);
    expect(r.sugerencias[0].confianza).toBe('SIN_MATCH');
  });

  test('sugiere factura de honorarios para un pago', async () => {
    prisma.cuentaBancaria.findFirst.mockResolvedValue({
      id: 'cta-1', banco: 'G', numeroCuenta: '1', empresaId: 'emp-1', empresa: { razonSocial: 'ACME' },
    });
    prisma.movimientoBancario.findMany.mockResolvedValue([
      { id: 'm-1', fecha: new Date('2026-06-05'), descripcion: 'PAGO HONORARIOS ESTUDIO', referencia: null, debe: 90000, haber: 0 },
    ]);
    prisma.comprobanteIVA.findMany.mockResolvedValue([]);
    prisma.facturaHonorarios.findMany.mockResolvedValue([
      { id: 'f-1', numero: '0001-00000012', concepto: 'Honorarios mayo', fecha: new Date('2026-06-01'), total: 90000, estado: 'PENDIENTE' },
    ]);

    const r = await sugerirConciliacion('est-1', 'cta-1');
    expect(r.sugerencias[0].candidatos[0].tipo).toBe('FACTURA_HONORARIOS');
  });
});

describe('confirmarConciliacion', () => {
  test('rechaza movimiento ya conciliado', async () => {
    prisma.movimientoBancario.findFirst.mockResolvedValue({ id: 'm-1', conciliado: true, debe: 0, haber: 100 });
    await expect(confirmarConciliacion('est-1', 'm-1', { tipo: 'COMPROBANTE', referenciaId: 'c-1' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('concilia contra comprobante: crea pago y marca el movimiento', async () => {
    prisma.movimientoBancario.findFirst.mockResolvedValue({
      id: 'm-1', conciliado: false, fecha: new Date('2026-06-05'), debe: 0, haber: 121000,
      referencia: 'REF1', descripcion: 'TRANSF',
    });
    const tx = {
      comprobanteIVA: { findFirst: jest.fn().mockResolvedValue({ id: 'c-1' }) },
      pagoComprobante: { create: jest.fn() },
      movimientoBancario: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation(fn => fn(tx));

    const r = await confirmarConciliacion('est-1', 'm-1', { tipo: 'COMPROBANTE', referenciaId: 'c-1' });

    expect(r.ok).toBe(true);
    expect(tx.pagoComprobante.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ comprobanteId: 'c-1', importe: 121000 }),
    }));
    expect(tx.movimientoBancario.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { conciliado: true } });
  });
});
