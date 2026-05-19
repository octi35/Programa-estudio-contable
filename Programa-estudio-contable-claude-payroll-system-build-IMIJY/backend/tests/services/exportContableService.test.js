const { aCsvGenerico, aTango, aBejerman, exportar } = require('../../src/services/exportContableService');

const ASIENTO_DEMO = {
  id: 'a-1',
  numero: 1,
  // Construido como local (no parseado UTC) para evitar drift de timezone
  fecha: new Date(2026, 4, 15), // mayo (mes 0-indexed)
  descripcion: 'Liquidación sueldos mayo',
  glosa: 'Periodo 05/2026',
  origen: 'SUELDOS',
  origenId: 'period-1',
  totalDebe: 100000,
  totalHaber: 100000,
  lineas: [
    {
      debe: 100000, haber: 0, descripcion: 'Sueldos a pagar',
      cuentaContable: { codigo: '5.1.01', nombre: 'Sueldos y jornales' },
    },
    {
      debe: 0, haber: 100000, descripcion: 'Pagos pendientes',
      cuentaContable: { codigo: '2.1.01', nombre: 'Remuneraciones a pagar' },
    },
  ],
};

describe('aCsvGenerico', () => {
  test('emite header + 1 línea por LíneaAsiento', () => {
    const csv = aCsvGenerico([ASIENTO_DEMO]);
    const filas = csv.split('\n');
    expect(filas[0]).toMatch(/^id_asiento,fecha,numero,/);
    expect(filas).toHaveLength(3); // header + 2 lineas
  });

  test('escapea comas en descripciones', () => {
    const a = { ...ASIENTO_DEMO, descripcion: 'Liquidación, mayo 2026', lineas: ASIENTO_DEMO.lineas };
    const csv = aCsvGenerico([a]);
    expect(csv).toMatch(/"Liquidación, mayo 2026"/);
  });

  test('formatea importes con 2 decimales', () => {
    const csv = aCsvGenerico([ASIENTO_DEMO]);
    expect(csv).toMatch(/100000\.00/);
  });
});

describe('aTango', () => {
  test('devuelve cabeceras + movimientos en archivos separados', () => {
    const out = aTango([ASIENTO_DEMO]);
    expect(Object.keys(out)).toEqual(['cabeceras_tango.txt', 'movimientos_tango.txt']);
  });

  test('formato separado por pipe en cabecera', () => {
    const out = aTango([ASIENTO_DEMO]);
    expect(out['cabeceras_tango.txt']).toMatch(/^1\|15\/05\/2026\|/);
    expect(out['cabeceras_tango.txt']).toMatch(/\|100000\.00\|100000\.00$/);
  });

  test('formato separado por pipe en movimientos', () => {
    const out = aTango([ASIENTO_DEMO]);
    const lineas = out['movimientos_tango.txt'].split('\r\n');
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toBe('1|5.1.01|100000.00|0.00|Sueldos a pagar');
  });
});

describe('aBejerman', () => {
  test('emite header + 1 línea por línea de asiento', () => {
    const csv = aBejerman([ASIENTO_DEMO]);
    const lineas = csv.split('\r\n');
    expect(lineas[0]).toBe('Fecha;Asiento;Cuenta;Descripcion_Cuenta;Debe;Haber;Glosa;Centro_Costo;Comprobante');
    expect(lineas).toHaveLength(3);
  });

  test('usa coma decimal (formato argentino)', () => {
    const csv = aBejerman([ASIENTO_DEMO]);
    expect(csv).toMatch(/100000,00/);
    expect(csv).not.toMatch(/100000\.00/);
  });
});

describe('exportar (dispatcher)', () => {
  test('formato csv default', () => {
    const r = exportar([ASIENTO_DEMO]);
    expect(r.tipo).toBe('csv');
    expect(r.mime).toBe('text/csv');
  });

  test('formato tango devuelve objeto multi-archivo', () => {
    const r = exportar([ASIENTO_DEMO], 'tango');
    expect(r.tipo).toBe('tango');
    expect(r.archivos).toBeDefined();
  });

  test('formato bejerman devuelve csv con ;', () => {
    const r = exportar([ASIENTO_DEMO], 'bejerman');
    expect(r.tipo).toBe('bejerman');
    expect(r.contenido).toContain(';');
  });

  test('formato desconocido cae a csv', () => {
    const r = exportar([ASIENTO_DEMO], 'invalido');
    expect(r.tipo).toBe('csv');
  });
});
