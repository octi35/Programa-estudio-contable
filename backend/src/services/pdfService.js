const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
require('dayjs/locale/es');
dayjs.locale('es');

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/**
 * Genera recibo de sueldo en formato doble (original + duplicado)
 */
async function generarRecibo(liquidacion) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 30, bufferPages: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const emp = liquidacion.empleado;
    const empresa = emp.empresa;
    const estudio = empresa.estudio;
    const periodo = liquidacion.periodo;

    const formatMoney = (n) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const mesNombre = MESES[(liquidacion.mes || periodo.mes) - 1];
    const titulo = getTituloRecibo(liquidacion.tipo);

    // === ORIGINAL (mitad superior) ===
    renderRecibo(doc, { liquidacion, emp, empresa, estudio, formatMoney, mesNombre, titulo, yOffset: 30, altura: 370 });

    // Línea de corte
    doc.moveTo(30, 420).lineTo(565, 420).dash(3, { space: 3 }).stroke('#999').undash();
    doc.fontSize(7).fillColor('#999').text('✂  DUPLICADO - CONSERVAR', 30, 423);

    // === DUPLICADO (mitad inferior) ===
    renderRecibo(doc, { liquidacion, emp, empresa, estudio, formatMoney, mesNombre, titulo, yOffset: 440, altura: 370 });

    doc.end();
  });
}

function getTituloRecibo(tipo) {
  const titulos = {
    MENSUAL: 'RECIBO DE HABERES',
    SAC_JUNIO: 'RECIBO DE SAC - 1° SEMESTRE',
    SAC_DICIEMBRE: 'RECIBO DE SAC - 2° SEMESTRE',
    VACACIONES: 'RECIBO DE VACACIONES',
    LIQUIDACION_FINAL: 'LIQUIDACIÓN FINAL',
    COMPLEMENTO: 'RECIBO COMPLEMENTARIO',
  };
  return titulos[tipo] || 'RECIBO DE HABERES';
}

function renderRecibo(doc, { liquidacion, emp, empresa, estudio, formatMoney, mesNombre, titulo, yOffset, altura }) {
  const x = 30;
  const w = 535;
  const anio = liquidacion.anio || liquidacion.periodo?.anio;
  const mes = liquidacion.mes || liquidacion.periodo?.mes;

  // Encabezado empresa
  doc.rect(x, yOffset, w, 55).fillAndStroke('#1e3a5f', '#1e3a5f');
  doc.fillColor('white').fontSize(13).font('Helvetica-Bold')
    .text(empresa.razonSocial, x + 10, yOffset + 8, { width: 350 });
  doc.fontSize(8).font('Helvetica')
    .text(`CUIT: ${empresa.cuit}`, x + 10, yOffset + 26)
    .text(`${empresa.domicilio || ''} - ${empresa.localidad || ''}`, x + 10, yOffset + 37)
    .text(`Convenio: ${empresa.convenio?.nombre || 'LCT 20.744'}`, x + 10, yOffset + 48);

  doc.fillColor('white').fontSize(13).font('Helvetica-Bold')
    .text(titulo, x + 360, yOffset + 10, { width: 165, align: 'right' });
  doc.fontSize(9).font('Helvetica')
    .text(`${mesNombre} ${anio}`, x + 360, yOffset + 28, { width: 165, align: 'right' });

  // Datos del empleado
  let y = yOffset + 60;
  doc.rect(x, y, w, 40).fillAndStroke('#f0f4f8', '#cccccc');
  doc.fillColor('#333').fontSize(8.5).font('Helvetica-Bold')
    .text('EMPLEADO:', x + 8, y + 5);
  doc.font('Helvetica')
    .text(`${emp.apellido}, ${emp.nombre}`, x + 75, y + 5)
    .text(`CUIL: ${emp.cuil}`, x + 8, y + 18)
    .text(`Legajo N°: ${emp.legajoNumero || '-'}`, x + 130, y + 18)
    .text(`Categoría: ${emp.categoria || '-'}`, x + 260, y + 18)
    .text(`Ingreso: ${dayjs(emp.fechaIngreso).format('DD/MM/YYYY')}`, x + 380, y + 18)
    .text(`Puesto: ${emp.puesto || '-'}`, x + 260, y + 5)
    .text(`Obra Social: ${emp.obraSocialNombre || '-'}`, x + 380, y + 5);

  // Tabla conceptos
  y += 45;
  const colDesc = x + 8;
  const colCant = x + 300;
  const colValUnit = x + 370;
  const colImporte = x + 450;

  // Encabezado tabla
  doc.rect(x, y, w, 14).fillAndStroke('#2d6a9f', '#2d6a9f');
  doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold')
    .text('CONCEPTO', colDesc, y + 3)
    .text('CANT.', colCant, y + 3, { width: 65, align: 'right' })
    .text('V. UNITARIO', colValUnit, y + 3, { width: 75, align: 'right' })
    .text('IMPORTE', colImporte, y + 3, { width: 80, align: 'right' });

  y += 14;
  const haberes = liquidacion.detalles.filter(d => d.naturaleza === 'HABER');
  const descuentos = liquidacion.detalles.filter(d => d.naturaleza === 'DESCUENTO');

  // Haberes
  doc.fillColor('#1a6b1a').fontSize(7).font('Helvetica-Bold')
    .text('HABERES', colDesc, y + 2);
  y += 12;

  for (const d of haberes) {
    doc.rect(x, y, w, 11).fillAndStroke(y % 22 === 0 ? '#f9f9f9' : 'white', '#eeeeee');
    doc.fillColor('#222').fontSize(7.5).font('Helvetica')
      .text(d.descripcion, colDesc, y + 2, { width: 285 })
      .text(d.cantidad ? String(d.cantidad) : '', colCant, y + 2, { width: 65, align: 'right' })
      .text(d.valorUnitario ? formatMoney(d.valorUnitario) : '', colValUnit, y + 2, { width: 75, align: 'right' })
      .text(formatMoney(Math.abs(Number(d.importe))), colImporte, y + 2, { width: 80, align: 'right' });
    y += 11;
  }

  // Descuentos
  y += 3;
  doc.fillColor('#8b1a1a').fontSize(7).font('Helvetica-Bold')
    .text('DESCUENTOS', colDesc, y + 2);
  y += 12;

  for (const d of descuentos) {
    doc.rect(x, y, w, 11).fillAndStroke(y % 22 === 0 ? '#fff8f8' : 'white', '#eeeeee');
    doc.fillColor('#222').fontSize(7.5).font('Helvetica')
      .text(d.descripcion, colDesc, y + 2, { width: 420 })
      .text(formatMoney(Math.abs(Number(d.importe))), colImporte, y + 2, { width: 80, align: 'right' });
    y += 11;
  }

  // Totales
  y += 5;
  doc.rect(x, y, w, 28).fillAndStroke('#e8f0e8', '#999');
  doc.fillColor('#333').fontSize(8.5).font('Helvetica-Bold')
    .text('TOTAL HABERES:', x + 8, y + 5)
    .text(formatMoney(liquidacion.totalHaberes), x + 100, y + 5)
    .text('TOTAL DESCUENTOS:', x + 200, y + 5)
    .text(formatMoney(liquidacion.totalDescuentos), x + 310, y + 5)
    .text('NETO A COBRAR:', x + 400, y + 5);

  doc.rect(x + 470, y, 95, 28).fillAndStroke('#1e3a5f', '#1e3a5f');
  doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
    .text(formatMoney(liquidacion.totalNeto), x + 472, y + 8, { width: 91, align: 'right' });

  // Aportes empleador
  y += 35;
  doc.fillColor('#555').fontSize(7).font('Helvetica')
    .text(`Contribuciones empleador: ${formatMoney(liquidacion.totalContribuciones)}  |  Costo total empleador: ${formatMoney(Number(liquidacion.totalHaberes) + Number(liquidacion.totalContribuciones))}`, x, y);

  // Firma
  y += 15;
  doc.moveTo(x + 60, y + 25).lineTo(x + 210, y + 25).stroke('#333');
  doc.moveTo(x + 340, y + 25).lineTo(x + 490, y + 25).stroke('#333');
  doc.fontSize(7).fillColor('#666')
    .text('Firma y aclaración empleado', x + 60, y + 27, { width: 150, align: 'center' })
    .text('Firma y sello empleador', x + 340, y + 27, { width: 150, align: 'center' });

  // Pie
  y += 38;
  doc.fontSize(6.5).fillColor('#999')
    .text(`Generado por Sistema Estudio Contable | ${dayjs().format('DD/MM/YYYY HH:mm')} | ${estudio?.razonSocial || ''}`, x, y, { width: w, align: 'center' });
}

module.exports = { generarRecibo };
