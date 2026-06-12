// Tests del parser de F.572 (SIRADIG). Mockea prisma.

jest.mock('../../src/lib/prisma', () => ({
  empleado: { findFirst: jest.fn() },
  gananciasEmpleado: { upsert: jest.fn() },
}));

const prisma = require('../../src/lib/prisma');
const { parsearF572, importarF572 } = require('../../src/services/sueldos/siradigService');

beforeEach(() => jest.clearAllMocks());

const XML_VALIDO = `<?xml version="1.0" encoding="UTF-8"?>
<presentacion>
  <periodo>2026</periodo>
  <empleado>
    <cuit>20111111112</cuit>
    <apellido>PEREZ</apellido>
  </empleado>
  <cargasFamilia>
    <cargaFamilia><parentesco>HIJO</parentesco><discapacitado>N</discapacitado></cargaFamilia>
    <cargaFamilia><parentesco>HIJO</parentesco><discapacitado>S</discapacitado></cargaFamilia>
    <cargaFamilia><parentesco>CONYUGE</parentesco></cargaFamilia>
  </cargasFamilia>
  <deducciones>
    <deduccion tipo="CUOTA_MEDICO_ASISTENCIAL"><montoTotal>120000.50</montoTotal></deduccion>
    <deduccion tipo="ALQUILER_INMUEBLE"><montoTotal>800000</montoTotal></deduccion>
    <deduccion tipo="DONACIONES"><montoTotal>50000</montoTotal></deduccion>
    <deduccion tipo="GASTOS_VARIOS"><montoTotal>10000</montoTotal></deduccion>
  </deducciones>
</presentacion>`;

describe('parsearF572', () => {
  test('extrae CUIL, año, cargas de familia y deducciones', () => {
    const r = parsearF572(Buffer.from(XML_VALIDO));
    expect(r.cuil).toBe('20111111112');
    expect(r.anio).toBe(2026);
    expect(r.conyuge).toBe(true);
    expect(r.hijos).toBe(2);
    expect(r.hijosDiscapacitados).toBe(1);
    expect(r.deducciones.medicinaPrivada).toBe(120000.5);
    expect(r.deducciones.alquiler).toBe(800000);
    expect(r.deducciones.donaciones).toBe(50000);
    expect(r.deducciones.otrasDeducciones).toBe(10000);
  });

  test('rechaza archivos que no son F.572', () => {
    expect(() => parsearF572(Buffer.from('<html>no soy un formulario</html>')))
      .toThrow(/no parece ser un F\.572/);
  });

  test('rechaza XML sin CUIL identificable', () => {
    expect(() => parsearF572(Buffer.from('<presentacion><empleado></empleado></presentacion>')))
      .toThrow(/CUIL/);
  });
});

describe('importarF572', () => {
  test('matchea empleado por CUIL y hace upsert del año', async () => {
    prisma.empleado.findFirst.mockResolvedValue({
      id: 'e-1', apellido: 'Pérez', nombre: 'Juan', cuil: '20-11111111-2',
      empresa: { razonSocial: 'ACME' },
    });
    prisma.gananciasEmpleado.upsert.mockResolvedValue({ id: 'g-1' });

    const r = await importarF572('est-1', Buffer.from(XML_VALIDO));

    expect(r.empleado).toBe('Pérez, Juan');
    expect(r.anio).toBe(2026);
    expect(prisma.gananciasEmpleado.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { empleadoId_anio: { empleadoId: 'e-1', anio: 2026 } },
      create: expect.objectContaining({ hijos: 2, conyuge: true, medicinaPrivada: 120000.5 }),
    }));
  });

  test('404 si el CUIL no existe en el estudio', async () => {
    prisma.empleado.findFirst.mockResolvedValue(null);
    await expect(importarF572('est-1', Buffer.from(XML_VALIDO)))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
