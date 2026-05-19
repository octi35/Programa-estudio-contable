// Tests modo SIMULADO (no toca AFIP real).

jest.mock('../../src/lib/prisma', () => ({
  empresa: { findFirst: jest.fn() },
  comprobanteElectronico: { create: jest.fn() },
  facturaHonorarios: { update: jest.fn() },
}));

const prisma = require('../../src/lib/prisma');
const { tipoComprobantePara, facturarMasivo, CBTE_TIPO } = require('../../src/services/afip/afipFacturacionService');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AFIP_AMBIENTE = 'SIMULADO';
});

describe('tipoComprobantePara', () => {
  test('RI emisor → RI receptor = Factura A', () => {
    expect(tipoComprobantePara('RESPONSABLE_INSCRIPTO', 'RESPONSABLE_INSCRIPTO')).toBe('FACTURA_A');
  });

  test('RI emisor → Monotributista = Factura B', () => {
    expect(tipoComprobantePara('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA')).toBe('FACTURA_B');
  });

  test('RI emisor → Consumidor Final = Factura B', () => {
    expect(tipoComprobantePara('RESPONSABLE_INSCRIPTO', 'CONSUMIDOR_FINAL')).toBe('FACTURA_B');
  });

  test('Monotributista emisor → siempre Factura C', () => {
    expect(tipoComprobantePara('MONOTRIBUTISTA', 'RESPONSABLE_INSCRIPTO')).toBe('FACTURA_C');
    expect(tipoComprobantePara('MONOTRIBUTISTA', 'MONOTRIBUTISTA')).toBe('FACTURA_C');
  });
});

describe('facturarMasivo (modo simulado)', () => {
  const estudio = { id: 'est-1', cuit: '30-12345678-3', afipPtoVta: 1 };

  test('emite y persiste cada item exitoso', async () => {
    prisma.empresa.findFirst.mockResolvedValue({
      id: 'emp-1', razonSocial: 'ACME SA', cuit: '30-11111111-1', condicionIVA: 'RESPONSABLE_INSCRIPTO',
    });
    prisma.comprobanteElectronico.create.mockResolvedValue({ id: 'ce-1' });

    const r = await facturarMasivo(estudio, [
      { empresaId: 'emp-1', importeNeto: 1000, importeIVA: 210, importeTotal: 1210, concepto: 'Honorarios 05/2026' },
    ]);

    expect(r.exitosos).toHaveLength(1);
    expect(r.errores).toHaveLength(0);
    expect(r.exitosos[0].cae).toMatch(/^\d{14}$/);
    expect(r.exitosos[0].nro).toMatch(/^\d{5}-\d{8}$/);
    expect(prisma.comprobanteElectronico.create).toHaveBeenCalled();
  });

  test('marca FacturaHonorarios como ENVIADA si vino el id', async () => {
    prisma.empresa.findFirst.mockResolvedValue({
      id: 'emp-1', razonSocial: 'ACME', cuit: '30-11111111-1', condicionIVA: 'MONOTRIBUTISTA',
    });
    prisma.comprobanteElectronico.create.mockResolvedValue({ id: 'ce-1' });
    prisma.facturaHonorarios.update.mockResolvedValue({ id: 'fh-1' });

    await facturarMasivo(estudio, [
      { empresaId: 'emp-1', facturaHonorariosId: 'fh-1', importeNeto: 5000, importeIVA: 0, importeTotal: 5000, concepto: 'X' },
    ]);

    expect(prisma.facturaHonorarios.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fh-1' }, data: expect.objectContaining({ estado: 'ENVIADA' }) }),
    );
  });

  test('reporta errores sin abortar la batch', async () => {
    prisma.empresa.findFirst
      .mockResolvedValueOnce(null) // empresa no encontrada → error
      .mockResolvedValueOnce({ id: 'emp-2', razonSocial: 'B', cuit: '30-22222222-2', condicionIVA: 'RESPONSABLE_INSCRIPTO' });
    prisma.comprobanteElectronico.create.mockResolvedValue({ id: 'ce-1' });

    const r = await facturarMasivo(estudio, [
      { empresaId: 'invalida', importeNeto: 100, importeIVA: 21, concepto: 'X' },
      { empresaId: 'emp-2', importeNeto: 200, importeIVA: 42, concepto: 'Y' },
    ]);

    expect(r.errores).toHaveLength(1);
    expect(r.exitosos).toHaveLength(1);
  });

  test('selecciona Factura C para emisor monotributista', async () => {
    const estudioMT = { ...estudio, condicionIVA: 'MONOTRIBUTISTA' };
    prisma.empresa.findFirst.mockResolvedValue({
      id: 'emp-1', razonSocial: 'X', cuit: '30-11111111-1', condicionIVA: 'RESPONSABLE_INSCRIPTO',
    });
    prisma.comprobanteElectronico.create.mockResolvedValue({ id: 'ce-1' });

    const r = await facturarMasivo(estudioMT, [
      { empresaId: 'emp-1', importeNeto: 1000, importeIVA: 0, importeTotal: 1000, concepto: 'X' },
    ]);

    expect(r.exitosos[0].tipo).toBe('FACTURA_C');
  });
});
