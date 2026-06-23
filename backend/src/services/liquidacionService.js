const prisma = require('../lib/prisma');
const dayjs = require('dayjs');
const calcs = require('../utils/calculosLaborales');


/**
 * Calcula o recalcula la liquidación mensual de un empleado para un período
 */
async function calcularLiquidacionMensual(empleadoId, anio, mes, opciones = {}) {
  const {
    diasTrabajados = null,
    horasExtras50 = 0,
    horasExtras100 = 0,
    adelanto = 0,
    otrosDescuentos = [],
    otrosHaberes = [],
    sindicato = true,
    cuotaSolidaria = false,
  } = opciones;

  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: {
      empresa: {
        include: { convenio: { include: { conceptos: { where: { activo: true } } } } },
      },
    },
  });

  if (!empleado) throw Object.assign(new Error('Empleado no encontrado'), { statusCode: 404 });

  const diasHabiles = calcs.diasHabilesMes(anio, mes);
  const diasTrab = diasTrabajados !== null ? diasTrabajados : diasHabiles;
  const antiguedadAnios = calcs.calcularAntiguedad(empleado.fechaIngreso);
  const basico = Number(empleado.basicoMensual);

  const basicoProporcional = calcs.proporcionalDias(basico, diasTrab, diasHabiles);
  const presentismo = diasTrab >= diasHabiles ? calcs.redondear(basicoProporcional * 0.0833) : 0;
  const adicionalAntiguedad = calcs.redondear(basicoProporcional * calcs.porcentajeAntiguedad(antiguedadAnios));
  const importeHE50 = horasExtras50 > 0 ? calcs.horasExtras50(basico, horasExtras50) : 0;
  const importeHE100 = horasExtras100 > 0 ? calcs.horasExtras100(basico, horasExtras100) : 0;

  let totalRemunerativo = basicoProporcional + presentismo + adicionalAntiguedad + importeHE50 + importeHE100;
  let totalNoRemunerativo = 0;

  for (const h of otrosHaberes) {
    if (h.remunerativo) totalRemunerativo += h.importe;
    else totalNoRemunerativo += h.importe;
  }

  const aportes = calcs.calcularAportesEmpleado(totalRemunerativo);
  const sindicatoImporte = sindicato ? calcs.redondear(basico * 0.02) : 0;
  const cuotaImporte = cuotaSolidaria ? calcs.redondear(basico * 0.01) : 0;

  let totalDescuentos = aportes.jubilacion + aportes.obraSocial + aportes.inssjp
    + sindicatoImporte + cuotaImporte + adelanto;

  for (const d of otrosDescuentos) totalDescuentos += d.importe;

  const totalHaberes = calcs.redondear(totalRemunerativo + totalNoRemunerativo);
  const totalNeto = calcs.redondear(totalHaberes - totalDescuentos);
  const contribuciones = calcs.calcularContribucionesEmpleador(totalRemunerativo);

  const conceptos = empleado.empresa.convenio?.conceptos || [];
  const detalles = [];

  // Haberes
  detalles.push({ codigo: '001', descripcion: 'Sueldo Básico', importe: basicoProporcional, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: 10, cantidad: diasTrab, valorUnitario: calcs.redondear(basico / diasHabiles) });

  if (presentismo > 0) detalles.push({ codigo: '002', descripcion: 'Presentismo (8.33%)', importe: presentismo, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: 20 });
  if (adicionalAntiguedad > 0) detalles.push({ codigo: '003', descripcion: `Antigüedad ${antiguedadAnios}% (${antiguedadAnios} años)`, importe: adicionalAntiguedad, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: 30 });
  if (importeHE50 > 0) detalles.push({ codigo: '004', descripcion: `Horas Extras 50% (${horasExtras50}hs)`, importe: importeHE50, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: 40, cantidad: horasExtras50 });
  if (importeHE100 > 0) detalles.push({ codigo: '005', descripcion: `Horas Extras 100% (${horasExtras100}hs)`, importe: importeHE100, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: 50, cantidad: horasExtras100 });

  for (const h of otrosHaberes) {
    detalles.push({ ...h, naturaleza: 'HABER', orden: 60 });
  }

  // Descuentos
  detalles.push({ codigo: '100', descripcion: 'Jubilación (11%)', importe: -aportes.jubilacion, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 100 });
  detalles.push({ codigo: '101', descripcion: 'Obra Social (3%)', importe: -aportes.obraSocial, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 110 });
  detalles.push({ codigo: '102', descripcion: 'INSSJP/PAMI (3%)', importe: -aportes.inssjp, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 120 });

  if (sindicatoImporte > 0) detalles.push({ codigo: '103', descripcion: 'Sindicato (2%)', importe: -sindicatoImporte, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 130 });
  if (cuotaImporte > 0) detalles.push({ codigo: '104', descripcion: 'Cuota Solidaria (1%)', importe: -cuotaImporte, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 140 });
  if (adelanto > 0) detalles.push({ codigo: '105', descripcion: 'Adelanto de Sueldo', importe: -adelanto, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: false, orden: 150 });

  for (const d of otrosDescuentos) {
    detalles.push({ ...d, importe: -Math.abs(d.importe), naturaleza: 'DESCUENTO', orden: 160 });
  }

  // Contribuciones empleador (informativas)
  detalles.push({ codigo: '200', descripcion: 'Contribución Jubilación (16%)', importe: contribuciones.jubilacion, naturaleza: 'INFORMATIVO', tipo: 'APORTE_EMPLEADOR', remunerativo: true, orden: 200 });
  detalles.push({ codigo: '201', descripcion: 'Contribución Obra Social (6%)', importe: contribuciones.obraSocial, naturaleza: 'INFORMATIVO', tipo: 'APORTE_EMPLEADOR', remunerativo: true, orden: 210 });
  detalles.push({ codigo: '202', descripcion: 'Contribución INSSJP (1.5%)', importe: contribuciones.inssjp, naturaleza: 'INFORMATIVO', tipo: 'APORTE_EMPLEADOR', remunerativo: true, orden: 220 });
  detalles.push({ codigo: '203', descripcion: 'ART (2.5%)', importe: contribuciones.art, naturaleza: 'INFORMATIVO', tipo: 'APORTE_EMPLEADOR', remunerativo: false, orden: 230 });

  return {
    empleadoId,
    anio,
    mes,
    tipo: 'MENSUAL',
    diasTrabajados: diasTrab,
    diasNoTrabajados: diasHabiles - diasTrab,
    horasTrabajadas: 0,
    totalHaberes,
    totalDescuentos: calcs.redondear(totalDescuentos),
    totalNeto,
    totalContribuciones: contribuciones.total,
    estado: 'CALCULADO',
    detalles,
    resumen: {
      basico,
      basicoProporcional,
      diasHabiles,
      diasTrabajados: diasTrab,
      antiguedadAnios,
      totalRemunerativo: calcs.redondear(totalRemunerativo),
      totalNoRemunerativo: calcs.redondear(totalNoRemunerativo),
      aportes,
      contribuciones,
    },
  };
}

/**
 * Calcula SAC (aguinaldo) para un empleado
 */
async function calcularSAC(empleadoId, anio, semestre) {
  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!empleado) throw Object.assign(new Error('Empleado no encontrado'), { statusCode: 404 });

  const mesInicio = semestre === 1 ? 1 : 7;
  const mesFin = semestre === 1 ? 6 : 12;

  const liquidacionesSemestre = await prisma.liquidacion.findMany({
    where: {
      empleadoId,
      anio,
      mes: { gte: mesInicio, lte: mesFin },
      tipo: 'MENSUAL',
      estado: { in: ['CALCULADO', 'CONFIRMADO'] },
    },
    orderBy: { totalHaberes: 'desc' },
  });

  const mejorRemuneracion = liquidacionesSemestre.length > 0
    ? Number(liquidacionesSemestre[0].totalHaberes)
    : Number(empleado.basicoMensual);

  const fechaInicio = new Date(`${anio}-${mesInicio}-01`);
  const fechaFin = new Date(`${anio}-${mesFin}-${mesInicio === 1 ? 30 : 31}`);
  const diasPeriodo = dayjs(fechaFin).diff(dayjs(fechaInicio), 'day') + 1;
  const fechaIngreso = dayjs(empleado.fechaIngreso);

  let diasLaborados = diasPeriodo;
  if (fechaIngreso.isAfter(dayjs(fechaInicio))) {
    diasLaborados = dayjs(fechaFin).diff(fechaIngreso, 'day') + 1;
  }

  const importeSAC = calcs.calcularSAC(mejorRemuneracion, diasLaborados, diasPeriodo);
  const aportes = calcs.calcularAportesEmpleado(importeSAC);
  const contribuciones = calcs.calcularContribucionesEmpleador(importeSAC);
  const mesSAC = semestre === 1 ? 6 : 12;

  const detalles = [
    { codigo: '008', descripcion: `SAC ${semestre}° Semestre ${anio}`, importe: importeSAC, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: 10 },
    { codigo: '100', descripcion: 'Jubilación SAC (11%)', importe: -aportes.jubilacion, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 100 },
    { codigo: '101', descripcion: 'Obra Social SAC (3%)', importe: -aportes.obraSocial, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 110 },
    { codigo: '102', descripcion: 'INSSJP SAC (3%)', importe: -aportes.inssjp, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 120 },
  ];

  return {
    empleadoId,
    anio,
    mes: mesSAC,
    tipo: semestre === 1 ? 'SAC_JUNIO' : 'SAC_DICIEMBRE',
    diasTrabajados: diasLaborados,
    diasNoTrabajados: diasPeriodo - diasLaborados,
    horasTrabajadas: 0,
    totalHaberes: importeSAC,
    totalDescuentos: aportes.total,
    totalNeto: calcs.redondear(importeSAC - aportes.total),
    totalContribuciones: contribuciones.total,
    estado: 'CALCULADO',
    detalles,
    resumen: { mejorRemuneracion, diasLaborados, diasPeriodo, importeSAC, aportes, contribuciones },
  };
}

/**
 * Calcula vacaciones
 */
async function calcularVacaciones(empleadoId, anio, mes) {
  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!empleado) throw Object.assign(new Error('Empleado no encontrado'), { statusCode: 404 });

  const antiguedadAnios = calcs.calcularAntiguedad(empleado.fechaIngreso);
  const dias = calcs.diasVacaciones(antiguedadAnios);
  const remuneracionMensual = Number(empleado.basicoMensual);
  const importe = calcs.importeVacaciones(remuneracionMensual, antiguedadAnios);
  const aportes = calcs.calcularAportesEmpleado(importe);
  const contribuciones = calcs.calcularContribucionesEmpleador(importe);

  const detalles = [
    { codigo: '009', descripcion: `Vacaciones ${dias} días (${antiguedadAnios} años antigüedad)`, importe, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: 10, cantidad: dias },
    { codigo: '100', descripcion: 'Jubilación (11%)', importe: -aportes.jubilacion, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 100 },
    { codigo: '101', descripcion: 'Obra Social (3%)', importe: -aportes.obraSocial, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 110 },
    { codigo: '102', descripcion: 'INSSJP (3%)', importe: -aportes.inssjp, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 120 },
  ];

  return {
    empleadoId,
    anio,
    mes,
    tipo: 'VACACIONES',
    diasTrabajados: dias,
    diasNoTrabajados: 0,
    horasTrabajadas: 0,
    totalHaberes: importe,
    totalDescuentos: aportes.total,
    totalNeto: calcs.redondear(importe - aportes.total),
    totalContribuciones: contribuciones.total,
    estado: 'CALCULADO',
    detalles,
    resumen: { dias, remuneracionMensual, antiguedadAnios, importe, aportes, contribuciones },
  };
}

/**
 * Persiste una liquidación calculada en la base de datos
 */
async function guardarLiquidacion(liquidacionData, periodoId, conceptosMap = {}) {
  const existing = await prisma.liquidacion.findUnique({
    where: { periodoId_empleadoId: { periodoId, empleadoId: liquidacionData.empleadoId } },
  });

  // Concepto de respaldo: cada DetalleLiquidacion requiere un conceptoId (FK NOT NULL).
  // Si el código no está mapeado, usamos el concepto '001' o, en su defecto, cualquiera
  // existente, para no descartar silenciosamente líneas de la liquidación.
  const conceptoDefault = (await prisma.concepto.findFirst({ where: { codigo: '001' } }))
    || (await prisma.concepto.findFirst());
  if (!conceptoDefault) {
    throw Object.assign(
      new Error('No hay conceptos cargados. Ejecutá el seed de conceptos antes de liquidar.'),
      { statusCode: 409 }
    );
  }

  const detallesCreate = liquidacionData.detalles.map(d => ({
    conceptoId: conceptosMap[d.codigo] || conceptoDefault.id,
    descripcion: d.descripcion,
    cantidad: d.cantidad || null,
    valorUnitario: d.valorUnitario || null,
    importe: Math.abs(d.importe),
    naturaleza: d.naturaleza,
    tipo: d.tipo || 'REMUNERATIVO',
    remunerativo: d.remunerativo ?? true,
    orden: d.orden || 0,
  }));

  if (existing) {
    await prisma.detalleLiquidacion.deleteMany({ where: { liquidacionId: existing.id } });
    return prisma.liquidacion.update({
      where: { id: existing.id },
      data: {
        diasTrabajados: liquidacionData.diasTrabajados,
        diasNoTrabajados: liquidacionData.diasNoTrabajados,
        totalHaberes: liquidacionData.totalHaberes,
        totalDescuentos: liquidacionData.totalDescuentos,
        totalNeto: liquidacionData.totalNeto,
        totalContribuciones: liquidacionData.totalContribuciones,
        estado: liquidacionData.estado,
        detalles: { create: detallesCreate },
      },
      include: { detalles: { orderBy: { orden: 'asc' } }, empleado: true },
    });
  }

  return prisma.liquidacion.create({
    data: {
      periodoId,
      empleadoId: liquidacionData.empleadoId,
      anio: liquidacionData.anio,
      mes: liquidacionData.mes,
      tipo: liquidacionData.tipo,
      diasTrabajados: liquidacionData.diasTrabajados,
      diasNoTrabajados: liquidacionData.diasNoTrabajados,
      totalHaberes: liquidacionData.totalHaberes,
      totalDescuentos: liquidacionData.totalDescuentos,
      totalNeto: liquidacionData.totalNeto,
      totalContribuciones: liquidacionData.totalContribuciones,
      estado: liquidacionData.estado,
      detalles: { create: detallesCreate },
    },
    include: { detalles: { orderBy: { orden: 'asc' } }, empleado: true },
  });
}

/**
 * Calcula liquidación final al momento de la baja del empleado
 * motivo: DESPIDO_SIN_CAUSA | DESPIDO_CON_CAUSA | RENUNCIA | MUTUO_ACUERDO | JUBILACION | FALLECIMIENTO | VENCIMIENTO_CONTRATO
 */
async function calcularLiquidacionFinal(empleadoId, fechaBaja, motivo) {
  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { empresa: { include: { convenio: { include: { conceptos: { where: { activo: true } } } } } } },
  });
  if (!empleado) throw Object.assign(new Error('Empleado no encontrado'), { statusCode: 404 });

  const fechaBajaDay = dayjs(fechaBaja);
  const anio = fechaBajaDay.year();
  const mes = fechaBajaDay.month() + 1;
  const diaBaja = fechaBajaDay.date();
  const diasHabiles = calcs.diasHabilesMes(anio, mes);
  const antiguedadAnios = calcs.calcularAntiguedad(empleado.fechaIngreso, fechaBaja);
  const basico = Number(empleado.basicoMensual);
  const detalles = [];
  let orden = 10;

  // 1. Sueldo proporcional días trabajados en el mes
  const diasTrabajados = Math.min(diaBaja, diasHabiles);
  const sueldoProporcional = calcs.proporcionalDias(basico, diasTrabajados, diasHabiles);
  detalles.push({ codigo: '001', descripcion: `Sueldo proporcional ${diasTrabajados}/${diasHabiles} días`, importe: sueldoProporcional, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: orden++ });

  // 2. SAC proporcional (desde inicio del semestre hasta la baja)
  const inicioSemestre = mes <= 6 ? dayjs(`${anio}-01-01`) : dayjs(`${anio}-07-01`);
  const diasSemestre = mes <= 6 ? 181 : 184;
  const diasTranscurridos = fechaBajaDay.diff(inicioSemestre, 'day') + 1;

  const liqSemestre = await prisma.liquidacion.findMany({
    where: {
      empleadoId,
      anio,
      mes: { gte: inicioSemestre.month() + 1, lte: mes },
      tipo: 'MENSUAL',
      estado: { in: ['CALCULADO', 'CONFIRMADO'] },
    },
    orderBy: { totalHaberes: 'desc' },
  });
  const mejorRem = liqSemestre.length > 0 ? Number(liqSemestre[0].totalHaberes) : basico;
  const sacProporcional = calcs.calcularSAC(mejorRem, diasTranscurridos, diasSemestre);
  if (sacProporcional > 0) {
    detalles.push({ codigo: '008', descripcion: `SAC proporcional (${diasTranscurridos} días)`, importe: sacProporcional, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: orden++ });
  }

  // 3. Vacaciones proporcionales (días corridos proporcionales al año)
  const diasVacTotal = calcs.diasVacaciones(antiguedadAnios);
  const diasVacProporcional = Math.round((diasVacTotal / 12) * mes);
  // Descontar vacaciones ya gozadas (simplificado: usar el valor proporcional)
  const importeVacProporcional = calcs.redondear((basico / 25) * diasVacProporcional);
  if (importeVacProporcional > 0) {
    detalles.push({ codigo: '009', descripcion: `Vacaciones proporcionales ${diasVacProporcional} días`, importe: importeVacProporcional, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: orden++, cantidad: diasVacProporcional });
  }

  // 4. Preaviso e Indemnización según motivo
  const conPreaviso = ['DESPIDO_SIN_CAUSA', 'DESPIDO_CON_CAUSA', 'MUTUO_ACUERDO'].includes(motivo);
  const conIndem = motivo === 'DESPIDO_SIN_CAUSA';

  if (conPreaviso) {
    const diasPre = calcs.diasPreaviso(antiguedadAnios);
    const importePreaviso = calcs.redondear((basico / 30) * diasPre);
    detalles.push({ codigo: 'PRE', descripcion: `Preaviso ${diasPre} días (art. 231 LCT)`, importe: importePreaviso, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: orden++, cantidad: diasPre });
    // SAC sobre preaviso
    const sacPreaviso = calcs.redondear(importePreaviso / 12);
    detalles.push({ codigo: 'SACPRE', descripcion: 'SAC sobre preaviso', importe: sacPreaviso, naturaleza: 'HABER', tipo: 'REMUNERATIVO', remunerativo: true, orden: orden++ });
  }

  if (conIndem) {
    const indem = calcs.indemnizacionAntiguedad(mejorRem || basico, antiguedadAnios);
    detalles.push({ codigo: 'INDEM', descripcion: `Indemnización antigüedad ${Math.max(antiguedadAnios, 1)} años (art. 245 LCT)`, importe: indem, naturaleza: 'HABER', tipo: 'NO_REMUNERATIVO', remunerativo: false, orden: orden++ });
  }

  // 5. Aportes sobre la parte remunerativa
  const totalRem = detalles.filter(d => d.remunerativo && d.naturaleza === 'HABER').reduce((s, d) => s + d.importe, 0);
  const aportes = calcs.calcularAportesEmpleado(totalRem);
  const contribuciones = calcs.calcularContribucionesEmpleador(totalRem);

  detalles.push({ codigo: '100', descripcion: 'Jubilación (11%)', importe: -aportes.jubilacion, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 100 });
  detalles.push({ codigo: '101', descripcion: 'Obra Social (3%)', importe: -aportes.obraSocial, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 110 });
  detalles.push({ codigo: '102', descripcion: 'INSSJP/PAMI (3%)', importe: -aportes.inssjp, naturaleza: 'DESCUENTO', tipo: 'DEDUCCION', remunerativo: true, orden: 120 });

  // Contribuciones empleador informativas
  detalles.push({ codigo: '200', descripcion: 'Contribución Jubilación (16%)', importe: contribuciones.jubilacion, naturaleza: 'INFORMATIVO', tipo: 'APORTE_EMPLEADOR', remunerativo: true, orden: 200 });
  detalles.push({ codigo: '201', descripcion: 'Contribución Obra Social (6%)', importe: contribuciones.obraSocial, naturaleza: 'INFORMATIVO', tipo: 'APORTE_EMPLEADOR', remunerativo: true, orden: 210 });
  detalles.push({ codigo: '202', descripcion: 'Contribución INSSJP (1.5%)', importe: contribuciones.inssjp, naturaleza: 'INFORMATIVO', tipo: 'APORTE_EMPLEADOR', remunerativo: true, orden: 220 });

  const totalHaberes = calcs.redondear(detalles.filter(d => d.naturaleza === 'HABER').reduce((s, d) => s + d.importe, 0));
  const totalDescuentos = calcs.redondear(aportes.total);
  const totalNeto = calcs.redondear(totalHaberes - totalDescuentos);

  return {
    empleadoId,
    anio,
    mes,
    tipo: 'LIQUIDACION_FINAL',
    diasTrabajados,
    diasNoTrabajados: diasHabiles - diasTrabajados,
    horasTrabajadas: 0,
    totalHaberes,
    totalDescuentos,
    totalNeto,
    totalContribuciones: contribuciones.total,
    estado: 'CALCULADO',
    detalles,
    resumen: {
      basico, antiguedadAnios, fechaBaja, motivo,
      sacProporcional, importeVacProporcional,
      totalRem, aportes, contribuciones,
    },
  };
}

module.exports = {
  calcularLiquidacionMensual,
  calcularSAC,
  calcularVacaciones,
  calcularLiquidacionFinal,
  guardarLiquidacion,
};
