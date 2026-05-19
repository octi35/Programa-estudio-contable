/**
 * Rutas AFIP — Padrón, validación de CUIT, conectividad
 */
const express = require('express');
const router = express.Router();
const { auth, requireRol } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { consultarCUIT, verificarConectividad } = require('../services/afip/afipService');
const { evaluarFormula, validarFormula, evaluarConceptos } = require('../services/sueldos/motorFormulas');

// GET /api/afip/padron/:cuit — busca razón social y domicilio desde el padrón
router.get('/padron/:cuit', auth, async (req, res, next) => {
  try {
    const { cuit } = req.params;
    const cuitEstudio = req.usuario.estudio?.cuit || process.env.AFIP_CUIT_DEFAULT;

    if (!cuitEstudio) {
      return res.status(400).json({ error: 'Configure el CUIT del estudio en Perfil del Estudio antes de consultar el padrón.' });
    }

    const datos = await consultarCUIT(cuit, cuitEstudio);
    res.json({ ok: true, datos });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

// GET /api/afip/estado — ping a los servidores de AFIP
router.get('/estado', auth, async (req, res) => {
  const resultado = await verificarConectividad();
  res.json(resultado);
});

// POST /api/afip/formulas/evaluar — evalúa una fórmula con variables del empleado
router.post('/formulas/evaluar', auth, (req, res) => {
  const { formula, variables } = req.body;
  if (!formula) return res.status(400).json({ error: 'formula requerida' });
  const resultado = evaluarFormula(formula, variables || {});
  res.json(resultado);
});

// POST /api/afip/formulas/validar — valida sintaxis sin datos reales
router.post('/formulas/validar', auth, (req, res) => {
  const { formula } = req.body;
  if (!formula) return res.status(400).json({ error: 'formula requerida' });
  res.json(validarFormula(formula));
});

// POST /api/afip/formulas/conceptos — evalúa lista de conceptos con scope acumulado
router.post('/formulas/conceptos', auth, (req, res) => {
  const { conceptos, variables } = req.body;
  if (!Array.isArray(conceptos)) return res.status(400).json({ error: 'conceptos debe ser un array' });
  res.json(evaluarConceptos(conceptos, variables || {}));
});

// ─── E-VENTANILLA AFIP ────────────────────────────────────────────────────────

// GET /api/afip/notificaciones?empresaId=&soloNoLeidas=true&prioridad=
router.get('/notificaciones', auth, async (req, res, next) => {
  try {
    const { empresaId, soloNoLeidas, prioridad, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { empresa: { estudioId: req.usuario.estudioId } };
    if (empresaId) where.empresaId = empresaId;
    if (soloNoLeidas === 'true') where.leida = false;
    if (prioridad) where.prioridad = prioridad;

    const [data, total, noLeidas] = await Promise.all([
      prisma.notificacionAfip.findMany({
        where,
        include: { empresa: { select: { id: true, razonSocial: true, cuit: true } } },
        orderBy: [{ prioridad: 'asc' }, { fechaAfip: 'desc' }],
        skip, take: Number(limit),
      }),
      prisma.notificacionAfip.count({ where }),
      prisma.notificacionAfip.count({ where: { ...where, leida: false } }),
    ]);

    res.json({ data, pagination: { total, page: Number(page), limit: Number(limit) }, noLeidas });
  } catch (err) { next(err); }
});

// PUT /api/afip/notificaciones/:id/leer  body: { leida: true|false }
router.put('/notificaciones/:id/leer', auth, async (req, res, next) => {
  try {
    const existe = await prisma.notificacionAfip.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existe) return res.status(404).json({ error: 'No encontrada' });
    const upd = await prisma.notificacionAfip.update({
      where: { id: req.params.id },
      data: { leida: req.body.leida !== false },
    });
    res.json(upd);
  } catch (err) { next(err); }
});

// PUT /api/afip/notificaciones/marcar-todas-leidas?empresaId=
router.put('/notificaciones/marcar-todas-leidas', auth, async (req, res, next) => {
  try {
    const { empresaId } = req.query;
    const where = { empresa: { estudioId: req.usuario.estudioId }, leida: false };
    if (empresaId) where.empresaId = empresaId;
    const r = await prisma.notificacionAfip.updateMany({ where, data: { leida: true } });
    res.json({ marcadas: r.count });
  } catch (err) { next(err); }
});

// POST /api/afip/notificaciones/sincronizar — fuerza una sincronización on-demand
router.post('/notificaciones/sincronizar', auth, requireRol('ADMIN', 'CONTADOR'), async (req, res, next) => {
  try {
    const { empresaId } = req.body;
    const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
    if (!estudio) return res.status(404).json({ error: 'Estudio no encontrado' });

    if (empresaId) {
      const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: estudio.id } });
      if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
      const { sincronizarEmpresa } = require('../services/afip/afipEVentanillaService');
      const r = await sincronizarEmpresa(estudio, empresa);
      return res.json({ empresa: empresa.razonSocial, ...r });
    }
    const { ejecutarSyncEVentanilla } = require('../services/cronEVentanilla');
    const resumen = await ejecutarSyncEVentanilla();
    res.json({ resumen, total: resumen.length });
  } catch (err) { next(err); }
});

// ─── FACTURACIÓN ELECTRÓNICA MASIVA (HONORARIOS) ──────────────────────────────

// POST /api/afip/facturar-honorarios
// Body: { facturaIds?: string[], items?: [{empresaId, importeNeto, importeIVA, concepto, fecha}], simulado?: boolean }
// Si vienen facturaIds, busca esas FacturaHonorarios PENDIENTES y las factura.
// Si vienen items, los emite directamente sin tocar FacturaHonorarios.
router.post('/facturar-honorarios', auth, requireRol('ADMIN', 'CONTADOR'), async (req, res, next) => {
  try {
    const { facturaIds, items: itemsManuales, simulado } = req.body;

    const estudio = await prisma.estudio.findUnique({ where: { id: req.usuario.estudioId } });
    if (!estudio) return res.status(404).json({ error: 'Estudio no encontrado' });

    let items = itemsManuales || [];

    if (Array.isArray(facturaIds) && facturaIds.length > 0) {
      const facturas = await prisma.facturaHonorarios.findMany({
        where: { id: { in: facturaIds }, estudioId: estudio.id, estado: 'PENDIENTE' },
      });
      if (facturas.length === 0) {
        return res.status(404).json({ error: 'No se encontraron facturas pendientes con esos IDs' });
      }
      items = facturas.map(f => ({
        empresaId: f.empresaId,
        facturaHonorariosId: f.id,
        importeNeto: Number(f.subtotal),
        importeIVA: Number(f.iva),
        importeTotal: Number(f.total),
        concepto: f.concepto || `Honorarios ${f.mes}/${f.anio}`,
        fecha: f.fecha,
      }));
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'Debe proveer facturaIds o items' });
    }

    const { facturarMasivo } = require('../services/afip/afipFacturacionService');
    const resultado = await facturarMasivo(estudio, items, { simulado: simulado === true });

    res.json({
      total: items.length,
      exitosos: resultado.exitosos.length,
      errores: resultado.errores.length,
      detalle: resultado,
    });
  } catch (err) { next(err); }
});

// POST /api/afip/facturar-honorarios/preview
// Calcula qué facturas serían emitidas sin emitir realmente.
router.post('/facturar-honorarios/preview', auth, async (req, res, next) => {
  try {
    const { facturaIds } = req.body;
    if (!Array.isArray(facturaIds) || facturaIds.length === 0) {
      return res.status(400).json({ error: 'facturaIds requerido' });
    }
    const facturas = await prisma.facturaHonorarios.findMany({
      where: { id: { in: facturaIds }, estudioId: req.usuario.estudioId },
    });
    const totales = facturas.reduce((acc, f) => ({
      cantidad: acc.cantidad + 1,
      neto: acc.neto + Number(f.subtotal),
      iva: acc.iva + Number(f.iva),
      total: acc.total + Number(f.total),
      pendientes: acc.pendientes + (f.estado === 'PENDIENTE' ? 1 : 0),
    }), { cantidad: 0, neto: 0, iva: 0, total: 0, pendientes: 0 });
    res.json({ facturas, totales });
  } catch (err) { next(err); }
});

module.exports = router;
