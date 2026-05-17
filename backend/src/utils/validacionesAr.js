/**
 * Validaciones específicas para Argentina: CUIL, CUIT, CBU
 */

/**
 * Valida CUIL/CUIT con algoritmo oficial (dígito verificador)
 * Formato esperado: XX-XXXXXXXX-X
 */
function validarCUIL(cuil) {
  if (!cuil) return false;
  const limpio = cuil.replace(/[-\s]/g, '');
  if (!/^\d{11}$/.test(limpio)) return false;

  const prefijos = ['20', '23', '24', '25', '26', '27', '30', '33', '34'];
  const prefijo = limpio.substring(0, 2);
  if (!prefijos.includes(prefijo)) return false;

  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += parseInt(limpio[i]) * mult[i];
  }
  const resto = suma % 11;
  const dv = parseInt(limpio[10]);

  if (resto === 0) return dv === 0;
  if (resto === 1) return dv === 9; // excepción oficial
  return dv === 11 - resto;
}

/**
 * Formatea CUIL/CUIT: XXXXXXXXXX -> XX-XXXXXXXX-X
 */
function formatearCUIL(cuil) {
  const limpio = cuil.replace(/[-\s]/g, '');
  if (limpio.length !== 11) return cuil;
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`;
}

/**
 * Valida CBU (22 dígitos con dígitos verificadores)
 * Bloque 1: 7 dígitos + DV
 * Bloque 2: 13 dígitos + DV
 */
function validarCBU(cbu) {
  if (!cbu) return false;
  const limpio = cbu.replace(/\s/g, '');
  if (!/^\d{22}$/.test(limpio)) return false;

  const mult1 = [7, 1, 3, 9, 7, 1, 3];
  const mult2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

  function dvBloque(digits, multipliers) {
    let suma = 0;
    for (let i = 0; i < multipliers.length; i++) {
      suma += parseInt(digits[i]) * multipliers[i];
    }
    const resto = suma % 10;
    return resto === 0 ? 0 : 10 - resto;
  }

  const dv1 = dvBloque(limpio.substring(0, 7), mult1);
  if (dv1 !== parseInt(limpio[7])) return false;

  const dv2 = dvBloque(limpio.substring(8, 21), mult2);
  if (dv2 !== parseInt(limpio[21])) return false;

  return true;
}

/**
 * Extrae banco y sucursal del CBU
 */
function parsearCBU(cbu) {
  const limpio = cbu.replace(/\s/g, '');
  if (limpio.length !== 22) return null;
  return {
    banco: limpio.substring(0, 3),
    sucursal: limpio.substring(3, 7),
    cuentaCompleta: limpio.substring(8, 22),
  };
}

/**
 * Valida DNI (número entre 1 y 99999999)
 */
function validarDNI(dni) {
  if (!dni) return false;
  const limpio = dni.replace(/\./g, '').trim();
  return /^\d{7,8}$/.test(limpio) && parseInt(limpio) > 0;
}

/**
 * Valida CUIT empresa (prefijo 30, 33, 34)
 */
function validarCUIT(cuit) {
  if (!cuit) return false;
  const limpio = cuit.replace(/[-\s]/g, '');
  const prefijo = limpio.substring(0, 2);
  if (!['30', '33', '34'].includes(prefijo)) return false;
  return validarCUIL(cuit);
}

module.exports = {
  validarCUIL,
  formatearCUIL,
  validarCBU,
  parsearCBU,
  validarDNI,
  validarCUIT,
};
