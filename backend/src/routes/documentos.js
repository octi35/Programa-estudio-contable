const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const lsdService = require('../services/lsdService');

const prisma = new PrismaClient();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads');
    require('fs').mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls', '.txt', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido'));
  },
});

// POST /api/documentos/upload
router.post('/upload', auth, upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const { tipo, descripcion, empleadoId, empresaId, anio, mes } = req.body;
    const documento = await prisma.documento.create({
      data: {
        tipo: tipo || 'OTRO',
        nombre: req.file.originalname,
        descripcion,
        url: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        tamanio: req.file.size,
        empleadoId: empleadoId || null,
        empresaId: empresaId || null,
        anio: anio ? Number(anio) : null,
        mes: mes ? Number(mes) : null,
      },
    });
    res.status(201).json(documento);
  } catch (err) {
    next(err);
  }
});

// GET /api/documentos/lsd/:empresaId/:anio/:mes
router.get('/lsd/:empresaId/:anio/:mes', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.params;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
      include: { convenio: true },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: {
        periodo: { empresaId, anio: Number(anio), mes: Number(mes) },
        estado: { in: ['CALCULADO', 'CONFIRMADO'] },
      },
      include: {
        empleado: true,
        detalles: { orderBy: { orden: 'asc' } },
      },
    });

    if (liquidaciones.length === 0) {
      return res.status(404).json({ error: 'No hay liquidaciones para este período' });
    }

    const buffer = await lsdService.generarLSD(empresa, liquidaciones, Number(anio), Number(mes));
    const filename = `LSD_${empresa.cuit.replace(/-/g, '')}_${anio}${String(mes).padStart(2, '0')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// GET /api/documentos/f931/:empresaId/:anio/:mes
router.get('/f931/:empresaId/:anio/:mes', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.params;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: {
        periodo: { empresaId, anio: Number(anio), mes: Number(mes) },
        estado: { in: ['CALCULADO', 'CONFIRMADO'] },
      },
      include: { empleado: true },
    });

    const contenido = lsdService.generarF931(empresa, liquidaciones, Number(anio), Number(mes));
    const filename = `F931_${empresa.cuit.replace(/-/g, '')}_${anio}${String(mes).padStart(2, '0')}.txt`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(contenido);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
