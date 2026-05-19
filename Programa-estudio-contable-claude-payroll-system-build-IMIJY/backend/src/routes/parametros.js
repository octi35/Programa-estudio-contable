const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { auth, requireRol } = require('../middleware/auth');
const validate = require('../middleware/validate');


// Parámetros fiscales por defecto (claves conocidas)
const PARAMETROS_DEFAULT = {
  'TOPE_ANSES': { descripcion: 'Tope base imponible ANSeS (máx. remuneración para aportes)', valor: '1700000' },
  'MINIMO_NO_IMPONIBLE': { descripcion: 'Mínimo No Imponible Ganancias 4ta categoría', valor: '1000000' },
  'ALICUOTA_IVA_GENERAL': { descripcion: 'Alícuota IVA general (%)', valor: '21' },
  'ALICUOTA_IVA_REDUCIDA': { descripcion: 'Alícuota IVA reducida (%)', valor: '10.5' },
  'ALICUOTA_IVA_DIFERENCIAL': { descripcion: 'Alícuota IVA diferencial (%)', valor: '27' },
  'PORCENTAJE_SINDICATO': { descripcion: 'Porcentaje descuento sindical (%)', valor: '2' },
  'PORCENTAJE_CUOTA_SOLIDARIA': { descripcion: 'Cuota solidaria sindical (%)', valor: '1' },
  'PORCENTAJE_ART': { descripcion: 'Alícuota ART empleador (%)', valor: '2.5' },
  'VALOR_HORA_EXTRA_50': { descripcion: 'Factor hora extra 50%', valor: '1.5' },
  'VALOR_HORA_EXTRA_100': { descripcion: 'Factor hora extra 100%', valor: '2' },
};

// GET /api/parametros — devuelve todos los parámetros vigentes del estudio
router.get('/', auth, async (req, res, next) => {
  try {
    const parametros = await prisma.parametroFiscal.findMany({
      where: { estudioId: req.usuario.estudioId },
      orderBy: [{ clave: 'asc' }, { vigenciaDesde: 'desc' }],
    });

    // Agrupa por clave y toma el más reciente
    const vigentes = {};
    for (const p of parametros) {
      if (!vigentes[p.clave]) vigentes[p.clave] = p;
    }

    // Completa con defaults para claves no configuradas
    const resultado = { ...PARAMETROS_DEFAULT };
    for (const [clave, param] of Object.entries(vigentes)) {
      resultado[clave] = { ...resultado[clave], ...param };
    }

    res.json(Object.entries(resultado).map(([clave, p]) => ({
      clave,
      valor: p.valor,
      descripcion: p.descripcion,
      id: p.id,
      vigenciaDesde: p.vigenciaDesde,
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/parametros/valor/:clave
router.get('/valor/:clave', auth, async (req, res, next) => {
  try {
    const param = await prisma.parametroFiscal.findFirst({
      where: { estudioId: req.usuario.estudioId, clave: req.params.clave },
      orderBy: { vigenciaDesde: 'desc' },
    });

    const defecto = PARAMETROS_DEFAULT[req.params.clave];
    if (!param && !defecto) return res.status(404).json({ error: 'Parámetro no encontrado' });

    res.json({ clave: req.params.clave, valor: param?.valor || defecto?.valor, descripcion: param?.descripcion || defecto?.descripcion });
  } catch (err) {
    next(err);
  }
});

// PUT /api/parametros — upsert de múltiples parámetros
router.put('/', auth, requireRol('ADMIN', 'CONTADOR'), [
  body('parametros').isArray(),
  validate,
], async (req, res, next) => {
  try {
    const { parametros } = req.body;
    const ahora = new Date();

    await prisma.$transaction(
      parametros.map(({ clave, valor, descripcion }) =>
        prisma.parametroFiscal.create({
          data: {
            estudioId: req.usuario.estudioId,
            clave,
            valor: String(valor),
            descripcion,
            vigenciaDesde: ahora,
          },
        })
      )
    );

    res.json({ ok: true, actualizados: parametros.length });
  } catch (err) {
    next(err);
  }
});

// ── Categorías de Monotributo (configurables) ────────────────────────────────
const DEFAULT_CATEGORIAS_MONOTRIBUTO = [
  { cat: 'A', limiteIngresos: 6450000, cuota: 2614 },
  { cat: 'B', limiteIngresos: 9450000, cuota: 3128 },
  { cat: 'C', limiteIngresos: 13250000, cuota: 3729 },
  { cat: 'D', limiteIngresos: 16450000, cuota: 4472 },
  { cat: 'E', limiteIngresos: 19350000, cuota: 5490 },
  { cat: 'F', limiteIngresos: 24250000, cuota: 6767 },
  { cat: 'G', limiteIngresos: 29000000, cuota: 8328 },
  { cat: 'H', limiteIngresos: 44000000, cuota: 13110 },
  { cat: 'I', limiteIngresos: 49250000, cuota: 14914 },
  { cat: 'J', limiteIngresos: 56400000, cuota: 17271 },
  { cat: 'K', limiteIngresos: 68000000, cuota: 21246 },
];

// GET /api/parametros/monotributo/categorias
router.get('/monotributo/categorias', auth, async (req, res, next) => {
  try {
    const param = await prisma.parametroFiscal.findFirst({
      where: { clave: 'MONOTRIBUTO_CATEGORIAS', estudioId: req.usuario.estudioId },
      orderBy: { vigenciaDesde: 'desc' },
    });

    let categorias = DEFAULT_CATEGORIAS_MONOTRIBUTO;
    let fuente = 'default';
    if (param) {
      try {
        categorias = JSON.parse(param.valor);
        fuente = 'configurado';
      } catch (_) {
        categorias = DEFAULT_CATEGORIAS_MONOTRIBUTO;
      }
    }

    res.json({ categorias, fuente });
  } catch (err) {
    next(err);
  }
});

// PUT /api/parametros/monotributo/categorias — solo ADMIN
router.put('/monotributo/categorias', auth, requireRol('ADMIN'), async (req, res, next) => {
  try {
    const { categorias } = req.body;
    if (!Array.isArray(categorias) || categorias.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de categorías' });
    }

    await prisma.parametroFiscal.create({
      data: {
        estudioId: req.usuario.estudioId,
        clave: 'MONOTRIBUTO_CATEGORIAS',
        valor: JSON.stringify(categorias),
        descripcion: 'Categorías y topes del Monotributo',
        vigenciaDesde: new Date(),
      },
    });

    res.json({ ok: true, categorias });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
