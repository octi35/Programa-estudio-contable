const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const liquidacionService = require('../services/liquidacionService');
const pdfService = require('../services/pdfService');

const prisma = new PrismaClient();

// POST /api/liquidaciones/calcular
router.post('/calcular', auth, [
  body('empleadoId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  body('tipo').isIn(['MENSUAL', 'SAC_JUNIO', 'SAC_DICIEMBRE', 'VACACIONES']),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, anio, mes, tipo, ...opciones } = req.body;

    let resultado;
    if (tipo === 'MENSUAL') {
      resultado = await liquidacionService.calcularLiquidacionMensual(empleadoId, anio, mes, opciones);
    } else if (tipo === 'SAC_JUNIO') {
      resultado = await liquidacionService.calcularSAC(empleadoId, anio, 1);
    } else if (tipo === 'SAC_DICIEMBRE') {
      resultado = await liquidacionService.calcularSAC(empleadoId, anio, 2);
    } else if (tipo === 'VACACIONES') {
      resultado = await liquidacionService.calcularVacaciones(empleadoId, anio, mes);
    }

    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/periodo
router.post('/periodo', auth, [
  body('empresaId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  body('tipo').isIn(['MENSUAL', 'SAC_JUNIO', 'SAC_DICIEMBRE', 'VACACIONES']).optional(),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipo = 'MENSUAL' } = req.body;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    let periodo = await prisma.periodoLiquidacion.findFirst({
      where: { empresaId, anio, mes, tipo },
    });

    if (!periodo) {
      periodo = await prisma.periodoLiquidacion.create({
        data: { empresaId, anio, mes, tipo, estado: 'ABIERTO' },
      });
    }

    const empleados = await prisma.empleado.findMany({
      where: { empresaId, activo: true },
    });

    const conceptos = await prisma.concepto.findMany({
      where: { convenioId: empresa.convenioId },
    });
    const conceptosMap = {};
    conceptos.forEach(c => { conceptosMap[c.codigo] = c.id; });

    const resultados = [];
    for (const emp of empleados) {
      try {
        let calc;
        if (tipo === 'MENSUAL') {
          calc = await liquidacionService.calcularLiquidacionMensual(emp.id, anio, mes);
        } else if (tipo === 'SAC_JUNIO') {
          calc = await liquidacionService.calcularSAC(emp.id, anio, 1);
        } else if (tipo === 'SAC_DICIEMBRE') {
          calc = await liquidacionService.calcularSAC(emp.id, anio, 2);
        } else if (tipo === 'VACACIONES') {
          calc = await liquidacionService.calcularVacaciones(emp.id, anio, mes);
        }
        const guardada = await liquidacionService.guardarLiquidacion(calc, periodo.id, conceptosMap);
        resultados.push({ empleadoId: emp.id, empleado: `${emp.apellido} ${emp.nombre}`, exito: true, liquidacionId: guardada.id });
      } catch (e) {
        resultados.push({ empleadoId: emp.id, empleado: `${emp.apellido} ${emp.nombre}`, exito: false, error: e.message });
      }
    }

    res.json({ periodo, resultados, procesados: resultados.filter(r => r.exito).length, errores: resultados.filter(r => !r.exito).length });
  } catch (err) {
    next(err);
  }
});

// GET /api/liquidaciones
router.get('/', auth, async (req, res, next) => {
  try {
    const { empresaId, periodoId, empleadoId, anio, mes, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {};
    if (periodoId) where.periodoId = periodoId;
    if (empleadoId) where.empleadoId = empleadoId;
    if (anio) where.anio = Number(anio);
    if (mes) where.mes = Number(mes);
    if (empresaId) where.periodo = { empresaId };
    else where.periodo = { empresa: { estudioId: req.usuario.estudioId } };

    const [liquidaciones, total] = await Promise.all([
      prisma.liquidacion.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          empleado: { select: { id: true, apellido: true, nombre: true, cuil: true, legajoNumero: true } },
          periodo: { select: { id: true, anio: true, mes: true, tipo: true, estado: true } },
        },
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      }),
      prisma.liquidacion.count({ where }),
    ]);

    res.json({ data: liquidaciones, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    next(err);
  }
});

// GET /api/liquidaciones/:id
router.get('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidacion = await prisma.liquidacion.findFirst({
      where: {
        id: req.params.id,
        periodo: { empresa: { estudioId: req.usuario.estudioId } },
      },
      include: {
        empleado: { include: { empresa: { include: { convenio: true } } } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' } },
      },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });
    res.json(liquidacion);
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/:id/confirmar
router.post('/:id/confirmar', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidacion = await prisma.liquidacion.findFirst({
      where: { id: req.params.id, periodo: { empresa: { estudioId: req.usuario.estudioId } } },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const updated = await prisma.liquidacion.update({
      where: { id: req.params.id },
      data: { estado: 'CONFIRMADO' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/liquidaciones/:id/recibo (PDF)
router.get('/:id/recibo', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidacion = await prisma.liquidacion.findFirst({
      where: {
        id: req.params.id,
        periodo: { empresa: { estudioId: req.usuario.estudioId } },
      },
      include: {
        empleado: { include: { empresa: { include: { estudio: true, convenio: true } } } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' } },
      },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const pdfBuffer = await pdfService.generarRecibo(liquidacion);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo_${liquidacion.empleado.apellido}_${liquidacion.anio}${String(liquidacion.mes).padStart(2, '0')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
