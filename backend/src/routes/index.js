const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const empresasRoutes = require('./empresas');
const empleadosRoutes = require('./empleados');
const conveniosRoutes = require('./convenios');
const conceptosRoutes = require('./conceptos');
const liquidacionesRoutes = require('./liquidaciones');
const documentosRoutes = require('./documentos');
const reportesRoutes = require('./reportes');

router.use('/auth', authRoutes);
router.use('/empresas', empresasRoutes);
router.use('/empleados', empleadosRoutes);
router.use('/convenios', conveniosRoutes);
router.use('/conceptos', conceptosRoutes);
router.use('/liquidaciones', liquidacionesRoutes);
router.use('/documentos', documentosRoutes);
router.use('/reportes', reportesRoutes);

module.exports = router;
