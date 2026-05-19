const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');


// GET /api/conceptos
router.get('/', auth, async (req, res, next) => {
  try {
    const { convenioId, tipo } = req.query;
    const where = {};
    if (convenioId) where.convenioId = convenioId;
    if (tipo) where.tipo = tipo;
    where.activo = true;

    const conceptos = await prisma.concepto.findMany({
      where,
      include: { convenio: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    res.json(conceptos);
  } catch (err) {
    next(err);
  }
});

// POST /api/conceptos
router.post('/', auth, [
  body('codigo').notEmpty().withMessage('Código requerido'),
  body('nombre').notEmpty().withMessage('Nombre requerido'),
  body('tipo').isIn(['REMUNERATIVO', 'NO_REMUNERATIVO', 'DEDUCCION', 'APORTE_EMPLEADOR']),
  body('naturaleza').isIn(['HABER', 'DESCUENTO', 'INFORMATIVO']),
  validate,
], async (req, res, next) => {
  try {
    const concepto = await prisma.concepto.create({ data: req.body });
    res.status(201).json(concepto);
  } catch (err) {
    next(err);
  }
});

// PUT /api/conceptos/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const concepto = await prisma.concepto.update({ where: { id: req.params.id }, data: req.body });
    res.json(concepto);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
