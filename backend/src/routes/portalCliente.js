/**
 * Portal del cliente (la empresa del estudio).
 *
 * El estudio genera un link tokenizado (scope `portal-cliente`, 30 días)
 * desde la ficha de la empresa. Con ese link el cliente carga las novedades
 * del mes (horas extra, ausencias, premios, adelantos) en una grilla simple,
 * y al estudio le llegan como NovedadEmpleado listas para liquidar —
 * sin Excel por email ni tipeo manual.
 */

const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const validate = require('../middleware/validate');

// Tipos que el cliente puede cargar (subset seguro: nada de altas/bajas/sueldos)
const TIPOS_PERMITIDOS = [
  'HORA_EXTRA', 'LICENCIA', 'VACACIONES', 'SUSPENSION',
  'ADELANTO_SUELDO', 'DIAS_TRABAJADOS', 'PERSONALIZADA',
];

const PREFIJO_PORTAL = '[Portal cliente] ';

function verificarTokenCliente(req, res) {
  const token = req.query.token || req.body?.token;
  if (!token) {
    res.status(401).json({ error: 'Token de acceso requerido' });
    return null;
  }
  try {
    const decoded = jwt.verify(String(token), process.env.JWT_SECRET);
    if (decoded.scope !== 'portal-cliente' || !decoded.empresaId) {
      res.status(401).json({ error: 'Token inválido para el portal' });
      return null;
    }
    return decoded.empresaId;
  } catch {
    res.status(401).json({ error: 'El link expiró o no es válido. Pedí uno nuevo al estudio.' });
    return null;
  }
}

// GET /api/portal-cliente/mis-datos?token= — empresa + nómina + novedades recientes
router.get('/mis-datos', async (req, res, next) => {
  try {
    const empresaId = verificarTokenCliente(req, res);
    if (!empresaId) return;

    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true, razonSocial: true, cuit: true },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const empleados = await prisma.empleado.findMany({
      where: { empresaId, activo: true },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      select: { id: true, apellido: true, nombre: true, legajoNumero: true, categoria: true },
    });

    // Novedades cargadas vía portal en los últimos 60 días (para que el cliente vea qué ya envió)
    const desde = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const novedades = await prisma.novedadEmpleado.findMany({
      where: {
        empleado: { empresaId },
        descripcion: { startsWith: PREFIJO_PORTAL },
        createdAt: { gte: desde },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, tipo: true, descripcion: true, fechaDesde: true, fechaHasta: true,
        valor: true, createdAt: true,
        empleado: { select: { apellido: true, nombre: true } },
      },
    });

    res.json({ empresa, empleados, novedades, tiposPermitidos: TIPOS_PERMITIDOS });
  } catch (err) { next(err); }
});

// POST /api/portal-cliente/novedades — carga en lote desde la grilla
// Body: { token, novedades: [{ empleadoId, tipo, fechaDesde, fechaHasta?, valor?, descripcion? }] }
router.post('/novedades', [
  body('novedades').isArray({ min: 1, max: 200 }),
  body('novedades.*.empleadoId').isUUID(),
  body('novedades.*.tipo').isIn(TIPOS_PERMITIDOS),
  body('novedades.*.fechaDesde').isISO8601(),
  body('novedades.*.fechaHasta').optional({ values: 'falsy' }).isISO8601(),
  body('novedades.*.valor').optional({ values: 'null' }).isFloat({ min: 0 }),
  validate,
], async (req, res, next) => {
  try {
    const empresaId = verificarTokenCliente(req, res);
    if (!empresaId) return;

    const { novedades } = req.body;

    // Todos los empleados deben ser de ESTA empresa (el token no da acceso a otras)
    const ids = [...new Set(novedades.map(n => n.empleadoId))];
    const propios = await prisma.empleado.count({ where: { id: { in: ids }, empresaId, activo: true } });
    if (propios !== ids.length) {
      return res.status(403).json({ error: 'Hay empleados que no pertenecen a su empresa' });
    }

    const creadas = await prisma.novedadEmpleado.createMany({
      data: novedades.map(n => ({
        empleadoId: n.empleadoId,
        tipo: n.tipo,
        descripcion: PREFIJO_PORTAL + (n.descripcion?.trim() || n.tipo.replace(/_/g, ' ').toLowerCase()),
        fechaDesde: new Date(n.fechaDesde),
        fechaHasta: n.fechaHasta ? new Date(n.fechaHasta) : null,
        valor: n.valor != null ? Number(n.valor) : null,
      })),
    });

    res.status(201).json({ ok: true, creadas: creadas.count });
  } catch (err) { next(err); }
});

module.exports = router;
