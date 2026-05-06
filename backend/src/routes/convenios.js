const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/convenios
router.get('/', auth, async (req, res, next) => {
  try {
    const convenios = await prisma.convenio.findMany({
      where: { activo: true },
      include: { _count: { select: { conceptos: true, empresas: true } } },
      orderBy: { nombre: 'asc' },
    });
    res.json(convenios);
  } catch (err) {
    next(err);
  }
});

// GET /api/convenios/:id/tabla-sueldo
router.get('/:id/tabla-sueldo', auth, async (req, res, next) => {
  try {
    const tabla = await prisma.tablaSueldo.findMany({
      where: { convenioId: req.params.id },
      orderBy: { categoria: 'asc' },
    });
    res.json(tabla);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
