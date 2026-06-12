// Tests del TXT de importación del Libro de Sueldos Digital (ARCA, Guía N.º 15).
// Valida anchos fijos por tipo de registro y el formato de los campos clave.

const { generarLsdTxt } = require('../../src/services/lsdService');

const empresa = { razonSocial: 'ACME SRL', cuit: '30-71234567-8' };

const empleadoBase = {
  cuil: '20-30123456-7',
  legajoNumero: '15',
  apellido: 'García',
  nombre: 'Juan',
  cbu: '0070099530000012345678',
  modalidadContrato: 'TIEMPO_INDETERMINADO',
  obraSocialCodigo: '126205',
  convenioId: 'conv-1',
  familiares: [
    { parentesco: 'CONYUGE', activo: true },
    { parentesco: 'HIJO', activo: true },
    { parentesco: 'HIJA', activo: true },
    { parentesco: 'HIJO', activo: false }, // inactivo: no cuenta
  ],
};

const liquidacionBase = {
  empleado: empleadoBase,
  diasTrabajados: 30,
  horasTrabajadas: 0,
  totalHaberes: 1100000,
  totalDescuentos: 187000,
  totalNeto: 913000,
  detalles: [
    { descripcion: 'Sueldo Básico', concepto: { codigo: 'SB', unidad: 'IMPORTE' }, cantidad: null, importe: 1000000, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true },
    { descripcion: 'Suma fija NR', concepto: { codigo: 'NR1', unidad: 'IMPORTE' }, cantidad: null, importe: 100000, naturaleza: 'HABER', tipo: 'NO_REMUNERATIVO', remunerativo: false },
    { descripcion: 'Jubilación', concepto: { codigo: 'JUB', unidad: 'IMPORTE' }, cantidad: null, importe: -110000, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true },
    { descripcion: 'ART', concepto: { codigo: 'ART', unidad: 'IMPORTE' }, cantidad: null, importe: 50000, naturaleza: 'INFORMATIVO', tipo: 'APORTE_EMPLEADOR', remunerativo: true },
  ],
};

const generar = (liqs = [liquidacionBase], opts = {}) =>
  generarLsdTxt(empresa, liqs, 2026, 5, opts);

describe('generarLsdTxt', () => {
  test('respeta los anchos fijos de cada tipo de registro', () => {
    const { contenido } = generar();
    const lineas = contenido.trimEnd().split('\r\n');
    const esperados = { '01': 35, '02': 115, '03': 51, '04': 370 };
    for (const linea of lineas) {
      expect(linea.length).toBe(esperados[linea.slice(0, 2)]);
    }
  });

  test('estructura: 01 + (02 + 03×conceptos + 04) por trabajador', () => {
    const { contenido, trabajadores } = generar();
    const tipos = contenido.trimEnd().split('\r\n').map(l => l.slice(0, 2));
    // El aporte patronal informativo no genera registro 03
    expect(tipos).toEqual(['01', '02', '03', '03', '03', '04']);
    expect(trabajadores).toBe(1);
  });

  test('registro 01: CUIT sin guiones, período, SJ y cantidad de registros 04', () => {
    const { contenido } = generar([liquidacionBase, { ...liquidacionBase, empleado: { ...empleadoBase, cuil: '27-28123456-4', cbu: null } }]);
    const r01 = contenido.split('\r\n')[0];
    expect(r01).toBe('01' + '30712345678' + 'SJ' + '202605' + 'M' + '00001' + '30' + '000002');
  });

  test('registro 02: CBU y forma de pago 3 cuando cobra por acreditación', () => {
    const { contenido } = generar();
    const r02 = contenido.split('\r\n').find(l => l.startsWith('02'));
    expect(r02.slice(2, 13)).toBe('20301234567');
    expect(r02.slice(73, 95)).toBe('0070099530000012345678'); // CBU
    expect(r02.slice(95, 98)).toBe('000');                    // 30 días → tope completo
    expect(r02.slice(98, 106)).toBe('20260531');              // fecha de pago default: fin de mes
    expect(r02.slice(114)).toBe('3');                          // forma de pago: acreditación
  });

  test('registro 02: sin CBU → forma de pago 1 y CBU en blanco', () => {
    const liq = { ...liquidacionBase, empleado: { ...empleadoBase, cbu: null }, diasTrabajados: 12 };
    const { contenido } = generar([liq]);
    const r02 = contenido.split('\r\n').find(l => l.startsWith('02'));
    expect(r02.slice(73, 95)).toBe(' '.repeat(22));
    expect(r02.slice(95, 98)).toBe('012'); // proporciona tope por 12 días
    expect(r02.slice(114)).toBe('1');
  });

  test('registro 02: acepta fechaPago explícita', () => {
    const { contenido } = generar([liquidacionBase], { fechaPago: '2026-06-04' });
    const r02 = contenido.split('\r\n').find(l => l.startsWith('02'));
    expect(r02.slice(98, 106)).toBe('20260604');
  });

  test('registro 03: importes con 2 decimales implícitos e indicador C/D', () => {
    const { contenido } = generar();
    const r03 = contenido.split('\r\n').filter(l => l.startsWith('03'));
    const sueldo = r03[0];
    expect(sueldo.slice(13, 23)).toBe('SB        ');
    expect(sueldo.slice(29, 44)).toBe('000000100000000'); // $1.000.000,00
    expect(sueldo.slice(44, 45)).toBe('C');
    const jubilacion = r03[2];
    expect(jubilacion.slice(29, 44)).toBe('000000011000000'); // $110.000,00 en valor absoluto
    expect(jubilacion.slice(44, 45)).toBe('D');
    expect(jubilacion.slice(45)).toBe('000000'); // sin ajuste retroactivo
  });

  test('registro 04: cónyuge, hijos activos, bruta y bases imponibles', () => {
    const { contenido } = generar();
    const r04 = contenido.split('\r\n').find(l => l.startsWith('04'));
    expect(r04.slice(13, 14)).toBe('1');  // cónyuge
    expect(r04.slice(14, 16)).toBe('02'); // dos hijos activos
    expect(r04.slice(16, 17)).toBe('1');  // convencionado
    expect(r04.slice(62, 68)).toBe('126205'); // obra social
    // Remuneración bruta = total haberes; bases 1-5 = solo remunerativo
    const bruta = r04.slice(160, 175);
    const base1 = r04.slice(175, 190);
    expect(bruta).toBe('000000110000000');  // $1.100.000,00
    expect(base1).toBe('000000100000000');  // $1.000.000,00
  });

  test('tolera datos faltantes (sin concepto, sin obra social, sin familiares) manteniendo anchos', () => {
    const liq = {
      ...liquidacionBase,
      empleado: { ...empleadoBase, obraSocialCodigo: null, familiares: [], cbu: null, legajoNumero: null },
      detalles: [{ descripcion: 'Sueldo', concepto: null, cantidad: null, importe: 500000, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true }],
    };
    const { contenido } = generar([liq]);
    const lineas = contenido.trimEnd().split('\r\n');
    const esperados = { '01': 35, '02': 115, '03': 51, '04': 370 };
    for (const linea of lineas) expect(linea.length).toBe(esperados[linea.slice(0, 2)]);
    const r04 = lineas.find(l => l.startsWith('04'));
    expect(r04.slice(62, 68)).toBe('000000'); // obra social vacía → ceros
  });
});
