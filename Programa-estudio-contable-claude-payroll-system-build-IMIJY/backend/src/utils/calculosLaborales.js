const dayjs = require('dayjs');

// Porcentajes vigentes LCT / ANSES
const APORTES = {
  JUBILACION_EMPLEADO: 0.11,
  OBRA_SOCIAL_EMPLEADO: 0.03,
  INSSJP_EMPLEADO: 0.03,
  TOTAL_EMPLEADO: 0.17,
};

const CONTRIBUCIONES = {
  JUBILACION_EMPLEADOR: 0.16,
  OBRA_SOCIAL_EMPLEADOR: 0.06,
  INSSJP_EMPLEADOR: 0.015,
  FONDO_DESEMPLEO: 0.01,
};

/**
 * Calcula antigüedad en años completos
 */
function calcularAntiguedad(fechaIngreso, fechaReferencia = new Date()) {
  return dayjs(fechaReferencia).diff(dayjs(fechaIngreso), 'year');
}

/**
 * Porcentaje adicional por antigüedad (1% por año completo, máx 100%)
 */
function porcentajeAntiguedad(anios) {
  return Math.min(anios, 100) / 100;
}

/**
 * Días de vacaciones según antigüedad (LCT art. 150)
 * < 5 años: 14 días
 * 5-9 años: 21 días
 * 10-19 años: 28 días
 * >= 20 años: 35 días
 */
function diasVacaciones(antiguedadAnios) {
  if (antiguedadAnios < 5) return 14;
  if (antiguedadAnios < 10) return 21;
  if (antiguedadAnios < 20) return 28;
  return 35;
}

/**
 * Valor diario de vacaciones (art. 155 LCT)
 * Remuneración mensual / 25
 */
function valorDiaVacaciones(remuneracionMensual) {
  return remuneracionMensual / 25;
}

/**
 * Importe de vacaciones
 */
function importeVacaciones(remuneracionMensual, antiguedadAnios) {
  const dias = diasVacaciones(antiguedadAnios);
  const valorDia = valorDiaVacaciones(remuneracionMensual);
  return redondear(valorDia * dias);
}

/**
 * SAC (aguinaldo) - LCT art. 121
 * Mejor remuneración mensual del semestre / 2, proporcional si no completó semestre
 */
function calcularSAC(mejorRemuneracionSemestre, diasLaboradosSemestre, diasTotalesSemestre = 182) {
  const sacCompleto = mejorRemuneracionSemestre / 2;
  if (diasLaboradosSemestre >= diasTotalesSemestre) return redondear(sacCompleto);
  return redondear((sacCompleto * diasLaboradosSemestre) / diasTotalesSemestre);
}

/**
 * Calcula valor hora ordinaria
 * Básico mensual / (horas semanales * 4.333)
 */
function valorHoraOrdinaria(basicoMensual, horasSemanales = 40) {
  return basicoMensual / (horasSemanales * 4.333333);
}

/**
 * Horas extras 50% (días hábiles)
 */
function horasExtras50(basicoMensual, cantHoras, horasSemanales = 40) {
  return redondear(valorHoraOrdinaria(basicoMensual, horasSemanales) * 1.5 * cantHoras);
}

/**
 * Horas extras 100% (feriados/domingos)
 */
function horasExtras100(basicoMensual, cantHoras, horasSemanales = 40) {
  return redondear(valorHoraOrdinaria(basicoMensual, horasSemanales) * 2 * cantHoras);
}

/**
 * Calcula proporcional de sueldo por días trabajados
 */
function proporcionalDias(basicoMensual, diasTrabajados, diasHabilesMes) {
  if (diasTrabajados >= diasHabilesMes) return basicoMensual;
  return redondear((basicoMensual / diasHabilesMes) * diasTrabajados);
}

/**
 * Aportes del empleado
 */
function calcularAportesEmpleado(totalRemunerativo) {
  return {
    jubilacion: redondear(totalRemunerativo * APORTES.JUBILACION_EMPLEADO),
    obraSocial: redondear(totalRemunerativo * APORTES.OBRA_SOCIAL_EMPLEADO),
    inssjp: redondear(totalRemunerativo * APORTES.INSSJP_EMPLEADO),
    total: redondear(totalRemunerativo * APORTES.TOTAL_EMPLEADO),
  };
}

/**
 * Contribuciones del empleador
 */
function calcularContribucionesEmpleador(totalRemunerativo, porcentajeART = 0.025) {
  return {
    jubilacion: redondear(totalRemunerativo * CONTRIBUCIONES.JUBILACION_EMPLEADOR),
    obraSocial: redondear(totalRemunerativo * CONTRIBUCIONES.OBRA_SOCIAL_EMPLEADOR),
    inssjp: redondear(totalRemunerativo * CONTRIBUCIONES.INSSJP_EMPLEADOR),
    art: redondear(totalRemunerativo * porcentajeART),
    fondoDesempleo: redondear(totalRemunerativo * CONTRIBUCIONES.FONDO_DESEMPLEO),
    total: redondear(totalRemunerativo * (
      CONTRIBUCIONES.JUBILACION_EMPLEADOR +
      CONTRIBUCIONES.OBRA_SOCIAL_EMPLEADOR +
      CONTRIBUCIONES.INSSJP_EMPLEADOR +
      porcentajeART +
      CONTRIBUCIONES.FONDO_DESEMPLEO
    )),
  };
}

/**
 * Días hábiles de un mes (aprox. 25 para liquidaciones)
 */
function diasHabilesMes(anio, mes) {
  const diasTotales = dayjs(`${anio}-${mes}-01`).daysInMonth();
  let habiles = 0;
  for (let d = 1; d <= diasTotales; d++) {
    const dow = dayjs(`${anio}-${mes}-${d}`).day();
    if (dow !== 0 && dow !== 6) habiles++;
  }
  return habiles;
}

/**
 * Indemnización por antigüedad (LCT art. 245)
 * Mejor remuneración mensual * años de antigüedad
 */
function indemnizacionAntiguedad(mejorRemuneracion, antiguedadAnios) {
  const aniosMin = Math.max(antiguedadAnios, 1);
  return redondear(mejorRemuneracion * aniosMin);
}

/**
 * Preaviso según antigüedad (LCT art. 231-232)
 */
function diasPreaviso(antiguedadAnios) {
  if (antiguedadAnios < 0.25) return 15; // < 3 meses
  if (antiguedadAnios < 5) return 30;
  return 60;
}

function redondear(valor, decimales = 2) {
  return Math.round(valor * Math.pow(10, decimales)) / Math.pow(10, decimales);
}

module.exports = {
  APORTES,
  CONTRIBUCIONES,
  calcularAntiguedad,
  porcentajeAntiguedad,
  diasVacaciones,
  valorDiaVacaciones,
  importeVacaciones,
  calcularSAC,
  valorHoraOrdinaria,
  horasExtras50,
  horasExtras100,
  proporcionalDias,
  calcularAportesEmpleado,
  calcularContribucionesEmpleador,
  diasHabilesMes,
  indemnizacionAntiguedad,
  diasPreaviso,
  redondear,
};
