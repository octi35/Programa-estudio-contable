const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/reportes/resumen-empresa/:empresaId/:anio/:mes
router.get('/resumen-empresa/:empresaId/:anio/:mes', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.params;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: {
        periodo: { empresaId, anio: Number(anio), mes: Number(mes) },
        tipo: 'MENSUAL',
      },
      include: { empleado: { select: { apellido: true, nombre: true, cuil: true, categoria: true } } },
    });

    const totales = liquidaciones.reduce((acc, liq) => ({
      totalHaberes: acc.totalHaberes + Number(liq.totalHaberes),
      totalDescuentos: acc.totalDescuentos + Number(liq.totalDescuentos),
      totalNeto: acc.totalNeto + Number(liq.totalNeto),
      totalContribuciones: acc.totalContribuciones + Number(liq.totalContribuciones),
      cantEmpleados: acc.cantEmpleados + 1,
    }), { totalHaberes: 0, totalDescuentos: 0, totalNeto: 0, totalContribuciones: 0, cantEmpleados: 0 });

    totales.costoTotal = totales.totalHaberes + totales.totalContribuciones;

    res.json({ empresa, periodo: { anio: Number(anio), mes: Number(mes) }, totales, liquidaciones });
  } catch (err) {
    next(err);
  }
});

// GET /api/reportes/panel-estudio
router.get('/panel-estudio', auth, async (req, res, next) => {
  try {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth() + 1;

    const [cantEmpresas, cantEmpleados, liquidacionesMes] = await Promise.all([
      prisma.empresa.count({ where: { estudioId: req.usuario.estudioId, activa: true } }),
      prisma.empleado.count({ where: { empresa: { estudioId: req.usuario.estudioId }, activo: true } }),
      prisma.liquidacion.findMany({
        where: {
          periodo: { empresa: { estudioId: req.usuario.estudioId }, anio, mes },
          tipo: 'MENSUAL',
        },
        select: { totalHaberes: true, totalNeto: true, estado: true },
      }),
    ]);

    const empresas = await prisma.empresa.findMany({
      where: { estudioId: req.usuario.estudioId, activa: true },
      select: {
        id: true, razonSocial: true, cuit: true,
        _count: { select: { empleados: { where: { activo: true } } } },
        periodos: {
          where: { anio, mes },
          select: { estado: true, _count: { select: { liquidaciones: true } } },
          take: 1,
        },
      },
      orderBy: { razonSocial: 'asc' },
    });

    const totalMensual = liquidacionesMes.reduce((s, l) => s + Number(l.totalHaberes), 0);

    res.json({
      resumen: { cantEmpresas, cantEmpleados, liquidacionesMes: liquidacionesMes.length, totalMensual },
      empresas,
      periodo: { anio, mes },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reportes/comparativo/:empresaId
router.get('/comparativo/:empresaId', auth, async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const { meses = 6 } = req.query;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const periodos = await prisma.periodoLiquidacion.findMany({
      where: { empresaId, tipo: 'MENSUAL' },
      include: {
        _count: { select: { liquidaciones: true } },
        liquidaciones: {
          select: { totalHaberes: true, totalDescuentos: true, totalNeto: true },
          where: { tipo: 'MENSUAL' },
        },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: Number(meses),
    });

    const comparativo = periodos.map(p => ({
      anio: p.anio,
      mes: p.mes,
      cantLiquidaciones: p._count.liquidaciones,
      totalHaberes: p.liquidaciones.reduce((s, l) => s + Number(l.totalHaberes), 0),
      totalNeto: p.liquidaciones.reduce((s, l) => s + Number(l.totalNeto), 0),
    })).reverse();

    res.json({ empresa, comparativo });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
