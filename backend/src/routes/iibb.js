const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const dayjs = require('dayjs');


const JURISDICCIONES = [
  { codigo: 'BUENOS_AIRES', nombre: 'Buenos Aires', alicuota: 0.03 },
  { codigo: 'CABA', nombre: 'Ciudad Autónoma de Buenos Aires', alicuota: 0.03 },
  { codigo: 'CORDOBA', nombre: 'Córdoba', alicuota: 0.025 },
  { codigo: 'SANTA_FE', nombre: 'Santa Fe', alicuota: 0.025 },
  { codigo: 'MENDOZA', nombre: 'Mendoza', alicuota: 0.025 },
  { codigo: 'TUCUMAN', nombre: 'Tucumán', alicuota: 0.03 },
  { codigo: 'ENTRE_RIOS', nombre: 'Entre Ríos', alicuota: 0.025 },
  { codigo: 'SALTA', nombre: 'Salta', alicuota: 0.03 },
  { codigo: 'CORRIENTES', nombre: 'Corrientes', alicuota: 0.025 },
  { codigo: 'CHACO', nombre: 'Chaco', alicuota: 0.03 },
  { codigo: 'NEUQUEN', nombre: 'Neuquén', alicuota: 0.025 },
  { codigo: 'FORMOSA', nombre: 'Formosa', alicuota: 0.035 },
  { codigo: 'MISIONES', nombre: 'Misiones', alicuota: 0.03 },
  { codigo: 'SANTIAGO_ESTERO', nombre: 'Santiago del Estero', alicuota: 0.03 },
  { codigo: 'SAN_JUAN', nombre: 'San Juan', alicuota: 0.025 },
  { codigo: 'JUJUY', nombre: 'Jujuy', alicuota: 0.03 },
  { codigo: 'RIO_NEGRO', nombre: 'Río Negro', alicuota: 0.025 },
  { codigo: 'SAN_LUIS', nombre: 'San Luis', alicuota: 0.025 },
  { codigo: 'CATAMARCA', nombre: 'Catamarca', alicuota: 0.03 },
  { codigo: 'LA_RIOJA', nombre: 'La Rioja', alicuota: 0.03 },
  { codigo: 'CHUBUT', nombre: 'Chubut', alicuota: 0.025 },
  { codigo: 'SANTA_CRUZ', nombre: 'Santa Cruz', alicuota: 0.025 },
  { codigo: 'LA_PAMPA', nombre: 'La Pampa', alicuota: 0.025 },
  { codigo: 'TIERRA_DEL_FUEGO', nombre: 'Tierra del Fuego', alicuota: 0.025 },
];

function calcularVencimientoIIBB(anio, mes) {
  // Vencimiento típico: día 15 del mes siguiente
  return dayjs(`${anio}-${String(mes).padStart(2, '0')}-01`).add(1, 'month').date(15).toDate();
}

// GET /api/iibb/jurisdicciones
router.get('/jurisdicciones', auth, (req, res) => {
  res.json(JURISDICCIONES);
});

// GET /api/iibb/resumen?empresaId&anio
router.get('/resumen', auth, [
  query('empresaId').isUUID(),
  query('anio').isInt({ min: 2000, max: 2099 }),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio } = req.query;
    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const declaraciones = await prisma.declaracionIIBB.findMany({
      where: { empresaId, anio: Number(anio) },
      orderBy: [{ mes: 'asc' }, { jurisdiccion: 'asc' }],
    });

    // Agrupar por jurisdicción con totales por mes
    const resumen = {};
    for (const d of declaraciones) {
      if (!resumen[d.jurisdiccion]) resumen[d.jurisdiccion] = { jurisdiccion: d.jurisdiccion, meses: {}, totalImpuesto: 0, totalSaldo: 0 };
      resumen[d.jurisdiccion].meses[d.mes] = { impuesto: Number(d.impuesto), saldo: Number(d.saldo), estado: d.estado };
      resumen[d.jurisdiccion].totalImpuesto += Number(d.impuesto);
      resumen[d.jurisdiccion].totalSaldo += Number(d.saldo);
    }

    res.json({ anio: Number(anio), jurisdicciones: Object.values(resumen), declaraciones });
  } catch (err) { next(err); }
});

// GET /api/iibb?empresaId&anio&mes
router.get('/', auth, [
  query('empresaId').isUUID(),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.query;
    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const where = { empresaId };
    if (anio) where.anio = Number(anio);
    if (mes) where.mes = Number(mes);

    const declaraciones = await prisma.declaracionIIBB.findMany({
      where,
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { jurisdiccion: 'asc' }],
    });
    res.json(declaraciones);
  } catch (err) { next(err); }
});

// POST /api/iibb
router.post('/', auth, [
  body('empresaId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  body('jurisdiccion').notEmpty(),
  body('baseImponible').isFloat({ min: 0 }),
  body('alicuota').isFloat({ min: 0, max: 1 }),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes, jurisdiccion, baseImponible, alicuota, regimen, retenciones, percepciones, observaciones } = req.body;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const impuesto = Number(baseImponible) * Number(alicuota);
    const saldo = impuesto - Number(retenciones || 0) - Number(percepciones || 0);
    const fechaVencimiento = calcularVencimientoIIBB(anio, mes);

    const declaracion = await prisma.declaracionIIBB.upsert({
      where: { empresaId_anio_mes_jurisdiccion: { empresaId, anio: Number(anio), mes: Number(mes), jurisdiccion } },
      create: {
        empresaId, anio: Number(anio), mes: Number(mes), jurisdiccion,
        regimen: regimen || 'DIRECTO',
        baseImponible, alicuota, impuesto, retenciones: retenciones || 0,
        percepciones: percepciones || 0, saldo, fechaVencimiento, observaciones,
      },
      update: {
        regimen: regimen || 'DIRECTO',
        baseImponible, alicuota, impuesto, retenciones: retenciones || 0,
        percepciones: percepciones || 0, saldo, observaciones,
      },
    });
    res.status(201).json(declaracion);
  } catch (err) { next(err); }
});

// PUT /api/iibb/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.declaracionIIBB.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Declaración no encontrada' });

    const { baseImponible, alicuota, retenciones, percepciones, observaciones, regimen } = req.body;
    const impuesto = baseImponible !== undefined ? Number(baseImponible) * Number(alicuota) : Number(existing.impuesto);
    const saldo = impuesto - Number(retenciones || existing.retenciones) - Number(percepciones || existing.percepciones);

    const updated = await prisma.declaracionIIBB.update({
      where: { id: req.params.id },
      data: { baseImponible, alicuota, impuesto, retenciones, percepciones, saldo, observaciones, regimen },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// PUT /api/iibb/:id/presentar
router.put('/:id/presentar', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.declaracionIIBB.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Declaración no encontrada' });

    const updated = await prisma.declaracionIIBB.update({
      where: { id: req.params.id },
      data: { estado: 'PRESENTADA', fechaPresentacion: new Date() },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// PUT /api/iibb/:id/pagar
router.put('/:id/pagar', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.declaracionIIBB.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Declaración no encontrada' });

    const updated = await prisma.declaracionIIBB.update({
      where: { id: req.params.id },
      data: { estado: 'PAGADA' },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/iibb/:id
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.declaracionIIBB.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Declaración no encontrada' });
    if (existing.estado === 'PRESENTADA' || existing.estado === 'PAGADA') {
      return res.status(409).json({ error: 'No se puede eliminar una declaración presentada o pagada' });
    }

    await prisma.declaracionIIBB.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
