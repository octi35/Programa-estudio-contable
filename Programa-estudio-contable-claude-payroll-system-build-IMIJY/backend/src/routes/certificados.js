const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');


function formatMoney(n) {
  return Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function encabezadoPDF(doc, empresa, titulo) {
  doc.font('Helvetica-Bold').fontSize(14).text(empresa.razonSocial, { align: 'center' });
  doc.font('Helvetica').fontSize(10).text(`CUIT: ${empresa.cuit}`, { align: 'center' });
  if (empresa.domicilio) doc.text(`${empresa.domicilio}${empresa.localidad ? ` — ${empresa.localidad}` : ''}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1e3a5f').text(titulo, { align: 'center' });
  doc.fillColor('#000000').moveDown(0.5);
}

function piePDF(doc) {
  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).fillColor('#555555')
    .text('Este certificado se extiende a solicitud del interesado para ser presentado ante quien corresponda.', { align: 'center' });
  doc.text(`Fecha de emisión: ${dayjs().format('DD/MM/YYYY')}`, { align: 'center' });
}

// GET /api/certificados/trabajo/:empleadoId
router.get('/trabajo/:empleadoId', auth, [param('empleadoId').isUUID(), validate], async (req, res, next) => {
  try {
    const empleado = await prisma.empleado.findFirst({
      where: { id: req.params.empleadoId, empresa: { estudioId: req.usuario.estudioId } },
      include: { empresa: true },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="cert_trabajo_${empleado.apellido}.pdf"`);
      res.send(buf);
    });

    encabezadoPDF(doc, empleado.empresa, 'CERTIFICADO DE TRABAJO');
    doc.text(`(Art. 80 de la Ley de Contrato de Trabajo N° 20.744)`);
    doc.moveDown();

    const nombreCompleto = `${empleado.apellido}, ${empleado.nombre}`;
    const antiguedad = empleado.fechaEgreso
      ? dayjs(empleado.fechaEgreso).diff(dayjs(empleado.fechaIngreso), 'year')
      : dayjs().diff(dayjs(empleado.fechaIngreso), 'year');

    const filas = [
      ['Nombre y Apellido:', nombreCompleto],
      ['CUIL:', empleado.cuil],
      ['N° Legajo:', empleado.legajoNumero || '—'],
      ['Categoría / Puesto:', `${empleado.categoria || '—'} / ${empleado.puesto || '—'}`],
      ['Fecha de Ingreso:', dayjs(empleado.fechaIngreso).format('DD/MM/YYYY')],
      ['Fecha de Egreso:', empleado.fechaEgreso ? dayjs(empleado.fechaEgreso).format('DD/MM/YYYY') : 'En actividad'],
      ['Antigüedad:', `${antiguedad} año(s)`],
      ['Remuneración Bruta:', `$ ${formatMoney(empleado.basicoMensual)}`],
      ['Modalidad Contrato:', empleado.modalidadContrato?.replace(/_/g, ' ') || '—'],
      ['Motivo Egreso:', empleado.motivoEgreso?.replace(/_/g, ' ') || 'N/A'],
    ];

    doc.font('Helvetica').fontSize(10);
    for (const [label, valor] of filas) {
      doc.font('Helvetica-Bold').text(label, { continued: true });
      doc.font('Helvetica').text(` ${valor}`);
    }

    piePDF(doc);
    doc.end();
  } catch (err) { next(err); }
});

// GET /api/certificados/haberes/:empleadoId?anio&mes
router.get('/haberes/:empleadoId', auth, [
  param('empleadoId').isUUID(),
  query('anio').isInt({ min: 2000, max: 2099 }),
  query('mes').isInt({ min: 1, max: 12 }),
  validate,
], async (req, res, next) => {
  try {
    const { anio, mes } = req.query;
    const empleado = await prisma.empleado.findFirst({
      where: { id: req.params.empleadoId, empresa: { estudioId: req.usuario.estudioId } },
      include: { empresa: true },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const liquidacion = await prisma.liquidacion.findFirst({
      where: { empleadoId: req.params.empleadoId, anio: Number(anio), mes: Number(mes) },
      include: { detalles: { orderBy: { orden: 'asc' } } },
    });

    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="cert_haberes_${empleado.apellido}_${anio}${String(mes).padStart(2,'0')}.pdf"`);
      res.send(buf);
    });

    encabezadoPDF(doc, empleado.empresa, `CERTIFICADO DE HABERES — ${MESES[Number(mes)-1]} ${anio}`);

    doc.font('Helvetica').fontSize(10);
    doc.font('Helvetica-Bold').text('Datos del empleado:', { underline: true });
    doc.moveDown(0.3);
    doc.font('Helvetica').text(`Nombre: ${empleado.apellido}, ${empleado.nombre}`);
    doc.text(`CUIL: ${empleado.cuil}   Legajo: ${empleado.legajoNumero || '—'}`);
    doc.text(`Categoría: ${empleado.categoria || '—'}   Puesto: ${empleado.puesto || '—'}`);
    doc.moveDown();

    if (liquidacion) {
      doc.font('Helvetica-Bold').text('Detalle de haberes:', { underline: true });
      doc.moveDown(0.3);
      for (const d of liquidacion.detalles.filter(d => d.naturaleza === 'HABER')) {
        doc.font('Helvetica').text(`${d.descripcion}`, { continued: true, width: 320 });
        doc.text(`$ ${formatMoney(d.importe)}`, { align: 'right' });
      }
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.3);
      for (const d of liquidacion.detalles.filter(d => d.naturaleza === 'DESCUENTO')) {
        doc.font('Helvetica').text(`${d.descripcion}`, { continued: true, width: 320 });
        doc.text(`- $ ${formatMoney(d.importe)}`, { align: 'right' });
      }
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#000000').stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(11)
        .text('NETO A COBRAR:', { continued: true })
        .text(`$ ${formatMoney(liquidacion.totalNeto)}`, { align: 'right' });
    } else {
      doc.text('No se encontró liquidación para el período indicado.');
    }

    piePDF(doc);
    doc.end();
  } catch (err) { next(err); }
});

// GET /api/certificados/remuneraciones/:empleadoId?anio
router.get('/remuneraciones/:empleadoId', auth, [
  param('empleadoId').isUUID(),
  query('anio').isInt({ min: 2000, max: 2099 }),
  validate,
], async (req, res, next) => {
  try {
    const { anio } = req.query;
    const empleado = await prisma.empleado.findFirst({
      where: { id: req.params.empleadoId, empresa: { estudioId: req.usuario.estudioId } },
      include: { empresa: true },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { empleadoId: req.params.empleadoId, anio: Number(anio), estado: 'CONFIRMADO' },
      orderBy: { mes: 'asc' },
    });

    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="cert_remuneraciones_${empleado.apellido}_${anio}.pdf"`);
      res.send(buf);
    });

    encabezadoPDF(doc, empleado.empresa, `CONSTANCIA DE REMUNERACIONES Y RETENCIONES — ${anio}`);

    doc.font('Helvetica').fontSize(10)
      .text(`Empleado: ${empleado.apellido}, ${empleado.nombre}   CUIL: ${empleado.cuil}`);
    doc.moveDown();

    let totalHaberes = 0, totalDesc = 0, totalNeto = 0;
    for (const liq of liquidaciones) {
      const mes = MESES[liq.mes - 1];
      doc.font('Helvetica').text(
        `${mes}   Haberes: $ ${formatMoney(liq.totalHaberes)}   Descuentos: $ ${formatMoney(liq.totalDescuentos)}   Neto: $ ${formatMoney(liq.totalNeto)}`
      );
      totalHaberes += Number(liq.totalHaberes);
      totalDesc += Number(liq.totalDescuentos);
      totalNeto += Number(liq.totalNeto);
    }

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text(
      `TOTALES ${anio}   Haberes: $ ${formatMoney(totalHaberes)}   Descuentos: $ ${formatMoney(totalDesc)}   Neto: $ ${formatMoney(totalNeto)}`
    );

    piePDF(doc);
    doc.end();
  } catch (err) { next(err); }
});

module.exports = router;
