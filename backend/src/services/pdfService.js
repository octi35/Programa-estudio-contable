const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
require('dayjs/locale/es');
dayjs.locale('es');

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const fmtARS = (n) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DEFAULT_RECIBO_COLOR = '#1e3a5f';

function resolveUpload(filename) {
  if (!filename) return null;
  const fp = path.isAbsolute(filename) ? filename : path.join(process.cwd(), 'uploads', filename);
  if (fs.existsSync(fp)) return fp;
  return null;
}

function getReciboConfig(empresa, estudio) {
  const color = empresa.reciboColor || DEFAULT_RECIBO_COLOR;
  const layout = (empresa.reciboLayout || 'CLASICO').toUpperCase();
  const mostrarQR = empresa.reciboMostrarQR !== false;
  const mostrarDuplicado = empresa.reciboMostrarDuplicado !== false;

  const logoPath = resolveUpload(empresa.logo) || resolveUpload(estudio?.logo);
  const firmaPath = resolveUpload(empresa.reciboFirma);

  return { color, layout, mostrarQR, mostrarDuplicado, logoPath, firmaPath };
}

async function generarRecibo(liquidacion) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 30, bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const emp = liquidacion.empleado;
      const empresa = emp.empresa;
      const estudio = empresa.estudio;
      const anio = liquidacion.anio || liquidacion.periodo?.anio;
      const mes = liquidacion.mes || liquidacion.periodo?.mes;
      const mesNombre = MESES[mes - 1];
      const titulo = getTituloRecibo(liquidacion.tipo);

      const config = getReciboConfig(empresa, estudio);
      const qrData = `CUIT:${empresa.cuit}|CUIL:${emp.cuil}|Per:${anio}${String(mes).padStart(2,'0')}|Neto:${liquidacion.totalNeto}|Tipo:${liquidacion.tipo}`;
      let qrBuf = null;
      if (config.mostrarQR) {
        try { qrBuf = await QRCode.toBuffer(qrData, { width: 90, margin: 1, color: { dark: config.color, light: '#ffffff' } }); } catch (_) {}
      }

      renderRecibo(doc, { liquidacion, emp, empresa, estudio, mesNombre, titulo, yOffset: 30, qrBuf, config });
      if (config.mostrarDuplicado) {
        doc.moveTo(30, 418).lineTo(565, 418).dash(3, { space: 3 }).stroke('#aaa').undash();
        doc.fontSize(7).fillColor('#999').text('✂  DUPLICADO — EMPLEADO CONSERVA ESTE TALÓN', 30, 421, { width: 535, align: 'center' });
        renderRecibo(doc, { liquidacion, emp, empresa, estudio, mesNombre, titulo, yOffset: 438, qrBuf, config });
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
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (let i = 0; i < liquidaciones.length; i++) {
        if (i > 0) doc.addPage();
        const liq = liquidaciones[i];
        const emp = liq.empleado;
        const empresa = emp.empresa;
        const estudio = empresa.estudio;
        const anio = liq.anio || liq.periodo?.anio;
        const mes = liq.mes || liq.periodo?.mes;
        const mesNombre = MESES[mes - 1];
        const titulo = getTituloRecibo(liq.tipo);

        const config = getReciboConfig(empresa, estudio);
        const qrData = `CUIT:${empresa.cuit}|CUIL:${emp.cuil}|Per:${anio}${String(mes).padStart(2,'0')}|Neto:${liq.totalNeto}`;
        let qrBuf = null;
        if (config.mostrarQR) {
          try { qrBuf = await QRCode.toBuffer(qrData, { width: 90, margin: 1, color: { dark: config.color, light: '#ffffff' } }); } catch (_) {}
        }

        renderRecibo(doc, { liquidacion: liq, emp, empresa, estudio, mesNombre, titulo, yOffset: 30, qrBuf, config });
        if (config.mostrarDuplicado) {
          doc.moveTo(30, 418).lineTo(565, 418).dash(3, { space: 3 }).stroke('#aaa').undash();
          doc.fontSize(7).fillColor('#999').text('✂  DUPLICADO — EMPLEADO CONSERVA ESTE TALÓN', 30, 421, { width: 535, align: 'center' });
          renderRecibo(doc, { liquidacion: liq, emp, empresa, estudio, mesNombre, titulo, yOffset: 438, qrBuf, config });
        }
      }
      doc.end();
    } catch (err) { reject(err); }
  });
}

function getTituloRecibo(tipo) {
  const t = { MENSUAL: 'RECIBO DE HABERES', SAC_JUNIO: 'RECIBO DE SAC — 1° SEMESTRE', SAC_DICIEMBRE: 'RECIBO DE SAC — 2° SEMESTRE', VACACIONES: 'RECIBO DE VACACIONES', LIQUIDACION_FINAL: 'LIQUIDACIÓN FINAL', COMPLEMENTO: 'RECIBO COMPLEMENTARIO', ANTICIPO: 'RECIBO DE ANTICIPO' };
  return t[tipo] || 'RECIBO DE HABERES';
}

function renderRecibo(doc, { liquidacion, emp, empresa, estudio, mesNombre, titulo, yOffset, qrBuf, config }) {
  const x = 30, w = 535;
  const anio = liquidacion.anio || liquidacion.periodo?.anio;
  const mes = liquidacion.mes || liquidacion.periodo?.mes;
  const theme = config || getReciboConfig(empresa, estudio);
  const isMinimal = theme.layout === 'MINIMAL';
  const headerBg = isMinimal ? '#ffffff' : theme.color;
  const headerBorder = isMinimal ? '#e5e7eb' : theme.color;
  const headerText = isMinimal ? theme.color : 'white';
  const tableHeadBg = isMinimal ? '#f3f4f6' : '#2d5f9f';
  const tableHeadText = isMinimal ? '#1f2937' : 'white';
  const totalsBg = isMinimal ? '#eef2f7' : '#e6eef6';

  // Header
  doc.rect(x, yOffset, w, 58).fillAndStroke(headerBg, headerBorder);
  if (isMinimal) {
    doc.rect(x, yOffset, w, 3).fill(theme.color);
  }

  let textX = x + 10;
  if (theme.logoPath) {
    try { doc.image(theme.logoPath, x + 8, yOffset + 8, { height: 38, fit: [55, 38] }); textX = x + 70; } catch (_) {}
  }

  doc.fillColor(headerText).fontSize(12).font('Helvetica-Bold')
    .text(empresa.razonSocial, textX, yOffset + 6, { width: 290 });
  doc.fontSize(7.5).font('Helvetica')
    .text(`CUIT: ${empresa.cuit}`, textX, yOffset + 23)
    .text(`${empresa.domicilio || ''} — ${empresa.localidad || empresa.provincia || ''}`, textX, yOffset + 33)
    .text(`Convenio: ${empresa.convenio?.nombre || 'LCT 20.744'}  |  CCT: ${empresa.convenio?.numeroCCT || '—'}`, textX, yOffset + 43);

  // Right side — title + QR
  const rightX = x + w - 105;
  doc.fillColor(headerText).fontSize(11).font('Helvetica-Bold')
    .text(titulo, rightX, yOffset + 6, { width: 100, align: 'right' });
  doc.fontSize(8.5).font('Helvetica')
    .text(`${mesNombre} ${anio}`, rightX, yOffset + 22, { width: 100, align: 'right' });
  if (qrBuf) {
    try { doc.image(qrBuf, x + w - 52, yOffset + 4, { width: 48, height: 48 }); } catch (_) {}
  }

  // Employee bar
  let y = yOffset + 63;
  doc.rect(x, y, w, 44).fillAndStroke('#f0f4f8', '#cccccc');
  doc.fillColor(theme.color).fontSize(7.5).font('Helvetica-Bold')
    .text(`${emp.apellido?.toUpperCase()}, ${emp.nombre}`, x + 8, y + 5, { width: 310 });
  doc.fillColor('#444').fontSize(7.2).font('Helvetica')
    .text(`CUIL: ${emp.cuil}`, x + 8, y + 18)
    .text(`Legajo: ${emp.legajoNumero || '—'}`, x + 120, y + 18)
    .text(`Cat.: ${emp.categoria || '—'}`, x + 230, y + 18)
    .text(`Ingreso: ${dayjs(emp.fechaIngreso).format('DD/MM/YYYY')}`, x + 320, y + 18)
    .text(`Puesto: ${emp.puesto || '—'}`, x + 8, y + 30)
    .text(`Obra Social: ${emp.obraSocialNombre || '—'}`, x + 180, y + 30)
    .text(`CBU: ${emp.cbu || '—'}`, x + 360, y + 30);

  // Concepts table
  y += 49;
  const cols = { desc: x + 8, cant: x + 302, vunit: x + 372, imp: x + 452 };

  doc.rect(x, y, w, 13).fillAndStroke(tableHeadBg, tableHeadBg);
  doc.fillColor(tableHeadText).fontSize(7).font('Helvetica-Bold')
    .text('CONCEPTO', cols.desc, y + 3)
    .text('CANT.', cols.cant, y + 3, { width: 64, align: 'right' })
    .text('V. UNITARIO', cols.vunit, y + 3, { width: 74, align: 'right' })
    .text('IMPORTE', cols.imp, y + 3, { width: 78, align: 'right' });
  y += 13;

  const haberes = (liquidacion.detalles || []).filter(d => d.naturaleza === 'HABER');
  const descuentos = (liquidacion.detalles || []).filter(d => d.naturaleza === 'DESCUENTO');
  const maxLines = 14;
  let linesUsed = 0;

  doc.fillColor('#1a6b1a').fontSize(6.5).font('Helvetica-Bold').text('▸ HABERES', cols.desc, y + 2); y += 11; linesUsed++;

  for (const d of haberes) {
    if (linesUsed >= maxLines) break;
    doc.rect(x, y, w, 10).fillAndStroke(linesUsed % 2 === 0 ? '#f8f9fb' : 'white', '#e8e8e8');
    doc.fillColor('#1a6b1a').fontSize(7).font('Helvetica-Bold').text('+', x + 3, y + 2);
    doc.fillColor('#222').font('Helvetica')
      .text(d.descripcion, cols.desc, y + 2, { width: 290 })
      .text(d.cantidad != null ? String(Number(d.cantidad).toFixed(d.cantidad % 1 !== 0 ? 2 : 0)) : '', cols.cant, y + 2, { width: 64, align: 'right' })
      .text(d.valorUnitario ? fmtARS(d.valorUnitario) : '', cols.vunit, y + 2, { width: 74, align: 'right' })
      .text(fmtARS(Math.abs(Number(d.importe))), cols.imp, y + 2, { width: 78, align: 'right' });
    y += 10; linesUsed++;
  }

  y += 3;
  doc.fillColor('#8b1a1a').fontSize(6.5).font('Helvetica-Bold').text('▸ DESCUENTOS', cols.desc, y + 2); y += 11; linesUsed++;

  for (const d of descuentos) {
    if (linesUsed >= maxLines + 2) break;
    doc.rect(x, y, w, 10).fillAndStroke(linesUsed % 2 === 0 ? '#fff8f8' : 'white', '#e8e8e8');
    doc.fillColor('#8b1a1a').fontSize(7).font('Helvetica-Bold').text('−', x + 3, y + 2);
    doc.fillColor('#222').font('Helvetica')
      .text(d.descripcion, cols.desc, y + 2, { width: 430 })
      .text(fmtARS(Math.abs(Number(d.importe))), cols.imp, y + 2, { width: 78, align: 'right' });
    y += 10; linesUsed++;
  }

  // Totals
  y += 4;
  doc.rect(x, y, w, 26).fillAndStroke(totalsBg, '#b0c4d8');
  doc.fillColor('#333').fontSize(7.5).font('Helvetica-Bold')
    .text('TOTAL HABERES:', x + 6, y + 5).text(fmtARS(liquidacion.totalHaberes), x + 90, y + 5)
    .text('DESCUENTOS:', x + 185, y + 5).text(fmtARS(liquidacion.totalDescuentos), x + 255, y + 5)
    .text('NETO:', x + 360, y + 5);
  doc.rect(x + 390, y, w - 360, 26).fillAndStroke(theme.color, theme.color);
  doc.fillColor('white').fontSize(12).font('Helvetica-Bold')
    .text(fmtARS(liquidacion.totalNeto), x + 392, y + 6, { width: 139, align: 'right' });

  // Employer contributions info line
  y += 31;
  doc.fillColor('#666').fontSize(6.5).font('Helvetica')
    .text(`Contribuciones empleador: ${fmtARS(liquidacion.totalContribuciones)}  |  Costo total empleador: ${fmtARS(Number(liquidacion.totalHaberes) + Number(liquidacion.totalContribuciones))}  |  Remuneración bruta: ${fmtARS(liquidacion.totalHaberes)}`, x, y, { width: w });

  // Signatures
  y += 12;
  if (theme.firmaPath) {
    try { doc.image(theme.firmaPath, x + 320, y - 4, { width: 160, height: 32, fit: [160, 32] }); } catch (_) {}
  }
  doc.moveTo(x + 50, y + 22).lineTo(x + 200, y + 22).stroke('#555');
  doc.moveTo(x + 330, y + 22).lineTo(x + 480, y + 22).stroke('#555');
  doc.fontSize(6.5).fillColor('#777')
    .text('Firma y aclaración del empleado', x + 50, y + 24, { width: 150, align: 'center' })
    .text('Firma y sello del empleador', x + 330, y + 24, { width: 150, align: 'center' });

  // Footer
  y += 36;
  doc.fontSize(5.8).fillColor('#bbb')
    .text(`Generado: ${dayjs().format('DD/MM/YYYY HH:mm')} — ${estudio?.razonSocial || ''} — Sistema EstudioPRO`, x, y, { width: w, align: 'center' });
}

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

      // Header box
      doc.rect(x, 40, w, 70).fillAndStroke('#1e3a5f', '#1e3a5f');
      doc.fillColor('white').fontSize(14).font('Helvetica-Bold')
        .text(empresa?.razonSocial || 'Emisor', x + 12, 50, { width: 280 });
      doc.fontSize(8).font('Helvetica')
        .text(`CUIT: ${empresa?.cuit || '—'}`, x + 12, 68)
        .text(`${empresa?.domicilio || ''} — ${empresa?.localidad || ''}`, x + 12, 78)
        .text(estudio?.razonSocial || '', x + 12, 88);

      // Tipo comprobante box
      doc.rect(x + 330, 40, 185, 70).fillAndStroke('#f0f4f8', '#1e3a5f');
      doc.fillColor('#1e3a5f').fontSize(13).font('Helvetica-Bold')
        .text(tipoDesc || 'Factura', x + 335, 48, { width: 175, align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor('#333')
        .text(`N°: ${String(comp.ptoVta).padStart(4,'0')}-${String(comp.nroComprobante).padStart(8,'0')}`, x + 335, 70, { width: 175, align: 'center' })
        .text(`Fecha: ${dayjs(comp.fechaEmision).format('DD/MM/YYYY')}`, x + 335, 84, { width: 175, align: 'center' });

      // CAE info
      let y = 125;
      const enCola = comp.estado === 'PENDIENTE_CAE';
      doc.rect(x, y, w, 22).fillAndStroke(enCola ? '#fde2e2' : '#fff3cd', enCola ? '#dc3545' : '#ffc107');
      doc.fillColor(enCola ? '#842029' : '#856404').fontSize(8).font('Helvetica-Bold')
        .text(`CAE: ${comp.cae || 'PENDIENTE'}`, x + 8, y + 7)
        .text(`Vto. CAE: ${comp.caeFchVto ? comp.caeFchVto.replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1') : '—'}`, x + 250, y + 7)
        .text(
          enCola ? '⚠ EN COLA — AÚN SIN CAE (ARCA no disponible)'
            : comp.simulado ? '⚠ MODO SIMULADO — NO VÁLIDO ANTE AFIP'
            : '✓ CAE Válido AFIP',
          x + 320, y + 7
        );

      // Receptor
      y += 32;
      doc.fillColor('#333').fontSize(9).font('Helvetica-Bold').text('Receptor:', x, y);
      doc.font('Helvetica').fontSize(8.5)
        .text(`${comp.receptorRazonSocial || 'Consumidor Final'}`, x + 65, y)
        .text(`CUIT/DNI: ${comp.receptorCuit || '—'}`, x + 65, y + 14)
        .text(`Domicilio: ${comp.receptorDomicilio || '—'}`, x + 65, y + 27);

      // Items table
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

      // Totals
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

      // QR fiscal RG 4892 — escaneable desde la app de ARCA para validar el comprobante
      if (comp.cae) {
        try {
          const { generarQRUrl } = require('./afip/afipEmisionService');
          const docNro = String(comp.receptorCuit || '0').replace(/[^\d]/g, '') || '0';
          // Multi-CUIT: el emisor real es la empresa solo si tiene certificado propio
          const certPropio = !!(comp.empresa?.afipCertificado && comp.empresa?.afipClavePrivada);
          const qrUrl = generarQRUrl({
            fecha: comp.fechaEmision,
            cuitEmisor: (certPropio ? comp.empresa?.cuit : comp.empresa?.estudio?.cuit) || comp.empresa?.cuit || '0',
            ptoVta: comp.ptoVta,
            cbteTipo: comp.tipoComprobante,
            nroComprobante: comp.nroComprobante,
            importe: comp.total,
            docTipo: docNro.length === 11 ? 80 : 99,
            docNro,
            cae: comp.cae,
          });
          const qrBuf = await QRCode.toBuffer(qrUrl, { width: 90, margin: 1 });
          doc.image(qrBuf, x, y + 10, { width: 80, height: 80 });
          doc.fontSize(6.5).fillColor('#888')
            .text('Verificable en afip.gob.ar/fe/qr', x, y + 92, { width: 100 });
        } catch (_) {}
      }

      // Footer
      doc.fontSize(7).fillColor('#aaa')
        .text(`EstudioPRO — ${dayjs().format('DD/MM/YYYY HH:mm')}`, x, 780, { width: w, align: 'center' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

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

      // Header
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

      // Column headers
      const colCta = x + 8;
      const colMeses = x + 200;
      const colWidth = 27;
      const colTotal = x + w - 70;

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
