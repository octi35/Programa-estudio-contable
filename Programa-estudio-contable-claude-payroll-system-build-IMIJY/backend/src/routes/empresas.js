const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const imageFilter = (_req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Solo se permiten imágenes'));
};

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `empresa_${req.params.id}_logo${ext}`);
  },
});

const firmaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `empresa_${req.params.id}_firma${ext}`);
  },
});

const uploadLogo = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: imageFilter });
const uploadFirma = multer({ storage: firmaStorage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: imageFilter });

const toBool = (v) => v === true || v === 'true' || v === 1 || v === '1';


const empresaValidations = [
  body('razonSocial').notEmpty().withMessage('Razón social requerida'),
  body('cuit').matches(/^\d{2}-\d{8}-\d{1}$/).withMessage('CUIT inválido (formato: XX-XXXXXXXX-X)'),
];

// GET /api/empresas
router.get('/', auth, async (req, res, next) => {
  try {
    const { buscar, activa, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { estudioId: req.usuario.estudioId };
    if (activa !== undefined) where.activa = activa === 'true';
    if (buscar) {
      where.OR = [
        { razonSocial: { contains: buscar, mode: 'insensitive' } },
        { cuit: { contains: buscar } },
        { nombreFantasia: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    const [empresas, total] = await Promise.all([
      prisma.empresa.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          convenio: { select: { id: true, codigo: true, nombre: true } },
          _count: { select: { empleados: { where: { activo: true } } } },
        },
        orderBy: { razonSocial: 'asc' },
      }),
      prisma.empresa.count({ where }),
    ]);

    res.json({
      data: empresas,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/empresas/:id
router.get('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
      include: {
        convenio: true,
        _count: { select: { empleados: { where: { activo: true } } } },
      },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(empresa);
  } catch (err) {
    next(err);
  }
});

// POST /api/empresas
router.post('/', auth, [...empresaValidations, validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.create({
      data: { ...req.body, estudioId: req.usuario.estudioId },
      include: { convenio: true },
    });
    res.status(201).json(empresa);
  } catch (err) {
    next(err);
  }
});

// PUT /api/empresas/:id
router.put('/:id', auth, [param('id').isUUID(), ...empresaValidations, validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const updated = await prisma.empresa.update({
      where: { id: req.params.id },
      data: req.body,
      include: { convenio: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/empresas/:id/recibo-config
router.patch('/:id/recibo-config', auth, [
  param('id').isUUID(),
  body('reciboColor').optional().isString(),
  body('reciboLayout').optional().isIn(['CLASICO', 'MINIMAL']),
  body('reciboMostrarQR').optional(),
  body('reciboMostrarDuplicado').optional(),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const data = {};
    if (req.body.reciboColor !== undefined) {
      const color = String(req.body.reciboColor || '').trim();
      data.reciboColor = color.length > 0 ? color : null;
    }
    if (req.body.reciboLayout !== undefined) data.reciboLayout = req.body.reciboLayout;
    if (req.body.reciboMostrarQR !== undefined) data.reciboMostrarQR = toBool(req.body.reciboMostrarQR);
    if (req.body.reciboMostrarDuplicado !== undefined) data.reciboMostrarDuplicado = toBool(req.body.reciboMostrarDuplicado);

    const updated = await prisma.empresa.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/empresas/:id/logo
router.post('/:id/logo', auth, [param('id').isUUID(), validate], uploadLogo.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const updated = await prisma.empresa.update({
      where: { id: req.params.id },
      data: { logo: req.file.filename },
    });
    res.json({ logo: updated.logo, url: `/uploads/${updated.logo}` });
  } catch (err) {
    next(err);
  }
});

// POST /api/empresas/:id/recibo-firma
router.post('/:id/recibo-firma', auth, [param('id').isUUID(), validate], uploadFirma.single('firma'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const updated = await prisma.empresa.update({
      where: { id: req.params.id },
      data: { reciboFirma: req.file.filename },
    });
    res.json({ reciboFirma: updated.reciboFirma, url: `/uploads/${updated.reciboFirma}` });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/empresas/:id/recibo-firma
router.delete('/:id/recibo-firma', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const updated = await prisma.empresa.update({
      where: { id: req.params.id },
      data: { reciboFirma: null },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/empresas/:id (desactivar)
router.delete('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    await prisma.empresa.update({ where: { id: req.params.id }, data: { activa: false } });
    res.json({ message: 'Empresa desactivada' });
  } catch (err) {
    next(err);
  }
});

// GET /api/empresas/:id/periodos
router.get('/:id/periodos', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const periodos = await prisma.periodoLiquidacion.findMany({
      where: { empresaId: req.params.id },
      include: { _count: { select: { liquidaciones: true } } },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 24,
    });
    res.json(periodos);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
