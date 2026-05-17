const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });


// GET /api/bancos?empresaId
router.get('/', auth, [query('empresaId').isUUID(), validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.query.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const cuentas = await prisma.cuentaBancaria.findMany({
      where: { empresaId: req.query.empresaId, activa: true },
      include: { _count: { select: { movimientos: true } } },
      orderBy: { banco: 'asc' },
    });

    // Calcular saldo actual por cuenta
    const resultado = await Promise.all(cuentas.map(async c => {
      const agg = await prisma.movimientoBancario.aggregate({
        where: { cuentaBancariaId: c.id },
        _sum: { haber: true, debe: true },
      });
      const saldoActual = Number(c.saldoInicial) + Number(agg._sum.haber || 0) - Number(agg._sum.debe || 0);
      return { ...c, saldoActual };
    }));

    res.json(resultado);
  } catch (err) { next(err); }
});

// POST /api/bancos
router.post('/', auth, [
  body('empresaId').isUUID(),
  body('banco').notEmpty(),
  body('numeroCuenta').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.body.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const cuenta = await prisma.cuentaBancaria.create({ data: req.body });
    res.status(201).json(cuenta);
  } catch (err) { next(err); }
});

// PUT /api/bancos/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const { empresaId, ...data } = req.body;
    const updated = await prisma.cuentaBancaria.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/bancos/:id
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: { _count: { select: { movimientos: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (existing._count.movimientos > 0) {
      return res.status(409).json({ error: 'No se puede eliminar una cuenta con movimientos. Desactivela en su lugar.' });
    }

    await prisma.cuentaBancaria.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/bancos/:id/saldo
router.get('/:id/saldo', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const cuenta = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const agg = await prisma.movimientoBancario.aggregate({
      where: { cuentaBancariaId: req.params.id },
      _sum: { haber: true, debe: true },
    });
    const saldoActual = Number(cuenta.saldoInicial) + Number(agg._sum.haber || 0) - Number(agg._sum.debe || 0);
    res.json({ saldoInicial: Number(cuenta.saldoInicial), totalHaber: Number(agg._sum.haber || 0), totalDebe: Number(agg._sum.debe || 0), saldoActual });
  } catch (err) { next(err); }
});

// GET /api/bancos/:id/movimientos
router.get('/:id/movimientos', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const cuenta = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const { desde, hasta, page = 1, limit = 100 } = req.query;
    const where = { cuentaBancariaId: req.params.id };
    if (desde) where.fecha = { ...where.fecha, gte: new Date(desde) };
    if (hasta) where.fecha = { ...where.fecha, lte: new Date(hasta) };

    const movimientos = await prisma.movimientoBancario.findMany({
      where,
      orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    // Calcular saldo acumulado
    let saldo = Number(cuenta.saldoInicial);
    const conSaldo = movimientos.map(m => {
      saldo += Number(m.haber) - Number(m.debe);
      return { ...m, saldoCalculado: Math.round(saldo * 100) / 100 };
    });

    res.json({ cuenta, movimientos: conSaldo, saldoActual: saldo });
  } catch (err) { next(err); }
});

// POST /api/bancos/:id/movimientos
router.post('/:id/movimientos', auth, [
  param('id').isUUID(),
  body('fecha').isISO8601(),
  body('descripcion').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const cuenta = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const mov = await prisma.movimientoBancario.create({
      data: { ...req.body, cuentaBancariaId: req.params.id },
    });
    res.status(201).json(mov);
  } catch (err) { next(err); }
});

// PUT /api/bancos/:id/movimientos/:movId
router.put('/:id/movimientos/:movId', auth, [
  param('id').isUUID(), param('movId').isUUID(), validate,
], async (req, res, next) => {
  try {
    const cuenta = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const { cuentaBancariaId, ...data } = req.body;
    const updated = await prisma.movimientoBancario.update({
      where: { id: req.params.movId },
      data,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/bancos/:id/movimientos/:movId
router.delete('/:id/movimientos/:movId', auth, [
  param('id').isUUID(), param('movId').isUUID(), validate,
], async (req, res, next) => {
  try {
    const cuenta = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    await prisma.movimientoBancario.delete({ where: { id: req.params.movId } });
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /api/bancos/:id/movimientos/importar — carga lote de movimientos
router.post('/:id/movimientos/importar', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const cuenta = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const { movimientos } = req.body;
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      return res.status(400).json({ error: 'movimientos debe ser un array no vacío' });
    }

    const data = movimientos.map(m => ({
      cuentaBancariaId: req.params.id,
      fecha: new Date(m.fecha),
      descripcion: m.descripcion || 'Importado',
      referencia: m.referencia || null,
      debe: m.debe || 0,
      haber: m.haber || 0,
      saldo: m.saldo || 0,
    }));

    const result = await prisma.movimientoBancario.createMany({ data });
    res.json({ importados: result.count });
  } catch (err) { next(err); }
});

// POST /api/bancos/:id/movimientos/importar-excel — importación masiva desde Excel
// Columnas: fecha, descripcion, referencia, debe, haber  (saldo se calcula automáticamente)
router.post('/:id/movimientos/importar-excel', auth, [param('id').isUUID(), validate], upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const cuenta = await prisma.cuentaBancaria.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const sheet = wb.worksheets[0];

    const headers = [];
    const filas = [];
    let isFirst = true;
    sheet.eachRow((row) => {
      if (isFirst) {
        row.eachCell(c => headers.push(String(c.value || '').toLowerCase().trim().replace(/\s+/g, '_')));
        isFirst = false; return;
      }
      const obj = {};
      let alguno = false;
      row.eachCell((cell, col) => {
        const key = headers[col - 1];
        if (!key) return;
        obj[key] = cell.value;
        if (cell.value !== null && cell.value !== '') alguno = true;
      });
      if (alguno) filas.push(obj);
    });

    const parseFecha = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v;
      const s = String(v);
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (m) return new Date(`${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
      return new Date(s);
    };
    const num = (v) => v == null || v === '' ? 0 : Number(String(v).replace(/,/g, '.')) || 0;

    const errores = [];
    const aCrear = [];

    filas.forEach((r, i) => {
      const fila = i + 2;
      const fecha = parseFecha(r.fecha);
      if (!fecha || isNaN(fecha.getTime())) { errores.push({ fila, error: 'fecha inválida' }); return; }
      aCrear.push({
        cuentaBancariaId: req.params.id,
        fecha,
        descripcion: String(r.descripcion || r.detalle || 'Importado'),
        referencia: r.referencia ? String(r.referencia) : null,
        debe: num(r.debe),
        haber: num(r.haber),
        saldo: 0, // se recalcula abajo
      });
    });

    // Calcular saldo acumulativo ordenando por fecha
    aCrear.sort((a, b) => a.fecha - b.fecha);
    let saldo = Number(cuenta.saldoInicial);
    const movsAnteriores = await prisma.movimientoBancario.aggregate({
      where: { cuentaBancariaId: req.params.id, fecha: { lt: aCrear[0]?.fecha } },
      _sum: { haber: true, debe: true },
    });
    saldo += Number(movsAnteriores._sum.haber || 0) - Number(movsAnteriores._sum.debe || 0);
    for (const m of aCrear) {
      saldo = saldo + Number(m.haber) - Number(m.debe);
      m.saldo = saldo;
    }

    const result = await prisma.movimientoBancario.createMany({ data: aCrear });
    res.json({ total: aCrear.length, exitosos: result.count, fallidos: errores.length, errores });
  } catch (err) { next(err); }
});

module.exports = router;
