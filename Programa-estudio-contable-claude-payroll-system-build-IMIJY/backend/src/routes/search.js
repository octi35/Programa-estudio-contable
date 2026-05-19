const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');


// GET /api/search?q=texto
// Busca en empleados, empresas y comprobantes IVA del estudio actual.
// Devuelve hasta 5 resultados por categoría.
router.get('/', auth, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ empleados: [], empresas: [], comprobantes: [], total: 0 });
    }

    const estudioId = req.usuario.estudioId;
    const TAKE = 5;

    const [empleados, empresas, comprobantes] = await Promise.all([
      prisma.empleado.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            { apellido: { contains: q, mode: 'insensitive' } },
            { nombre: { contains: q, mode: 'insensitive' } },
            { cuil: { contains: q } },
            { dni: { contains: q } },
            { legajoNumero: { contains: q } },
          ],
        },
        select: {
          id: true, apellido: true, nombre: true, cuil: true, legajoNumero: true, activo: true,
          empresa: { select: { id: true, razonSocial: true } },
        },
        take: TAKE,
        orderBy: [{ apellido: 'asc' }],
      }),

      prisma.empresa.findMany({
        where: {
          estudioId,
          OR: [
            { razonSocial: { contains: q, mode: 'insensitive' } },
            { nombreFantasia: { contains: q, mode: 'insensitive' } },
            { cuit: { contains: q } },
          ],
        },
        select: { id: true, razonSocial: true, nombreFantasia: true, cuit: true, activa: true },
        take: TAKE,
        orderBy: [{ razonSocial: 'asc' }],
      }),

      prisma.comprobanteIVA.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            // Número exacto cuando q es numérico
            ...(/^\d+$/.test(q) ? [{ numero: Number(q) }] : []),
            { proveedorCliente: { razonSocial: { contains: q, mode: 'insensitive' } } },
            { proveedorCliente: { cuit: { contains: q } } },
          ],
        },
        select: {
          id: true, tipoComprobante: true, tipoMovimiento: true, puntoVenta: true, numero: true,
          fecha: true, total: true,
          empresa: { select: { id: true, razonSocial: true } },
          proveedorCliente: { select: { razonSocial: true, cuit: true } },
        },
        take: TAKE,
        orderBy: { fecha: 'desc' },
      }),
    ]);

    res.json({
      empleados: empleados.map(e => ({
        id: e.id,
        titulo: `${e.apellido}, ${e.nombre}`,
        subtitulo: `${e.cuil}${e.legajoNumero ? ` · Leg ${e.legajoNumero}` : ''} · ${e.empresa?.razonSocial || ''}`,
        ruta: `/empleados/${e.id}`,
        activo: e.activo,
      })),
      empresas: empresas.map(e => ({
        id: e.id,
        titulo: e.razonSocial,
        subtitulo: `CUIT: ${e.cuit}${e.nombreFantasia ? ` · ${e.nombreFantasia}` : ''}`,
        ruta: `/empresas/${e.id}`,
        activo: e.activa,
      })),
      comprobantes: comprobantes.map(c => ({
        id: c.id,
        titulo: `${c.tipoComprobante.replace(/_/g, ' ')} N° ${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`,
        subtitulo: `${c.tipoMovimiento} · ${c.proveedorCliente?.razonSocial || '—'} · ${c.empresa.razonSocial} · $${Number(c.total).toLocaleString('es-AR')}`,
        ruta: `/iva/comprobantes?id=${c.id}`,
      })),
      total: empleados.length + empresas.length + comprobantes.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
