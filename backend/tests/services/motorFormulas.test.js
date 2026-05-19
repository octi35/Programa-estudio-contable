const { evaluarFormula, validarFormula, evaluarConceptos } = require('../../src/services/sueldos/motorFormulas');

describe('evaluarFormula', () => {
  test('evalúa una expresión aritmética simple', () => {
    const r = evaluarFormula('100 + 50');
    expect(r.importe).toBe(150);
    expect(r.error).toBeNull();
  });

  test('evalúa con variables del scope', () => {
    const r = evaluarFormula('basico * 0.11', { basico: 500000 });
    expect(r.importe).toBe(55000);
    expect(r.error).toBeNull();
  });

  test('combina múltiples variables', () => {
    const r = evaluarFormula('basico + bono - adelanto', { basico: 100000, bono: 20000, adelanto: 5000 });
    expect(r.importe).toBe(115000);
  });

  test('redondea a 2 decimales', () => {
    const r = evaluarFormula('100 / 3');
    expect(r.importe).toBe(33.33);
  });

  test('reemplaza variables undefined por 0 sin romper', () => {
    const r = evaluarFormula('basico + bono', { basico: 100000 });
    expect(r.importe).toBe(100000);
    expect(r.error).toBeNull();
  });

  test('rechaza variables no conocidas con error amigable', () => {
    const r = evaluarFormula('basico * variable_que_no_existe');
    expect(r.importe).toBe(0);
    expect(r.error).toMatch(/no está definida/);
  });

  test('rechaza fórmula vacía', () => {
    expect(evaluarFormula('').error).toMatch(/vacía/);
    expect(evaluarFormula(null).error).toMatch(/vacía/);
  });

  test('rechaza sintaxis inválida', () => {
    const r = evaluarFormula('basico ++ ');
    expect(r.importe).toBe(0);
    expect(r.error).not.toBeNull();
  });

  test('NO permite import() ni código arbitrario', () => {
    const r = evaluarFormula('import("fs")');
    expect(r.error).not.toBeNull();
  });

  test('coerciona valores no numéricos a 0', () => {
    const r = evaluarFormula('basico + bono', { basico: 100000, bono: 'texto' });
    expect(r.importe).toBe(100000);
  });
});

describe('validarFormula', () => {
  test('valida sintaxis correcta sin ejecutar', () => {
    const r = validarFormula('basico * 0.11 + bono');
    expect(r.valida).toBe(true);
    expect(r.error).toBeNull();
  });

  test('detecta sintaxis inválida', () => {
    const r = validarFormula('basico ++');
    expect(r.valida).toBe(false);
  });

  test('rechaza fórmula vacía', () => {
    expect(validarFormula('').valida).toBe(false);
  });
});

describe('evaluarConceptos', () => {
  test('evalúa lista en orden y acumula scope', () => {
    const conceptos = [
      { codigo: 'JORNAL', descripcion: 'Jornal', formula: 'basico' },
      { codigo: 'ADIC',   descripcion: 'Adicional 10%', formula: 'jornal * 0.10' },
    ];
    const r = evaluarConceptos(conceptos, { basico: 100000 });
    expect(r[0].importe).toBe(100000);
    expect(r[1].importe).toBe(10000);
    expect(r.every(x => x.error === null)).toBe(true);
  });

  test('reporta errores individuales sin abortar todo', () => {
    const conceptos = [
      { codigo: 'OK',   descripcion: 'ok',   formula: 'basico * 2' },
      { codigo: 'MALO', descripcion: 'malo', formula: 'no_existe + 1' },
      { codigo: 'OK2',  descripcion: 'ok2',  formula: 'basico + 100' },
    ];
    const r = evaluarConceptos(conceptos, { basico: 1000 });
    expect(r[0].error).toBeNull();
    expect(r[1].error).not.toBeNull();
    expect(r[2].error).toBeNull();
  });
});
