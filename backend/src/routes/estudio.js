const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth, requireRol } = require('../middleware/auth');


const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `estudio_${req.usuario.estudioId}${ext}`);
  },
});

const upload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

// GET /api/estudio
router.get('/', auth, async (req, res, next) => {
  try {
    const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
    if (!estudio) return res.status(404).json({ error: 'Estudio no encontrado' });
    res.json(estudio);
  } catch (err) { next(err); }
});

// PUT /api/estudio
router.put('/', auth, requireRol('ADMIN'), async (req, res, next) => {
  try {
    const { razonSocial, cuit, matricula, direccion, telefono, email } = req.body;
    const updated = await prisma.estudio.update({
      where: { id: req.usuario.estudioId },
      data: { razonSocial, cuit, matricula, direccion, telefono, email },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// POST /api/estudio/logo
router.post('/logo', auth, requireRol('ADMIN'), upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    await prisma.estudio.update({ where: { id: req.usuario.estudioId }, data: { logo: req.file.filename } });
    res.json({ logo: req.file.filename, url: `/uploads/${req.file.filename}` });
  } catch (err) { next(err); }
});

module.exports = router;
