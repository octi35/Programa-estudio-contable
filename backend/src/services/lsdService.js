const ExcelJS = require('exceljs');
const dayjs = require('dayjs');

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/**
 * Genera el Libro de Sueldos Digital (LSD) en formato Excel según AFIP
 */
async function generarLSD(empresa, liquidaciones, anio, mes) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema Estudio Contable';
  workbook.created = new Date();

  const nombreMes = MESES[mes - 1];
  const sheet = workbook.addWorksheet(`LSD ${nombreMes} ${anio}`, {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  // Estilos
  const headerStyle = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } },
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: { bottom: { style: 'thin', color: { argb: 'FF999999' } } },
  };

  const numStyle = {
    numFmt: '#,##0.00',
    alignment: { horizontal: 'right' },
    font: { size: 9 },
  };

  // Encabezado empresa
  sheet.mergeCells('A1:U1');
  sheet.getCell('A1').value = `LIBRO DE SUELDOS Y JORNALES - ${empresa.razonSocial} (CUIT: ${empresa.cuit})`;
  sheet.getCell('A1').font = { bold: true, size: 11, color: { argb: 'FF1E3A5F' } };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:U2');
  sheet.getCell('A2').value = `Período: ${nombreMes} ${anio} | Convenio: ${empresa.convenio?.nombre || 'LCT 20.744'}`;
  sheet.getCell('A2').alignment = { horizontal: 'center' };
  sheet.getCell('A2').font = { italic: true, size: 9 };

  // Encabezados columnas
  const headers = [
    { header: 'Legajo', key: 'legajo', width: 8 },
    { header: 'Apellido y Nombre', key: 'nombre', width: 22 },
    { header: 'CUIL', key: 'cuil', width: 14 },
    { header: 'Categoría', key: 'categoria', width: 10 },
    { header: 'Días Trab.', key: 'diasTrab', width: 9 },
    { header: 'Sueldo Básico', key: 'basico', width: 13 },
    { header: 'Antigüedad', key: 'antiguedad', width: 11 },
    { header: 'Presentismo', key: 'presentismo', width: 11 },
    { header: 'H.E. 50%', key: 'he50', width: 10 },
    { header: 'H.E. 100%', key: 'he100', width: 10 },
    { header: 'Otros Haberes', key: 'otrosHaberes', width: 13 },
    { header: 'Total Remuner.', key: 'totalRem', width: 13 },
    { header: 'Total No Rem.', key: 'totalNoRem', width: 13 },
    { header: 'Total Haberes', key: 'totalHaberes', width: 13 },
    { header: 'Jubil. (11%)', key: 'jubilacion', width: 11 },
    { header: 'O.S. (3%)', key: 'obraSocial', width: 10 },
    { header: 'INSSJP (3%)', key: 'inssjp', width: 11 },
    { header: 'Sindicato', key: 'sindicato', width: 10 },
    { header: 'Otros Desc.', key: 'otrosDesc', width: 11 },
    { header: 'Total Desc.', key: 'totalDesc', width: 11 },
    { header: 'NETO', key: 'neto', width: 13 },
  ];

  sheet.columns = headers;

  const headerRow = sheet.getRow(4);
  headerRow.height = 30;
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h.header;
    Object.assign(cell, headerStyle);
  });

  // Datos
  let rowNum = 5;
  const totales = {
    basico: 0, antiguedad: 0, presentismo: 0, he50: 0, he100: 0,
    otrosHaberes: 0, totalRem: 0, totalNoRem: 0, totalHaberes: 0,
    jubilacion: 0, obraSocial: 0, inssjp: 0, sindicato: 0, otrosDesc: 0,
    totalDesc: 0, neto: 0,
  };

  for (const liq of liquidaciones) {
    const emp = liq.empleado;
    const detalles = liq.detalles || [];

    const getDetalle = (codigo) => {
      const d = detalles.find(x => x.descripcion?.includes(codigo) || x.codigo === codigo);
      return d ? Math.abs(Number(d.importe)) : 0;
    };

    const basico = getDetalle('Sueldo Básico');
    const antiguedad = getDetalle('Antigüedad');
    const presentismo = getDetalle('Presentismo');
    const he50 = detalles.filter(d => d.descripcion?.includes('50%')).reduce((s, d) => s + Math.abs(Number(d.importe)), 0);
    const he100 = detalles.filter(d => d.descripcion?.includes('100%')).reduce((s, d) => s + Math.abs(Number(d.importe)), 0);
    const jubilacion = getDetalle('Jubilación');
    const obraSocial = getDetalle('Obra Social');
    const inssjp = getDetalle('INSSJP');
    const sindicato = getDetalle('Sindicato');

    const totalHaberes = Number(liq.totalHaberes);
    const totalDesc = Number(liq.totalDescuentos);
    const neto = Number(liq.totalNeto);
    const totalRem = basico + antiguedad + presentismo + he50 + he100;
    const totalNoRem = totalHaberes - totalRem > 0 ? totalHaberes - totalRem : 0;
    const otrosDesc = totalDesc - jubilacion - obraSocial - inssjp - sindicato;

    const row = sheet.getRow(rowNum);
    row.values = [
      emp.legajoNumero || '',
      `${emp.apellido}, ${emp.nombre}`,
      emp.cuil,
      emp.categoria || '',
      Number(liq.diasTrabajados),
      basico, antiguedad, presentismo, he50, he100,
      0, totalRem, totalNoRem, totalHaberes,
      jubilacion, obraSocial, inssjp, sindicato,
      otrosDesc > 0 ? otrosDesc : 0,
      totalDesc, neto,
    ];

    // Formatear celdas numéricas
    for (let col = 6; col <= 21; col++) {
      row.getCell(col).numFmt = '#,##0.00';
      row.getCell(col).alignment = { horizontal: 'right' };
    }
    row.getCell(5).alignment = { horizontal: 'center' };

    if (rowNum % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    }
    row.font = { size: 8.5 };

    // Acumular totales
    totales.basico += basico;
    totales.antiguedad += antiguedad;
    totales.presentismo += presentismo;
    totales.he50 += he50;
    totales.he100 += he100;
    totales.totalRem += totalRem;
    totales.totalNoRem += totalNoRem;
    totales.totalHaberes += totalHaberes;
    totales.jubilacion += jubilacion;
    totales.obraSocial += obraSocial;
    totales.inssjp += inssjp;
    totales.sindicato += sindicato;
    totales.otrosDesc += otrosDesc > 0 ? otrosDesc : 0;
    totales.totalDesc += totalDesc;
    totales.neto += neto;

    rowNum++;
  }

  // Fila de totales
  const totalRow = sheet.getRow(rowNum + 1);
  totalRow.values = ['', 'TOTALES', '', '', '',
    totales.basico, totales.antiguedad, totales.presentismo, totales.he50, totales.he100,
    totales.otrosHaberes, totales.totalRem, totales.totalNoRem, totales.totalHaberes,
    totales.jubilacion, totales.obraSocial, totales.inssjp, totales.sindicato,
    totales.otrosDesc, totales.totalDesc, totales.neto,
  ];
  totalRow.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  for (let col = 6; col <= 21; col++) {
    totalRow.getCell(col).numFmt = '#,##0.00';
    totalRow.getCell(col).alignment = { horizontal: 'right' };
    totalRow.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Genera archivo F.931 (SICOSS) en formato de texto plano para AFIP
 */
function generarF931(empresa, liquidaciones, anio, mes) {
  const periodo = `${anio}${String(mes).padStart(2, '0')}`;
  const cuitEmpresa = empresa.cuit.replace(/-/g, '');
  const lineas = [];

  for (const liq of liquidaciones) {
    const emp = liq.empleado;
    const cuil = emp.cuil.replace(/-/g, '');
    const remuneracion = Math.round(Number(liq.totalHaberes) * 100).toString().padStart(15, '0');
    const aportes = Math.round(Number(liq.totalDescuentos) * 100).toString().padStart(15, '0');

    // Formato simplificado SICOSS (campo por campo según spec AFIP)
    const linea = [
      '1',                    // tipo registro
      periodo,                // período AAAAMM
      cuitEmpresa,            // CUIT empleador (11 dígitos)
      cuil,                   // CUIL empleado (11 dígitos)
      '01',                   // código modalidad contrato
      String(liq.diasTrabajados || 0).padStart(2, '0'), // días trabajados
      remuneracion,           // remuneración imponible
      aportes,                // aportes a cargo empleado
      '00000000000000',       // contribuciones empleador
      '0',                    // situación revista
      ' '.repeat(20),         // filler
    ].join('');

    lineas.push(linea);
  }

  return lineas.join('\r\n') + '\r\n';
}

// ── TXT de importación del Libro de Sueldos Digital (ARCA) ──────────────────
//
// Genera el archivo de la "interfaz de liquidación" del LSD (Guía N.º 15 de
// ARCA) listo para subir en el servicio web: registros de ancho fijo
//   01 (35 posiciones)  → datos referenciales del envío (uno por archivo)
//   02 (115 posiciones) → datos generales de la liquidación de cada trabajador
//   03 (51 posiciones)  → un registro por concepto liquidado del recibo
//   04 (370 posiciones) → atributos de la relación laboral para la DJ F.931
//
// Convenciones del formato: importes con 2 decimales implícitos sin separador,
// rellenos con ceros a la izquierda; alfanuméricos completados con blancos;
// fechas AAAAMMDD; codificación ANSI; una línea por registro.

const LARGOS = { '01': 35, '02': 115, '03': 51, '04': 370 };

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const num = (valor, largo) =>
  String(Math.max(0, Math.round(Number(valor) || 0))).padStart(largo, '0').slice(-largo);
// Importes y cantidades: 2 decimales implícitos (1234.5 → ...000123450)
const imp = (valor, largo = 15) =>
  String(Math.max(0, Math.round((Number(valor) || 0) * 100))).padStart(largo, '0').slice(-largo);
const alfa = (valor, largo) => String(valor ?? '').slice(0, largo).padEnd(largo, ' ');

// Modalidad de contratación según tabla ARCA/SICOSS (ajustable por legajo si
// el caso real difiere; 008 = trabajo a tiempo completo indeterminado).
const MODALIDAD_LSD = {
  TIEMPO_INDETERMINADO: '008',
  PLAZO_FIJO: '021',
  EVENTUAL: '022',
  PASANTIA: '027',
  APRENDIZAJE: '026',
};

function registro01(empresa, anio, mes, cantReg04, nroLiq) {
  return [
    '01',
    soloDigitos(empresa.cuit).padStart(11, '0'),
    'SJ',                                   // SJ = liquidación + F931 (RE = solo rectificativa)
    `${anio}${String(mes).padStart(2, '0')}`,
    'M',                                    // tipo de liquidación: mensual
    num(nroLiq, 5),
    '30',                                   // días base: fijo 30 según la guía
    num(cantReg04, 6),
  ].join('');
}

function registro02(liq, fechaPago) {
  const emp = liq.empleado;
  const cbu = soloDigitos(emp.cbu);
  const formaPago = cbu.length === 22 ? '3' : '1'; // 3 = acreditación en cuenta, 1 = efectivo
  const dias = Number(liq.diasTrabajados) || 0;
  return [
    '02',
    soloDigitos(emp.cuil).padStart(11, '0'),
    alfa(emp.legajoNumero, 10),
    alfa('', 50),                            // dependencia de revista (optativo)
    formaPago === '3' ? cbu : alfa('', 22),
    num(dias >= 30 ? 0 : dias, 3),           // días para proporcionar tope (0 = tope completo)
    fechaPago,                                // AAAAMMDD, obligatorio
    alfa('', 8),                              // fecha de rúbrica: en blanco
    formaPago,
  ].join('');
}

function registro03(cuil, detalle) {
  const unidad = detalle.concepto?.unidad === 'DIAS' ? 'D'
    : detalle.concepto?.unidad === 'HORAS' ? 'H' : ' ';
  return [
    '03',
    soloDigitos(cuil).padStart(11, '0'),
    alfa(detalle.concepto?.codigo, 10),       // código de concepto del empleador (mapeado a concepto ARCA)
    imp(Math.abs(Number(detalle.cantidad) || 0), 5),
    unidad,
    imp(Math.abs(Number(detalle.importe))),
    detalle.naturaleza === 'DESCUENTO' ? 'D' : 'C',
    '000000',                                 // período de ajuste retroactivo (en curso = sin ajuste)
  ].join('');
}

function registro04(liq) {
  const emp = liq.empleado;
  const familiares = (emp.familiares || []).filter(f => f.activo);
  const conyuge = familiares.some(f => f.parentesco === 'CONYUGE') ? '1' : '0';
  const hijos = familiares.filter(f => ['HIJO', 'HIJA'].includes(f.parentesco)).length;

  const detalles = liq.detalles || [];
  const haberes = detalles.filter(d => d.naturaleza === 'HABER' && d.tipo !== 'APORTE_EMPLEADOR');
  const imponible = haberes.filter(d => d.remunerativo !== false)
    .reduce((s, d) => s + Math.abs(Number(d.importe)), 0);
  const bruta = Number(liq.totalHaberes) || 0;

  const partes = [
    '04',
    soloDigitos(emp.cuil).padStart(11, '0'),
    conyuge,
    num(Math.min(hijos, 99), 2),
    emp.convenioId ? '1' : '0',               // marca de convencionado (CCT)
    '1',                                      // seguro colectivo de vida obligatorio
    '0',                                      // marca de corresponde reducción
    '1',                                      // tipo de empresa (1 = común)
    '0',                                      // tipo de operación
    '01',                                     // situación de revista: activo
    '01',                                     // condición: servicios comunes, mayor de 18
    '000',                                    // actividad (0 = sin actividad diferencial)
    MODALIDAD_LSD[emp.modalidadContrato] || '008',
    '00',                                     // código de siniestrado
    '00',                                     // código de localidad/zona
    '01', '01',                               // situación de revista 1 + día de inicio
    '00', '00',                               // situación de revista 2 (no informada)
    '00', '00',                               // situación de revista 3 (no informada)
    num(Math.min(Number(liq.diasTrabajados) || 0, 99), 2),
    num(Number(liq.horasTrabajadas) || 0, 3),
    imp(0, 5),                                // porcentaje de aporte adicional SS
    imp(0, 5),                                // contribución por tarea diferencial
    soloDigitos(emp.obraSocialCodigo).padStart(6, '0'),
    '00',                                     // cantidad de adherentes a la obra social
    imp(0),                                   // aporte adicional de obra social
    imp(0),                                   // contribución adicional de obra social
    imp(0),                                   // base diferencial aportes OS y FSR
    imp(0),                                   // base diferencial OS y FSR
    imp(0),                                   // base de cálculo diferencial LRT
    imp(0),                                   // remuneración maternidad para ANSES
    imp(bruta),                               // remuneración bruta
    imp(imponible), imp(imponible), imp(imponible), imp(imponible), imp(imponible), // bases imponibles 1 a 5
    imp(0), imp(0),                           // bases imponibles 6 y 7
    imp(imponible), imp(imponible),           // bases imponibles 8 y 9
    imp(0),                                   // base imponible aporte dif. SS
    imp(0),                                   // base imponible contribución dif. SS
    imp(0),                                   // base imponible 10
    imp(0),                                   // importe a detraer (Ley 27.430)
  ];
  return partes.join('');
}

/**
 * Genera el TXT de importación del LSD para un período.
 * `liquidaciones` debe incluir `empleado` (con `familiares`) y `detalles`
 * (con `concepto`). Devuelve { contenido, trabajadores }.
 */
function generarLsdTxt(empresa, liquidaciones, anio, mes, opciones = {}) {
  const fechaPago = soloDigitos(opciones.fechaPago).slice(0, 8)
    || dayjs(`${anio}-${String(mes).padStart(2, '0')}-01`).endOf('month').format('YYYYMMDD');
  const nroLiq = opciones.nroLiq || 1;

  const lineas = [registro01(empresa, anio, mes, liquidaciones.length, nroLiq)];

  for (const liq of liquidaciones) {
    lineas.push(registro02(liq, fechaPago));
    const conceptos = (liq.detalles || []).filter(d =>
      d.tipo !== 'APORTE_EMPLEADOR'
      && d.naturaleza !== 'INFORMATIVO'
      && Math.round(Math.abs(Number(d.importe)) * 100) > 0);
    for (const d of conceptos) lineas.push(registro03(liq.empleado.cuil, d));
    lineas.push(registro04(liq));
  }

  // Validación dura de anchos: un archivo corrido de posición es rechazado por ARCA
  for (const linea of lineas) {
    const esperado = LARGOS[linea.slice(0, 2)];
    if (linea.length !== esperado) {
      throw new Error(`Registro ${linea.slice(0, 2)} con largo ${linea.length} (esperado ${esperado})`);
    }
  }

  return { contenido: lineas.join('\r\n') + '\r\n', trabajadores: liquidaciones.length };
}

module.exports = { generarLSD, generarF931, generarLsdTxt };
