const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');


// Parámetros Ganancias 4ª 2024 (actualizados por decreto)
const GANANCIAS = {
  MNI: 4503985.29,
  DEDUCCION_ESPECIAL: 21619128.96,
  CONYUGE: 4150956.94,
  HIJO: 2094403.49,
  HIJO_DISCAPACITADO: 4188806.98,
  // Escala anual progresiva (tramos acumulados)
  ESCALA: [
    { desde: 0,        hasta: 419373,    fijo: 0,       tasa: 0.05 },
    { desde: 419373,   hasta: 838746,    fijo: 20968,   tasa: 0.09 },
    { desde: 838746,   hasta: 1258119,   fijo: 58712,   tasa: 0.12 },
    { desde: 1258119,  hasta: 1677492,   fijo: 109022,  tasa: 0.15 },
    { desde: 1677492,  hasta: 2516238,   fijo: 171914,  tasa: 0.19 },
    { desde: 2516238,  hasta: 3355116,   fijo: 331282,  tasa: 0.23 },
    { desde: 3355116,  hasta: 5032608,   fijo: 524032,  tasa: 0.27 },
    { desde: 5032608,  hasta: 6710100,   fijo: 977983,  tasa: 0.31 },
    { desde: 6710100,  hasta: Infinity,  fijo: 1497953, tasa: 0.35 },
  ],
};

function calcularImpuestoEscala(baseAnual) {
  if (baseAnual <= 0) return 0;
  const tramo = GANANCIAS.ESCALA.find(t => baseAnual > t.desde && baseAnual <= t.hasta)
    || GANANCIAS.ESCALA[GANANCIAS.ESCALA.length - 1];
  return Math.max(0, tramo.fijo + (baseAnual - tramo.desde) * tramo.tasa);
}

// GET /api/ganancias/config?empleadoId&anio
router.get('/config', auth, [
  query('empleadoId').isUUID(),
  query('anio').isInt({ min: 2020, max: 2099 }),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, anio } = req.query;
    const emp = await prisma.empleado.findFirst({
      where: { id: empleadoId, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const config = await prisma.gananciasEmpleado.findUnique({
      where: { empleadoId_anio: { empleadoId, anio: Number(anio) } },
    });
    res.json(config || { empleadoId, anio: Number(anio), conyuge: false, hijos: 0, hijosDiscapacitados: 0 });
  } catch (err) { next(err); }
});

// POST /api/ganancias/config
router.post('/config', auth, [
  body('empleadoId').isUUID(),
  body('anio').isInt({ min: 2020, max: 2099 }),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, anio, ...datos } = req.body;
    const emp = await prisma.empleado.findFirst({
      where: { id: empleadoId, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const config = await prisma.gananciasEmpleado.upsert({
      where: { empleadoId_anio: { empleadoId, anio: Number(anio) } },
      create: { empleadoId, anio: Number(anio), ...datos },
      update: datos,
    });
    res.json(config);
  } catch (err) { next(err); }
});

// POST /api/ganancias/calcular
router.post('/calcular', auth, [
  body('empleadoId').isUUID(),
  body('anio').isInt({ min: 2020, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  body('remuneracionMensual').isFloat({ min: 0 }),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, anio, mes, remuneracionMensual } = req.body;

    const config = await prisma.gananciasEmpleado.findUnique({
      where: { empleadoId_anio: { empleadoId, anio: Number(anio) } },
    }) || { conyuge: false, hijos: 0, hijosDiscapacitados: 0, alquiler: 0, hipoteca: 0, medicinaPrivada: 0, sepelio: 0, donaciones: 0, otrasDeducciones: 0 };

    // Deducciones anuales
    const dedMNI = GANANCIAS.MNI;
    const dedEspecial = GANANCIAS.DEDUCCION_ESPECIAL;
    const dedConyuge = config.conyuge ? GANANCIAS.CONYUGE : 0;
    const dedHijos = (config.hijos || 0) * GANANCIAS.HIJO;
    const dedHijosDisc = (config.hijosDiscapacitados || 0) * GANANCIAS.HIJO_DISCAPACITADO;
    const dedOtras = (
      Number(config.alquiler || 0) +
      Number(config.hipoteca || 0) +
      Number(config.medicinaPrivada || 0) +
      Number(config.sepelio || 0) +
      Number(config.donaciones || 0) +
      Number(config.otrasDeducciones || 0)
    ) * 12; // anualizadas

    const totalDeduccionesAnual = dedMNI + dedEspecial + dedConyuge + dedHijos + dedHijosDisc + dedOtras;

    // Remuneración acumulada al mes actual (aproximación: mismo valor todos los meses)
    const remuneracionAcumulada = Number(remuneracionMensual) * Number(mes);
    const baseImponibleAnual = Math.max(0, remuneracionAcumulada - (totalDeduccionesAnual / 12) * Number(mes));

    const impuestoAcumulado = calcularImpuestoEscala(baseImponibleAnual);

    // Retenciones practicadas en meses anteriores (buscar en liquidaciones)
    const liquidacionesAnteriores = await prisma.detalleLiquidacion.aggregate({
      where: {
        liquidacion: {
          empleadoId,
          anio: Number(anio),
          mes: { lt: Number(mes) },
        },
        descripcion: { contains: 'Ganancias 4ª', mode: 'insensitive' },
      },
      _sum: { importe: true },
    });
    const retencionesAnteriores = Math.abs(Number(liquidacionesAnteriores._sum?.importe || 0));

    const retencionMes = Math.max(0, impuestoAcumulado - retencionesAnteriores);

    res.json({
      retencionMes: Math.round(retencionMes * 100) / 100,
      acumuladoAnual: Math.round(impuestoAcumulado * 100) / 100,
      retencionesAnteriores: Math.round(retencionesAnteriores * 100) / 100,
      baseImponibleAnual: Math.round(baseImponibleAnual * 100) / 100,
      remuneracionAcumulada: Math.round(remuneracionAcumulada * 100) / 100,
      deducciones: {
        mni: Math.round(dedMNI * 100) / 100,
        especial: Math.round(dedEspecial * 100) / 100,
        conyuge: Math.round(dedConyuge * 100) / 100,
        hijos: Math.round(dedHijos * 100) / 100,
        hijosDiscapacitados: Math.round(dedHijosDisc * 100) / 100,
        otras: Math.round(dedOtras * 100) / 100,
        total: Math.round(totalDeduccionesAnual * 100) / 100,
      },
      escala: GANANCIAS.ESCALA.map(t => ({
        desde: t.desde,
        hasta: t.hasta === Infinity ? null : t.hasta,
        tasa: t.tasa,
      })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
