const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const pdfService = require('../services/pdfService');


// GET /api/presupuesto?empresaId&anio
router.get('/', auth, [
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

    const presupuesto = await prisma.presupuesto.findUnique({
      where: { empresaId_anio: { empresaId, anio: Number(anio) } },
      include: {
        items: {
          include: { cuentaContable: { select: { id: true, codigo: true, nombre: true, tipo: true, naturaleza: true } } },
          orderBy: [{ cuentaContable: { codigo: 'asc' } }, { mes: 'asc' }],
        },
      },
    });

    res.json(presupuesto || null);
  } catch (err) { next(err); }
});

// POST /api/presupuesto
router.post('/', auth, [
  body('empresaId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('nombre').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, nombre } = req.body;
    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const presupuesto = await prisma.presupuesto.create({
      data: { empresaId, anio: Number(anio), nombre },
    });
    res.status(201).json(presupuesto);
  } catch (err) { next(err); }
});

// PUT /api/presupuesto/:id/items — reemplaza todos los items del presupuesto
router.put('/:id/items', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const presupuesto = await prisma.presupuesto.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!presupuesto) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items debe ser un array' });

    // Upsert por presupuestoId + cuentaContableId + mes
    await prisma.$transaction(async tx => {
      for (const item of items) {
        await tx.itemPresupuesto.upsert({
          where: {
            presupuestoId_cuentaContableId_mes: {
              presupuestoId: req.params.id,
              cuentaContableId: item.cuentaContableId,
              mes: item.mes,
            },
          },
          create: {
            presupuestoId: req.params.id,
            cuentaContableId: item.cuentaContableId,
            mes: item.mes,
            importe: item.importe || 0,
          },
          update: { importe: item.importe || 0 },
        });
      }
    });

    const updated = await prisma.presupuesto.findUnique({
      where: { id: req.params.id },
      include: {
        items: {
          include: { cuentaContable: { select: { id: true, codigo: true, nombre: true, tipo: true } } },
          orderBy: [{ cuentaContable: { codigo: 'asc' } }, { mes: 'asc' }],
        },
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// GET /api/presupuesto/:id/comparativo — presupuesto vs real
router.get('/:id/comparativo', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const presupuesto = await prisma.presupuesto.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: {
        items: {
          include: { cuentaContable: { select: { id: true, codigo: true, nombre: true, tipo: true, naturaleza: true } } },
        },
      },
    });
    if (!presupuesto) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    // Obtener movimientos reales del mayor para el año del presupuesto
    const cuentasIds = [...new Set(presupuesto.items.map(i => i.cuentaContableId))];
    const lineas = await prisma.lineaAsiento.findMany({
      where: {
        cuentaContableId: { in: cuentasIds },
        asiento: {
          empresaId: presupuesto.empresaId,
          anulado: false,
          fecha: {
            gte: new Date(`${presupuesto.anio}-01-01`),
            lte: new Date(`${presupuesto.anio}-12-31`),
          },
        },
      },
      include: { asiento: { select: { fecha: true } } },
    });

    // Agrupar real por cuenta y mes
    const realPorCuentaMes = {};
    for (const l of lineas) {
      const mes = new Date(l.asiento.fecha).getMonth() + 1;
      const key = `${l.cuentaContableId}_${mes}`;
      if (!realPorCuentaMes[key]) realPorCuentaMes[key] = 0;
      realPorCuentaMes[key] += Number(l.debe) - Number(l.haber);
    }

    // Armar comparativo
    const cuentasMap = {};
    for (const item of presupuesto.items) {
      const cId = item.cuentaContableId;
      if (!cuentasMap[cId]) {
        cuentasMap[cId] = {
          cuenta: item.cuentaContable,
          meses: {},
          totalPresupuesto: 0,
          totalReal: 0,
        };
      }
      const real = realPorCuentaMes[`${cId}_${item.mes}`] || 0;
      const presup = Number(item.importe);
      const desviacion = presup !== 0 ? ((real - presup) / Math.abs(presup)) * 100 : null;

      cuentasMap[cId].meses[item.mes] = { presupuesto: presup, real, desviacion };
      cuentasMap[cId].totalPresupuesto += presup;
      cuentasMap[cId].totalReal += real;
    }

    res.json({
      presupuesto: { id: presupuesto.id, anio: presupuesto.anio, nombre: presupuesto.nombre },
      comparativo: Object.values(cuentasMap),
    });
  } catch (err) { next(err); }
});

// GET /api/presupuesto/:id/pdf
router.get('/:id/pdf', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const presupuesto = await prisma.presupuesto.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: {
        empresa: { include: { estudio: true } },
        items: {
          include: { cuentaContable: { select: { id: true, codigo: true, nombre: true, tipo: true, naturaleza: true } } },
          orderBy: [{ cuentaContable: { tipo: 'asc' } }, { mes: 'asc' }],
        },
      },
    });
    if (!presupuesto) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    // Organizar items por cuenta y agrupar los 12 meses
    const cuentasMap = {};
    for (const item of presupuesto.items) {
      const cId = item.cuentaContableId;
      if (!cuentasMap[cId]) {
        cuentasMap[cId] = {
          id: cId,
          cuentaNombre: `${item.cuentaContable.codigo} — ${item.cuentaContable.nombre}`,
          tipo: item.cuentaContable.tipo,
          descripcion: item.cuentaContable.nombre,
          meses: Array(12).fill(0),
        };
      }
      cuentasMap[cId].meses[item.mes - 1] = Number(item.importe);
    }

    const presupuestoConItems = {
      ...presupuesto,
      empresa: presupuesto.empresa,
      items: Object.values(cuentasMap),
    };

    const pdfBuffer = await pdfService.generarPresupuestoPDF(presupuestoConItems);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Presupuesto_${presupuesto.anio}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// DELETE /api/presupuesto/:id
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const presupuesto = await prisma.presupuesto.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!presupuesto) return res.status(404).json({ error: 'Presupuesto no encontrado' });

    await prisma.presupuesto.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
