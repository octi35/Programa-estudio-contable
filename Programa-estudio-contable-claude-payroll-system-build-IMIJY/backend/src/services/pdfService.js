const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
require('dayjs/locale/es');
dayjs.locale('es');

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const fmtNum = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtARS = (n) => `$ ${fmtNum(n)}`;
const fmtInt = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// ── Palette ──────────────────────────────────────────────────────────────────
const BLUE   = '#4e7fbc';
const WHITE  = '#ffffff';
const GRAY   = '#888888';
const BLACK  = '#111111';
const SUB_BG = '#dce8f5';

// ── Cell helpers ─────────────────────────────────────────────────────────────
function tCell(doc, x, y, w, h, bg, border) {
  doc.rect(x, y, w, h).fillAndStroke(bg || WHITE, border || GRAY);
}

function tText(doc, text, x, y, w, h, opts) {
  const { size = 7.5, bold = false, align = 'left', color = BLACK } = opts || {};
  doc.fontSize(size)
     .font(bold ? 'Helvetica-Bold' : 'Helvetica')
     .fillColor(color)
     .text(String(text ?? ''), x + 3, y + 2.5, { width: w - 6, align, lineBreak: false });
}

// ── Unidad display ────────────────────────────────────────────────────────────
function formatUnidad(d) {
  const u = d.concepto?.unidad;
  const cant = d.cantidad != null ? Number(d.cantidad) : null;
  const vu   = d.valorUnitario != null ? Number(d.valorUnitario) : null;
  if (u === 'DIAS'      && cant != null) return `${fmtInt(cant)} ds.`;
  if (u === 'HORAS'     && cant != null) return `${fmtInt(cant)} hs`;
  if (u === 'PORCENTAJE' && vu  != null) return `${fmtInt(vu)} %`;
  if (u === 'CANTIDAD'  && cant != null) return fmtInt(cant);
  if (cant != null && cant !== 0)        return fmtInt(cant);
  return '';
}

// ── Número a letras ───────────────────────────────────────────────────────────
function numeroALetras(n) {
  const num = Math.round(Number(n || 0));
  if (num === 0) return 'cero';
  const unis = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
    'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve',
    'veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
  function dec(n) {
    if (n < 30) return unis[n];
    const t = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
    const d = Math.floor(n / 10), u = n % 10;
    return u === 0 ? t[d] : t[d] + ' y ' + unis[u];
  }
  function cen(n) {
    if (n === 0) return '';
    if (n < 100) return dec(n);
    if (n === 100) return 'cien';
    const c = Math.floor(n / 100), r = n % 100;
    const cl = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
    return r === 0 ? cl[c] : cl[c] + ' ' + dec(r);
  }
  function mil(n) {
    if (n < 1000) return cen(n);
    const m = Math.floor(n / 1000), r = n % 1000;
    const p = m === 1 ? 'mil' : cen(m) + ' mil';
    return r === 0 ? p : p + ' ' + cen(r);
  }
  function millon(n) {
    if (n < 1_000_000) return mil(n);
    const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
    const p = m === 1 ? 'un millón' : mil(m) + ' millones';
    return r === 0 ? p : p + ' ' + mil(r);
  }
  return millon(num);
}

// ── Upload resolver ───────────────────────────────────────────────────────────
function resolveUpload(filename) {
  if (!filename) return null;
  const fp = path.isAbsolute(filename) ? filename : path.join(process.cwd(), 'uploads', filename);
  return fs.existsSync(fp) ? fp : null;
}

// ── Main generator ────────────────────────────────────────────────────────────
async function generarRecibo(liquidacion) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 30, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const emp     = liquidacion.empleado;
      const empresa = emp.empresa;
      const estudio = empresa.estudio;
      const mes     = liquidacion.mes || liquidacion.periodo?.mes;

      renderRecibo(doc, { liquidacion, emp, empresa, estudio, mesNombre: MESES[mes - 1] });

      if (empresa.reciboMostrarDuplicado !== false) {
        doc.addPage();
        renderRecibo(doc, { liquidacion, emp, empresa, estudio, mesNombre: MESES[mes - 1], isDuplicado: true });
      }

      doc.end();
    } catch (err) { reject(err); }
  });
}

async function generarRecibosBulk(liquidaciones) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 30, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (let i = 0; i < liquidaciones.length; i++) {
        if (i > 0) doc.addPage();
        const liq     = liquidaciones[i];
        const emp     = liq.empleado;
        const empresa = emp.empresa;
        const estudio = empresa.estudio;
        const mes     = liq.mes || liq.periodo?.mes;
        const mesNombre = MESES[mes - 1];

        renderRecibo(doc, { liquidacion: liq, emp, empresa, estudio, mesNombre });

        if (empresa.reciboMostrarDuplicado !== false) {
          doc.addPage();
          renderRecibo(doc, { liquidacion: liq, emp, empresa, estudio, mesNombre, isDuplicado: true });
        }
      }
      doc.end();
    } catch (err) { reject(err); }
  });
}

// ── Render one receipt (full A4 page) ─────────────────────────────────────────
function renderRecibo(doc, { liquidacion, emp, empresa, estudio, mesNombre, isDuplicado = false }) {
  const x = 30, w = 535;
  const anio = liquidacion.anio || liquidacion.periodo?.anio;
  const mes  = liquidacion.mes  || liquidacion.periodo?.mes;

  // Row heights
  const TH = 13; // header
  const TD = 13; // data
  const TR = 10; // concept row

  let y = 30;

  // ── Duplicado label ──────────────────────────────────────────────────────────
  if (isDuplicado) {
    doc.fontSize(7.5).font('Helvetica').fillColor('#888')
       .text('DUPLICADO — COPIA DEL EMPLEADO', x, y, { width: w, align: 'right', lineBreak: false });
    y += 11;
  }

  // ── 1. Encabezado empresa ────────────────────────────────────────────────────
  const logoPath = resolveUpload(empresa.logo);
  let textX = x;
  if (logoPath) {
    try { doc.image(logoPath, x, y, { height: 36, fit: [55, 36] }); textX = x + 62; } catch (_) {}
  }

  doc.fontSize(16).font('Helvetica-Bold').fillColor(BLACK)
     .text(empresa.razonSocial || '', textX, y, { lineBreak: false });
  y += 20;

  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLACK)
     .text('Dirección:', textX, y, { continued: true })
     .font('Helvetica').text(`  ${empresa.domicilio || ''}`);
  y += 11;

  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLACK)
     .text('Localidad: ', textX, y, { continued: true })
     .font('Helvetica').text(empresa.localidad || empresa.provincia || '', { continued: true })
     .font('Helvetica-Bold').text('       C.U.I.T: ', { continued: true })
     .font('Helvetica').text(empresa.cuit || '');
  y += 14;

  // ── 2. Tabla empleado ────────────────────────────────────────────────────────
  // Col widths
  const CW1 = 285, CW2 = 100, CW3 = 150;

  // Header row 1
  tCell(doc, x,           y, CW1,       TH, BLUE, GRAY);
  tText(doc, 'Apellido y Nombres',  x,           y, CW1,       TH, { size: 7, bold: true, color: WHITE });
  tCell(doc, x + CW1,     y, CW2,       TH, BLUE, GRAY);
  tText(doc, 'Legajo Nº',           x + CW1,     y, CW2,       TH, { size: 7, bold: true, color: WHITE });
  tCell(doc, x + CW1+CW2, y, CW3,       TH, BLUE, GRAY);
  tText(doc, 'C.U.I.L.',            x + CW1+CW2, y, CW3,       TH, { size: 7, bold: true, color: WHITE });
  y += TH;

  // Data row 1
  tCell(doc, x,           y, CW1, TD, WHITE, GRAY);
  tText(doc, `${emp.apellido || ''} ${emp.nombre || ''}`, x, y, CW1, TD, { size: 8 });
  tCell(doc, x + CW1,     y, CW2, TD, WHITE, GRAY);
  tText(doc, emp.legajoNumero || '', x + CW1, y, CW2, TD, { size: 8 });
  tCell(doc, x + CW1+CW2, y, CW3, TD, WHITE, GRAY);
  tText(doc, emp.cuil || '', x + CW1+CW2, y, CW3, TD, { size: 8 });
  y += TD;

  // Header row 2
  tCell(doc, x,       y, CW1,       TH, BLUE, GRAY);
  tText(doc, 'Convenio',  x,       y, CW1,       TH, { size: 7, bold: true, color: WHITE });
  tCell(doc, x + CW1, y, CW2 + CW3, TH, BLUE, GRAY);
  tText(doc, 'Categoría', x + CW1, y, CW2 + CW3, TH, { size: 7, bold: true, color: WHITE });
  y += TH;

  // Data row 2
  const convenioNombre = emp.convenio?.nombre || empresa.convenio?.nombre || 'LCT 20.744';
  tCell(doc, x,       y, CW1,       TD, WHITE, GRAY);
  tText(doc, convenioNombre, x, y, CW1, TD, { size: 7.5 });
  tCell(doc, x + CW1, y, CW2 + CW3, TD, WHITE, GRAY);
  tText(doc, emp.categoria || '', x + CW1, y, CW2 + CW3, TD, { size: 7.5 });
  y += TD;

  // ── 3. Fila fechas / sueldo ──────────────────────────────────────────────────
  const DW = Math.floor(w / 6); // ~89
  const dateX = [x, x+DW, x+DW*2, x+DW*3, x+DW*4, x+DW*5];
  const dateW = [DW, DW, DW, DW, DW, w - DW*5];

  const dateLabels = ['Fecha de Ingreso','Ant. reconocida','Fecha de Egreso','Sueldo/Jornal','Período Abonado','Fecha de Pago'];
  dateLabels.forEach((lbl, i) => {
    tCell(doc, dateX[i], y, dateW[i], TH, BLUE, GRAY);
    tText(doc, lbl, dateX[i], y, dateW[i], TH, { size: 6.5, bold: true, color: WHITE });
  });
  y += TH;

  const basico = Number(emp.basicoMensual) > 0 ? emp.basicoMensual : liquidacion.totalHaberes;
  const periodoStr = `${String(mes).padStart(2,'0')}/${anio}`;
  const fechaPago  = liquidacion.updatedAt ? dayjs(liquidacion.updatedAt).format('DD/MM/YYYY') : '';

  const dateValues = [
    emp.fechaIngreso ? dayjs(emp.fechaIngreso).format('DD/MM/YYYY') : '',
    '',
    emp.fechaEgreso  ? dayjs(emp.fechaEgreso).format('DD/MM/YYYY')  : '',
    fmtNum(basico),
    periodoStr,
    fechaPago,
  ];
  dateValues.forEach((val, i) => {
    tCell(doc, dateX[i], y, dateW[i], TD, WHITE, GRAY);
    tText(doc, val, dateX[i], y, dateW[i], TD, { size: 7.5 });
  });
  y += TD + 3;

  // ── 4. Tabla de conceptos ────────────────────────────────────────────────────
  // Column x-positions and widths
  const CC = { codigo: { x, w: 42 }, concepto: { x: x+42, w: 205 }, unidad: { x: x+247, w: 58 },
               rem:    { x: x+305, w: 78 }, norem: { x: x+383, w: 78 }, desc: { x: x+461, w: 74 } };

  const concHeaders = [
    ['Código',          CC.codigo,  'left'],
    ['Concepto',        CC.concepto,'left'],
    ['Unidad',          CC.unidad,  'left'],
    ['Remunerativo',    CC.rem,     'right'],
    ['No Remunerativo', CC.norem,   'right'],
    ['Descuento',       CC.desc,    'right'],
  ];
  concHeaders.forEach(([lbl, col, align]) => {
    tCell(doc, col.x, y, col.w, TH, BLUE, GRAY);
    tText(doc, lbl, col.x, y, col.w, TH, { size: 6.5, bold: true, color: WHITE, align });
  });
  y += TH;

  const detalles      = (liquidacion.detalles || []).filter(d => d.tipo !== 'APORTE_EMPLEADOR' && d.naturaleza !== 'INFORMATIVO');
  const contribuciones = (liquidacion.detalles || []).filter(d => d.tipo === 'APORTE_EMPLEADOR' || d.naturaleza === 'INFORMATIVO');

  let sumRem = 0, sumNoRem = 0, sumDesc = 0;

  for (const d of detalles) {
    const imp = Math.abs(Number(d.importe));
    let vRem = '', vNoRem = '', vDesc = '';

    if (d.naturaleza === 'HABER' && (d.tipo === 'NO_REMUNERATIVO' || d.remunerativo === false)) {
      vNoRem = fmtNum(imp); sumNoRem += imp;
    } else if (d.naturaleza === 'HABER') {
      vRem = fmtNum(imp); sumRem += imp;
    } else if (d.naturaleza === 'DESCUENTO') {
      vDesc = fmtNum(imp); sumDesc += imp;
    }

    tCell(doc, CC.codigo.x,   y, CC.codigo.w,   TR, WHITE, GRAY);
    tText(doc, d.concepto?.codigo || '', CC.codigo.x, y, CC.codigo.w, TR, { size: 7 });
    tCell(doc, CC.concepto.x, y, CC.concepto.w, TR, WHITE, GRAY);
    tText(doc, d.descripcion || '', CC.concepto.x, y, CC.concepto.w, TR, { size: 7 });
    tCell(doc, CC.unidad.x,   y, CC.unidad.w,   TR, WHITE, GRAY);
    tText(doc, formatUnidad(d), CC.unidad.x, y, CC.unidad.w, TR, { size: 7 });
    tCell(doc, CC.rem.x,      y, CC.rem.w,      TR, WHITE, GRAY);
    tText(doc, vRem,   CC.rem.x,   y, CC.rem.w,   TR, { size: 7, align: 'right' });
    tCell(doc, CC.norem.x,    y, CC.norem.w,    TR, WHITE, GRAY);
    tText(doc, vNoRem, CC.norem.x, y, CC.norem.w, TR, { size: 7, align: 'right' });
    tCell(doc, CC.desc.x,     y, CC.desc.w,     TR, WHITE, GRAY);
    tText(doc, vDesc,  CC.desc.x,  y, CC.desc.w,  TR, { size: 7, align: 'right' });
    y += TR;
  }

  // SUBTOTALES
  const subH = 14;
  const labelW = CC.codigo.w + CC.concepto.w + CC.unidad.w;
  tCell(doc, x,         y, labelW, subH, SUB_BG, GRAY);
  tText(doc, 'SUBTOTALES', x, y, labelW, subH, { size: 7.5, bold: true });
  tCell(doc, CC.rem.x,   y, CC.rem.w,   subH, SUB_BG, GRAY);
  tText(doc, fmtNum(sumRem),   CC.rem.x,   y, CC.rem.w,   subH, { size: 7.5, bold: true, align: 'right' });
  tCell(doc, CC.norem.x, y, CC.norem.w, subH, SUB_BG, GRAY);
  tText(doc, fmtNum(sumNoRem), CC.norem.x, y, CC.norem.w, subH, { size: 7.5, bold: true, align: 'right' });
  tCell(doc, CC.desc.x,  y, CC.desc.w,  subH, SUB_BG, GRAY);
  tText(doc, fmtNum(sumDesc),  CC.desc.x,  y, CC.desc.w,  subH, { size: 7.5, bold: true, align: 'right' });
  y += subH + 3;

  // ── 5. Neto a percibir ───────────────────────────────────────────────────────
  const leftW  = 195;
  const rightW = w - leftW;
  const rowH   = 13;

  tCell(doc, x,         y, leftW,  rowH, WHITE,  GRAY);
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(BLACK)
     .text('Importe acreditado en:', x + 3, y + 2.5, { continued: true })
     .font('Helvetica').text('  Cuenta Sueldo', { lineBreak: false });
  tCell(doc, x + leftW, y, rightW, rowH, SUB_BG, GRAY);
  tText(doc, 'NETO A PERCIBIR', x + leftW, y, rightW, rowH, { size: 7, bold: true, align: 'right' });
  y += rowH;

  tCell(doc, x,         y, leftW,  rowH, WHITE,  GRAY);
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(BLACK)
     .text('Banco :', x + 3, y + 2.5, { continued: true })
     .font('Helvetica').text(`  ${emp.banco || ''}`, { lineBreak: false });
  tCell(doc, x + leftW, y, rightW, rowH, SUB_BG, GRAY);
  tText(doc, fmtNum(liquidacion.totalNeto), x + leftW, y, rightW, rowH, { size: 9, bold: true, align: 'right' });
  y += rowH + 2;

  // ── 6. Importe en letras ──────────────────────────────────────────────────────
  tCell(doc, x, y, w, rowH, WHITE, GRAY);
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(BLACK)
     .text('Importe Neto en letras: ', x + 3, y + 2.5, { continued: true })
     .font('Helvetica').text(numeroALetras(liquidacion.totalNeto), { lineBreak: false });
  y += rowH + 3;

  // ── 7. Info inferior ──────────────────────────────────────────────────────────
  const halfW = Math.floor(w / 2);

  tCell(doc, x,         y, halfW,      TH, WHITE, GRAY);
  tText(doc, 'Antigüedad reconocida:', x, y, halfW, TH, { size: 7, bold: true });
  tCell(doc, x + halfW, y, w - halfW,  TH, WHITE, GRAY);
  tText(doc, 'Aportes y Retenciones depositados en:', x + halfW, y, w - halfW, TH, { size: 7, bold: true });
  y += TH;

  tCell(doc, x,         y, halfW,     TD, WHITE, GRAY);
  tText(doc, '', x, y, halfW, TD, { size: 7.5 });
  tCell(doc, x + halfW, y, w - halfW, TD, WHITE, GRAY);
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(BLACK)
     .text('BANCO: ', x + halfW + 3, y + 2.5, { continued: true })
     .font('Helvetica').text(emp.banco || '', { continued: true })
     .font('Helvetica-Bold').text('       PERIODO: ', { continued: true })
     .font('Helvetica').text(`${mesNombre} ${anio}`, { lineBreak: false });
  y += TD + 4;

  // ── 8. Contribuciones empleador ──────────────────────────────────────────────
  if (contribuciones.length > 0) {
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(BLACK)
       .text('Contribuciones y conceptos a cargo del empleador (conceptos meramente enunciativos):', x, y, { width: w });
    y += 12;

    const CT = { codigo: { x, w: 42 }, concepto: { x: x+42, w: 255 },
                 alicuota: { x: x+297, w: 80 }, base: { x: x+377, w: 78 }, monto: { x: x+455, w: 80 } };

    [['Código', CT.codigo, 'left'], ['Concepto', CT.concepto, 'left'],
     ['Alícuota', CT.alicuota, 'right'], ['Base', CT.base, 'right'], ['Monto', CT.monto, 'right']
    ].forEach(([lbl, col, align]) => {
      tCell(doc, col.x, y, col.w, TH, BLUE, GRAY);
      tText(doc, lbl, col.x, y, col.w, TH, { size: 6.5, bold: true, color: WHITE, align });
    });
    y += TH;

    for (const d of contribuciones) {
      const imp = Math.abs(Number(d.importe));
      tCell(doc, CT.codigo.x,    y, CT.codigo.w,    TR, WHITE, GRAY);
      tText(doc, d.concepto?.codigo || '', CT.codigo.x, y, CT.codigo.w, TR, { size: 7 });
      tCell(doc, CT.concepto.x,  y, CT.concepto.w,  TR, WHITE, GRAY);
      tText(doc, d.descripcion || '', CT.concepto.x, y, CT.concepto.w, TR, { size: 7 });
      tCell(doc, CT.alicuota.x,  y, CT.alicuota.w,  TR, WHITE, GRAY);
      tText(doc, '', CT.alicuota.x, y, CT.alicuota.w, TR);
      tCell(doc, CT.base.x,      y, CT.base.w,      TR, WHITE, GRAY);
      tText(doc, '', CT.base.x, y, CT.base.w, TR);
      tCell(doc, CT.monto.x,     y, CT.monto.w,     TR, WHITE, GRAY);
      tText(doc, fmtNum(imp), CT.monto.x, y, CT.monto.w, TR, { size: 7, align: 'right' });
      y += TR;
    }
  }

  // ── 9. Firma del empleado ────────────────────────────────────────────────────
  y += 8;
  const firmaPath = resolveUpload(empresa.reciboFirma);
  if (firmaPath) {
    try { doc.image(firmaPath, x + w - 160, y - 4, { width: 160, height: 28, fit: [160, 28] }); } catch (_) {}
  }
  doc.moveTo(x + w - 160, y + 18).lineTo(x + w, y + 18).stroke('#555555');
  doc.fontSize(6.5).fillColor('#666666').font('Helvetica')
     .text('Firma del empleado', x + w - 160, y + 20, { width: 160, align: 'center', lineBreak: false });
}

// ── Comprobante electrónico ───────────────────────────────────────────────────
async function generarComprobanteElectronico(comp, tipoDesc) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const x = 40, w = 515;
      const empresa = comp.empresa;
      const estudio = empresa?.estudio;

      doc.rect(x, 40, w, 70).fillAndStroke('#1e3a5f', '#1e3a5f');
      doc.fillColor('white').fontSize(14).font('Helvetica-Bold')
        .text(empresa?.razonSocial || 'Emisor', x + 12, 50, { width: 280 });
      doc.fontSize(8).font('Helvetica')
        .text(`CUIT: ${empresa?.cuit || '—'}`, x + 12, 68)
        .text(`${empresa?.domicilio || ''} — ${empresa?.localidad || ''}`, x + 12, 78)
        .text(estudio?.razonSocial || '', x + 12, 88);

      doc.rect(x + 330, 40, 185, 70).fillAndStroke('#f0f4f8', '#1e3a5f');
      doc.fillColor('#1e3a5f').fontSize(13).font('Helvetica-Bold')
        .text(tipoDesc || 'Factura', x + 335, 48, { width: 175, align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor('#333')
        .text(`N°: ${String(comp.ptoVta).padStart(4,'0')}-${String(comp.nroComprobante).padStart(8,'0')}`, x + 335, 70, { width: 175, align: 'center' })
        .text(`Fecha: ${dayjs(comp.fechaEmision).format('DD/MM/YYYY')}`, x + 335, 84, { width: 175, align: 'center' });

      let y = 125;
      doc.rect(x, y, w, 22).fillAndStroke('#fff3cd', '#ffc107');
      doc.fillColor('#856404').fontSize(8).font('Helvetica-Bold')
        .text(`CAE: ${comp.cae}`, x + 8, y + 7)
        .text(`Vto. CAE: ${comp.caeFchVto ? comp.caeFchVto.replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1') : '—'}`, x + 250, y + 7)
        .text(comp.simulado ? '⚠ MODO SIMULADO — NO VÁLIDO ANTE AFIP' : '✓ CAE Válido AFIP', x + 370, y + 7);

      y += 32;
      doc.fillColor('#333').fontSize(9).font('Helvetica-Bold').text('Receptor:', x, y);
      doc.font('Helvetica').fontSize(8.5)
        .text(`${comp.receptorRazonSocial || 'Consumidor Final'}`, x + 65, y)
        .text(`CUIT/DNI: ${comp.receptorCuit || '—'}`, x + 65, y + 14)
        .text(`Domicilio: ${comp.receptorDomicilio || '—'}`, x + 65, y + 27);

      y += 52;
      doc.rect(x, y, w, 16).fillAndStroke('#2d5f9f', '#2d5f9f');
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
        .text('Descripción', x + 8, y + 4, { width: 240 })
        .text('Cant.', x + 255, y + 4, { width: 50, align: 'right' })
        .text('P. Unit.', x + 310, y + 4, { width: 80, align: 'right' })
        .text('% IVA', x + 395, y + 4, { width: 45, align: 'right' })
        .text('Total', x + 445, y + 4, { width: 65, align: 'right' });
      y += 16;

      const detalles = comp.detalles || [];
      for (let i = 0; i < detalles.length; i++) {
        const d = detalles[i];
        doc.rect(x, y, w, 14).fillAndStroke(i % 2 === 0 ? '#f5f8ff' : 'white', '#ddd');
        doc.fillColor('#222').fontSize(8).font('Helvetica')
          .text(d.descripcion, x + 8, y + 3, { width: 240 })
          .text(String(d.cantidad), x + 255, y + 3, { width: 50, align: 'right' })
          .text(fmtARS(d.precioUnit), x + 310, y + 3, { width: 80, align: 'right' })
          .text(`${d.alicuotaIva}%`, x + 395, y + 3, { width: 45, align: 'right' })
          .text(fmtARS(d.subtotal), x + 445, y + 3, { width: 65, align: 'right' });
        y += 14;
      }

      y += 10;
      const totRow = (label, val, bold = false) => {
        doc.fillColor(bold ? '#1e3a5f' : '#444').fontSize(bold ? 10 : 8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(label, x + 300, y, { width: 150 })
          .text(fmtARS(val), x + 455, y, { width: 55, align: 'right' });
        y += bold ? 16 : 14;
      };
      totRow('Subtotal Neto:', comp.neto);
      totRow('IVA:', comp.iva);
      doc.moveTo(x + 300, y).lineTo(x + w, y).stroke('#ccc');
      y += 4;
      totRow('TOTAL:', comp.total, true);

      const qrData = `${comp.cae}|${comp.nroComprobante}|${comp.total}`;
      try {
        const qrBuf = await QRCode.toBuffer(qrData, { width: 80, margin: 1 });
        doc.image(qrBuf, x, y + 10, { width: 70, height: 70 });
      } catch (_) {}

      doc.fontSize(7).fillColor('#aaa')
        .text(`EstudioPRO — ${dayjs().format('DD/MM/YYYY HH:mm')}`, x, 780, { width: w, align: 'center' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

// ── Presupuesto ───────────────────────────────────────────────────────────────
async function generarPresupuestoPDF(presupuesto) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const x = 40, w = 515;
      const empresa = presupuesto.empresa;

      doc.rect(x, 40, w, 60).fillAndStroke('#1e3a5f', '#1e3a5f');
      doc.fillColor('white').fontSize(14).font('Helvetica-Bold')
        .text(empresa?.razonSocial || 'Empresa', x + 12, 50, { width: 300 });
      doc.fontSize(8).font('Helvetica')
        .text(`CUIT: ${empresa?.cuit || '—'}`, x + 12, 68)
        .text(`${empresa?.domicilio || ''} — ${empresa?.localidad || ''}`, x + 12, 80);
      doc.fontSize(13).font('Helvetica-Bold')
        .text(`PRESUPUESTO ${presupuesto.anio}`, x + 320, 55, { width: 195, align: 'right' });
      doc.fontSize(8).font('Helvetica')
        .text(`Generado: ${dayjs().format('DD/MM/YYYY')}`, x + 320, 76, { width: 195, align: 'right' });

      let y = 120;
      const MESES_ABREV = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const colCta = x + 8, colMeses = x + 200, colWidth = 27, colTotal = x + w - 70;

      doc.rect(x, y, w, 16).fillAndStroke('#2d5f9f', '#2d5f9f');
      doc.fillColor('white').fontSize(6.5).font('Helvetica-Bold')
        .text('Cuenta', colCta, y + 4, { width: 185 });
      MESES_ABREV.forEach((m, i) => {
        doc.text(m, colMeses + i * colWidth, y + 4, { width: colWidth, align: 'right' });
      });
      doc.text('TOTAL', colTotal, y + 4, { width: 65, align: 'right' });
      y += 16;

      const items = presupuesto.items || [];
      const grupos = {};
      items.forEach(it => { grupos[it.tipo] = grupos[it.tipo] || []; grupos[it.tipo].push(it); });

      for (const [tipo, its] of Object.entries(grupos)) {
        doc.rect(x, y, w, 13).fillAndStroke('#e8f0e8', '#ccc');
        doc.fillColor('#1e3a5f').fontSize(7.5).font('Helvetica-Bold').text(tipo, colCta, y + 3, { width: 185 });
        y += 13;

        let sumaGrupo = Array(12).fill(0);
        for (const it of its) {
          const meses = it.meses || Array(12).fill(0);
          const total = meses.reduce((s, v) => s + Number(v || 0), 0);
          doc.rect(x, y, w, 11).fillAndStroke(y % 22 === 0 ? '#f8f9fb' : 'white', '#e0e0e0');
          doc.fillColor('#333').fontSize(6.5).font('Helvetica').text(it.cuentaNombre || it.descripcion || '—', colCta, y + 2, { width: 185 });
          meses.forEach((v, i) => {
            doc.text(v ? `$${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—', colMeses + i * colWidth, y + 2, { width: colWidth, align: 'right' });
            sumaGrupo[i] += Number(v || 0);
          });
          doc.font('Helvetica-Bold').text(fmtARS(total), colTotal, y + 2, { width: 65, align: 'right' });
          y += 11;
        }

        const totalGrupo = sumaGrupo.reduce((s, v) => s + v, 0);
        doc.rect(x, y, w, 12).fillAndStroke('#d0e8d0', '#bbb');
        doc.fillColor('#1a6b1a').fontSize(7).font('Helvetica-Bold').text(`Total ${tipo}:`, colCta, y + 2, { width: 185 });
        sumaGrupo.forEach((v, i) => {
          doc.text(v ? `$${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—', colMeses + i * colWidth, y + 2, { width: colWidth, align: 'right' });
        });
        doc.text(fmtARS(totalGrupo), colTotal, y + 2, { width: 65, align: 'right' });
        y += 16;
        if (y > 760) { doc.addPage(); y = 40; }
      }

      doc.fontSize(7).fillColor('#aaa')
        .text(`EstudioPRO — ${dayjs().format('DD/MM/YYYY HH:mm')}`, x, 790, { width: w, align: 'center' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { generarRecibo, generarRecibosBulk, generarComprobanteElectronico, generarPresupuestoPDF };
