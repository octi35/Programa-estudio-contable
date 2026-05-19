/**
 * Motor dinámico de fórmulas para liquidación de sueldos.
 *
 * Permite que el contador defina fórmulas en texto plano (ej: "basico * 0.11 + bono")
 * y las evalúa de forma segura en un sandbox matemático, sin acceso al entorno Node.
 *
 * Dependencia: mathjs (sandbox explícito — NO usa eval() de JS)
 */

const { create, all } = require('mathjs');
const winston = require('winston');

// ── Logger ──────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `${timestamp} [motorFormulas] ${level.toUpperCase()}: ${message}${extra}`;
    })
  ),
  transports: [new winston.transports.Console({ silent: process.env.NODE_ENV === 'test' })],
});

// ── Instancia de mathjs restringida ────────────────────────────────────────
//    Usamos create(all) y luego bloqueamos los métodos que podrían ser peligrosos
//    (import, evaluate de código arbitrario fuera del scope matemático).
const math = create(all);

// Deshabilitar funciones que permiten importar código externo
math.import(
  {
    import: () => { throw new Error('import() está deshabilitado en el motor de fórmulas'); },
    createUnit: () => { throw new Error('createUnit() está deshabilitado en el motor de fórmulas'); },
    reviver: () => { throw new Error('reviver() está deshabilitado'); },
  },
  { override: true }
);

// ── Variables reservadas permitidas ─────────────────────────────────────────
//    Toda variable que el contador use en sus fórmulas debe existir aquí.
//    Si llega undefined, se reemplaza por 0 para evitar errores de evaluación.
const VARIABLES_CONOCIDAS = [
  'basico', 'antiguedad', 'diasTrabajados', 'diasHabiles', 'horasExtras50',
  'horasExtras100', 'presentismo', 'adicionalAntiguedad', 'totalRemunerativo',
  'totalNoRemunerativo', 'bono', 'comision', 'viaticos', 'adelanto',
  'obra_social', 'sindicato', 'ganancias', 'salarioMinimo', 'valorHora',
];

/**
 * Sanitiza el scope: convierte a número, reemplaza undefined/null por 0,
 * y rechaza valores no numéricos para evitar inyecciones de código.
 *
 * @param {Object} variables  Ej: { basico: 500000, bono: 15000 }
 * @returns {Object}          Scope seguro para mathjs
 */
function sanitizarScope(variables) {
  const scope = {};
  for (const [clave, valor] of Object.entries(variables)) {
    const num = Number(valor);
    if (isNaN(num)) {
      logger.warn(`Variable "${clave}" no es numérica (valor: ${valor}). Se reemplaza por 0.`);
      scope[clave] = 0;
    } else {
      scope[clave] = num;
    }
  }
  // Garantizar que todas las variables conocidas existan (aunque no vengan)
  for (const v of VARIABLES_CONOCIDAS) {
    if (!(v in scope)) scope[v] = 0;
  }
  return scope;
}

/**
 * Evalúa una fórmula de texto usando las variables del empleado.
 *
 * @param {string} formula     Ej: "(basico * 0.11) + bono"
 * @param {Object} variables   Ej: { basico: 500000, bono: 15000 }
 * @returns {{ importe: number, error: string|null }}
 *
 * @example
 *   evaluarFormula('basico * 0.11', { basico: 500000 })
 *   // => { importe: 55000, error: null }
 *
 *   evaluarFormula('basico ** monto', { basico: 500000 })
 *   // => { importe: 0, error: 'Variable "monto" no definida...' }
 */
function evaluarFormula(formula, variables = {}) {
  if (!formula || typeof formula !== 'string') {
    return { importe: 0, error: 'La fórmula está vacía o no es un string.' };
  }

  const formulaLimpia = formula.trim();

  try {
    const scope = sanitizarScope(variables);
    const resultado = math.evaluate(formulaLimpia, scope);

    // mathjs puede devolver un objeto BigNumber, Fraction, etc. — normalizar a number
    const importe = typeof resultado === 'object' && resultado !== null
      ? Number(resultado.toNumber?.() ?? resultado)
      : Number(resultado);

    if (!isFinite(importe) || isNaN(importe)) {
      throw new Error(`La fórmula "${formulaLimpia}" produjo un resultado no numérico: ${resultado}`);
    }

    // Redondear a 2 decimales (centavos)
    const importeRedondeado = Math.round(importe * 100) / 100;

    logger.info('Fórmula evaluada', { formula: formulaLimpia, importe: importeRedondeado });
    return { importe: importeRedondeado, error: null };

  } catch (err) {
    // Clasificar el tipo de error para dar un mensaje útil al contador
    let mensajeAmigable;

    if (err.message.includes('Undefined symbol')) {
      const match = err.message.match(/Undefined symbol (.+)/);
      const simbolo = match ? match[1].trim() : 'desconocido';
      mensajeAmigable = `Variable "${simbolo}" no está definida. Verificá el nombre de la variable en la fórmula.`;
    } else if (err.message.includes('Unexpected end of expression') || err.message.includes('Unexpected token')) {
      mensajeAmigable = `Error de sintaxis en la fórmula. Revisá paréntesis, operadores o comas.`;
    } else if (err.message.includes('Cannot divide by zero')) {
      mensajeAmigable = `División por cero en la fórmula. Verificá el denominador.`;
    } else {
      mensajeAmigable = `Error al evaluar la fórmula: ${err.message}`;
    }

    logger.error('Error evaluando fórmula', { formula: formulaLimpia, error: err.message });
    return { importe: 0, error: mensajeAmigable };
  }
}

/**
 * Valida una fórmula sin ejecutarla contra datos reales.
 * Útil para validar en el frontend antes de guardar el concepto.
 *
 * @param {string} formula
 * @returns {{ valida: boolean, error: string|null }}
 */
function validarFormula(formula) {
  if (!formula || typeof formula !== 'string') {
    return { valida: false, error: 'La fórmula está vacía.' };
  }
  // Evaluar con un scope de ceros para chequear solo la sintaxis
  const scopeTest = {};
  for (const v of VARIABLES_CONOCIDAS) scopeTest[v] = 1; // usar 1 para evitar división por cero

  const { error } = evaluarFormula(formula, scopeTest);
  return { valida: !error, error: error || null };
}

/**
 * Evalúa múltiples fórmulas en secuencia, acumulando el scope con los
 * resultados intermedios (útil para conceptos que dependen entre sí).
 *
 * @param {Array<{codigo: string, descripcion: string, formula: string}>} conceptos
 * @param {Object} variablesBase   Variables del empleado (basico, antiguedad, etc.)
 * @returns {Array<{codigo, descripcion, importe, error}>}
 */
function evaluarConceptos(conceptos, variablesBase = {}) {
  const scopeAcumulado = sanitizarScope(variablesBase);
  const resultados = [];

  for (const concepto of conceptos) {
    const { importe, error } = evaluarFormula(concepto.formula, scopeAcumulado);
    resultados.push({ codigo: concepto.codigo, descripcion: concepto.descripcion, importe, error });
    // Inyectar el resultado en el scope para que lo usen fórmulas posteriores
    if (!error && concepto.codigo) {
      scopeAcumulado[concepto.codigo.toLowerCase().replace(/\W/g, '_')] = importe;
    }
  }

  return resultados;
}

module.exports = { evaluarFormula, validarFormula, evaluarConceptos };
