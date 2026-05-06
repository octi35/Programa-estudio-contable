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

module.exports = { generarLSD, generarF931 };
