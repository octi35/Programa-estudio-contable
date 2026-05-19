const { validarCUIL, formatearCUIL, validarCBU, parsearCBU, validarDNI, validarCUIT } = require('../../src/utils/validacionesAr');

describe('validarCUIL', () => {
  // CUILs sintéticos con dígito verificador calculado por el algoritmo oficial
  // (NO son CUILs reales — los DV se calcularon manualmente para los tests)
  test.each([
    ['20-12345678-6', true],   // M (20): 148 % 11 = 5 → DV = 6
    ['23-12345678-5', true],   // X (23): 160 % 11 = 6 → DV = 5
    ['27-12345678-0', true],   // F (27): 176 % 11 = 0 → DV = 0
  ])('CUIL válido %s → %s', (cuil, esperado) => {
    expect(validarCUIL(cuil)).toBe(esperado);
  });

  test.each([
    ['20-12345678-9', false],  // dígito verificador incorrecto
    ['99-12345678-0', false],  // prefijo no válido (99 no es prefijo)
    ['20-1234567-9', false],   // largo incorrecto
    ['abc-defghij-k', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('CUIL inválido %s → %s', (cuil, esperado) => {
    expect(validarCUIL(cuil)).toBe(esperado);
  });

  test('acepta CUIL sin guiones', () => {
    expect(validarCUIL('20123456786')).toBe(true);
  });

  test('acepta CUIL con espacios', () => {
    expect(validarCUIL('20 12345678 6')).toBe(true);
  });
});

describe('formatearCUIL', () => {
  test('aplica el formato XX-XXXXXXXX-X', () => {
    expect(formatearCUIL('20123456785')).toBe('20-12345678-5');
  });

  test('no toca un CUIL ya formateado', () => {
    expect(formatearCUIL('20-12345678-5')).toBe('20-12345678-5');
  });

  test('devuelve sin cambios si no tiene 11 dígitos', () => {
    expect(formatearCUIL('12345')).toBe('12345');
  });
});

describe('validarCUIT', () => {
  test('valida CUIT empresa con prefijo 30', () => {
    // 30-12345678-1 sintético: 153 % 11 = 10 → DV = 1
    expect(validarCUIT('30-12345678-1')).toBe(true);
  });

  test('rechaza CUIT con prefijo de persona física (20, 27)', () => {
    expect(validarCUIT('20-12345678-6')).toBe(false);
    expect(validarCUIT('27-12345678-0')).toBe(false);
  });

  test('rechaza CUIT con dígito verificador inválido', () => {
    expect(validarCUIT('30-12345678-9')).toBe(false);
  });
});

describe('validarCBU', () => {
  // CBU sintético: Banco Nación (011) con dígitos verificadores correctos
  test('rechaza CBU con largo incorrecto', () => {
    expect(validarCBU('12345')).toBe(false);
    expect(validarCBU('')).toBe(false);
    expect(validarCBU(null)).toBe(false);
  });

  test('rechaza CBU no numérico', () => {
    expect(validarCBU('abcdefghij1234567890ab')).toBe(false);
  });

  test('rechaza CBU con dígitos verificadores incorrectos', () => {
    // 22 dígitos pero DV1/DV2 inválidos
    expect(validarCBU('0110000000000000000000')).toBe(false);
  });
});

describe('parsearCBU', () => {
  test('extrae banco, sucursal y cuenta', () => {
    const r = parsearCBU('0110599520000001234567');
    expect(r).toEqual({
      banco: '011',
      sucursal: '0599',
      cuentaCompleta: '20000001234567',
    });
  });

  test('devuelve null si largo no es 22', () => {
    expect(parsearCBU('12345')).toBeNull();
  });
});

describe('validarDNI', () => {
  test.each([
    ['12345678', true],
    ['1234567', true],
    ['12.345.678', true],
    ['0', false],
    ['', false],
    ['123', false],
    ['123456789', false],
    ['abc', false],
    [null, false],
  ])('DNI %s → %s', (dni, esperado) => {
    expect(validarDNI(dni)).toBe(esperado);
  });
});
