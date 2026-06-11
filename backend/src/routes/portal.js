/**
 * Portal del empleado (self-service, sin usuario del estudio).
 *
 * El estudio genera un link con token firmado (scope `portal-empleado`,
 * validez 30 días) desde la ficha del empleado. Con ese link el empleado:
 *   - ve sus recibos confirmados
 *   - los descarga en PDF
 *   - firma conformidad (queda fecha + IP en la liquidación)
 */

const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { param } = require('express-validator');
const validate = require('../middleware/validate');
const pdfService = require('../services/pdfService');

// Valida el token de portal y devuelve el empleadoId, o responde 401.
function verificarTokenPortal(req, res) {
  const token = req.query.token || req.body?.token;
  if (!token) {
    res.status(401).json({ error: 'Token de acceso requerido' });
    return null;
  }
  try {
    const decoded = jwt.verify(String(token), process.env.JWT_SECRET);
    if (decoded.scope !== 'portal-empleado' || !decoded.empleadoId) {
      res.status(401).json({ error: 'Token inválido para el portal' });
      return null;
    }
    return decoded.empleadoId;
  } catch {
    res.status(401).json({ error: 'El link expiró o no es válido. Pedí uno nuevo al estudio.' });
    return null;
  }
}

// GET /api/portal/mis-datos?token= — datos del empleado + recibos disponibles
router.get('/mis-datos', async (req, res, next) => {
  try {
    const empleadoId = verificarTokenPortal(req, res);
    if (!empleadoId) return;

    const empleado = await prisma.empleado.findUnique({
      where: { id: empleadoId },
      select: {
        id: true, apellido: true, nombre: true, cuil: true, legajoNumero: true,
        categoria: true, fechaIngreso: true,
        empresa: { select: { razonSocial: true, cuit: true } },
      },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const recibos = await prisma.liquidacion.findMany({
      where: { empleadoId, estado: 'CONFIRMADO' },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 36,
      select: {
        id: true, anio: true, mes: true, tipo: true,
        totalNeto: true, conformidadFecha: true,
      },
    });

    res.json({ empleado, recibos });
  } catch (err) { next(err); }
});

// GET /api/portal/recibo/:id?token= — PDF del recibo propio
router.get('/recibo/:id', [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empleadoId = verificarTokenPortal(req, res);
    if (!empleadoId) return;

    const liquidacion = await prisma.liquidacion.findFirst({
      where: { id: req.params.id, empleadoId, estado: 'CONFIRMADO' },
      include: {
        empleado: { include: { empresa: { include: { estudio: true, convenio: true } } } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' } },
      },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Recibo no encontrado' });

    const pdfBuffer = await pdfService.generarRecibo(liquidacion);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo_${liquidacion.anio}${String(liquidacion.mes).padStart(2, '0')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// POST /api/portal/recibo/:id/conformidad — firma de conformidad del empleado
router.post('/recibo/:id/conformidad', [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empleadoId = verificarTokenPortal(req, res);
    if (!empleadoId) return;

    const liquidacion = await prisma.liquidacion.findFirst({
      where: { id: req.params.id, empleadoId, estado: 'CONFIRMADO' },
      select: { id: true, conformidadFecha: true },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Recibo no encontrado' });
    if (liquidacion.conformidadFecha) {
      return res.status(409).json({ error: 'Este recibo ya fue firmado', conformidadFecha: liquidacion.conformidadFecha });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
    const upd = await prisma.liquidacion.update({
      where: { id: liquidacion.id },
      data: { conformidadFecha: new Date(), conformidadIp: ip },
      select: { id: true, conformidadFecha: true },
    });
    res.json({ ok: true, ...upd });
  } catch (err) { next(err); }
});

module.exports = router;
