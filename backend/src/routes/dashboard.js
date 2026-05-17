const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const dayjs = require('dayjs');


// Tope de la categoría más alta del Monotributo (categorías 2024)
const TOPES_MONOTRIBUTO = {
  A: 6450000,  B: 9450000,  C: 13250000, D: 16450000, E: 19350000, F: 24250000,
  G: 29000000, H: 44000000, I: 49250000, J: 56400000, K: 68000000,
};

// GET /api/dashboard/pendientes
// Devuelve todos los pendientes que requieren atención del contador
router.get('/pendientes', auth, async (req, res, next) => {
  try {
    const estudioId = req.usuario.estudioId;
    const hoy = dayjs().startOf('day');
    const hoyMas7 = hoy.add(7, 'day').endOf('day');

    // ── 1) Vencimientos próximos (próximos 7 días) — calculados desde rutina de vencimientos
    // Reutilizamos la lógica de vencimientos.js que calcula por terminación de CUIT
    const empresas = await prisma.empresa.findMany({
      where: { estudioId, activa: true },
      select: { id: true, razonSocial: true, cuit: true },
    });

    const anio = hoy.year();
    const mes = hoy.month() + 1; // mes actual
    const vencimientosProximos = [];

    const VENC_POR_CUIT = { '0': 12, '1': 12, '2': 13, '3': 13, '4': 14, '5': 14, '6': 15, '7': 15, '8': 16, '9': 16 };
    const ultimoDigitoCuit = (cuit) => (cuit || '').replace(/[-\s]/g, '').slice(-1) || '0';

    for (const emp of empresas) {
      const digito = ultimoDigitoCuit(emp.cuit);
      const diaBase = VENC_POR_CUIT[digito] || 15;
      const mesRef = dayjs(`${anio}-${String(mes).padStart(2, '0')}-01`);
      const mesSig = mesRef.add(1, 'month');

      const venc = [
        { tipo: 'F931', descripcion: `F.931 ${mesRef.format('MM/YYYY')}`, fecha: mesSig.date(diaBase) },
        { tipo: 'IVA',  descripcion: `IVA ${mesRef.format('MM/YYYY')}`,  fecha: mesSig.date(diaBase) },
        { tipo: 'IIBB', descripcion: `IIBB ${mesRef.format('MM/YYYY')}`, fecha: mesSig.date(15) },
        { tipo: 'MONOTRIBUTO', descripcion: `Cuota Monotributo ${mesSig.format('MM/YYYY')}`, fecha: mesSig.date(20) },
        { tipo: 'SUELDOS', descripcion: `Pago haberes ${mesRef.format('MM/YYYY')}`, fecha: mesSig.date(4) },
      ];

      for (const v of venc) {
        // Considera "próximos" los que vencen hasta hoy+7 días y todavía no han vencido
        if (v.fecha.isAfter(hoy.subtract(1, 'day')) && v.fecha.isBefore(hoyMas7)) {
          vencimientosProximos.push({
            empresaId: emp.id,
            empresa: emp.razonSocial,
            tipo: v.tipo,
            descripcion: v.descripcion,
            fecha: v.fecha.toISOString(),
            diasRestantes: v.fecha.diff(hoy, 'day'),
          });
        }
      }
    }
    vencimientosProximos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // ── 2) Liquidaciones sin confirmar (estado CALCULADO)
    const liquidacionesSinConfirmar = await prisma.liquidacion.findMany({
      where: {
        estado: 'CALCULADO',
        periodo: { empresa: { estudioId } },
      },
      select: {
        id: true, anio: true, mes: true, tipo: true, totalNeto: true,
        empleado: { select: { id: true, apellido: true, nombre: true, cuil: true } },
        periodo: { select: { empresaId: true, empresa: { select: { id: true, razonSocial: true } } } },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 50,
    });

    // ── 3) Empleados con novedad que requiera atención
    const novedades = await prisma.novedadEmpleado.findMany({
      where: {
        tipo: { in: ['SUSPENSION', 'BAJA', 'VACACIONES'] },
        empleado: { empresa: { estudioId } },
        OR: [
          { fechaHasta: null },
          { fechaHasta: { gte: hoy.toDate() } },
        ],
      },
      select: {
        id: true, tipo: true, descripcion: true, fechaDesde: true, fechaHasta: true,
        empleado: {
          select: {
            id: true, apellido: true, nombre: true, cuil: true,
            empresa: { select: { id: true, razonSocial: true } },
          },
        },
      },
      orderBy: { fechaDesde: 'desc' },
      take: 30,
    });

    const empleadosConNovedad = novedades.map(n => ({
      novedadId: n.id,
      tipo: n.tipo,
      descripcion: n.descripcion,
      fechaDesde: n.fechaDesde,
      fechaHasta: n.fechaHasta,
      empleadoId: n.empleado.id,
      empleadoNombre: `${n.empleado.apellido}, ${n.empleado.nombre}`,
      cuil: n.empleado.cuil,
      empresa: n.empleado.empresa?.razonSocial,
      empresaId: n.empleado.empresa?.id,
    }));

    // ── 4) Alertas Monotributo — clientes que superan o casi superan el tope de su categoría
    // Optimización: una sola query groupBy en vez de N queries (una por monotributista)
    const monos = await prisma.monotributoCliente.findMany({
      where: { activo: true, empresa: { estudioId } },
      include: { empresa: { select: { id: true, razonSocial: true, cuit: true } } },
    });

    const alertasMonotributo = [];
    const enero = dayjs(`${anio}-01-01`).toDate();
    const diciembre = dayjs(`${anio}-12-31`).endOf('day').toDate();

    if (monos.length > 0) {
      const empresaIds = monos.map(m => m.empresaId);
      const agregados = await prisma.comprobanteIVA.groupBy({
        by: ['empresaId'],
        where: {
          empresaId: { in: empresaIds },
          tipoMovimiento: 'VENTA',
          anulado: false,
          fecha: { gte: enero, lte: diciembre },
        },
        _sum: {
          netoGravado21: true, netoGravado105: true, netoGravado27: true,
          netoNoGravado: true, exento: true, iva21: true, iva105: true, iva27: true,
        },
      });

      const facturadoPorEmpresa = {};
      for (const agg of agregados) {
        facturadoPorEmpresa[agg.empresaId] = ['netoGravado21','netoGravado105','netoGravado27','netoNoGravado','exento','iva21','iva105','iva27']
          .reduce((s, k) => s + Number(agg._sum[k] || 0), 0);
      }

      for (const m of monos) {
        const tope = TOPES_MONOTRIBUTO[m.categoriaActual];
        if (!tope) continue;
        const facturado = facturadoPorEmpresa[m.empresaId] || 0;
        const porcentaje = (facturado / tope) * 100;
        if (porcentaje >= 80) {
          alertasMonotributo.push({
            empresaId: m.empresaId,
            empresa: m.empresa.razonSocial,
            cuit: m.empresa.cuit,
            categoriaActual: m.categoriaActual,
            topeCategoria: tope,
            facturadoAnio: facturado,
            porcentaje: Math.round(porcentaje * 10) / 10,
            superaTope: porcentaje >= 100,
          });
        }
      }
    }

    res.json({
      vencimientosProximos,
      liquidacionesSinConfirmar,
      empleadosConNovedad,
      alertasMonotributo,
      resumen: {
        vencimientos: vencimientosProximos.length,
        liquidaciones: liquidacionesSinConfirmar.length,
        novedades: empleadosConNovedad.length,
        alertasMono: alertasMonotributo.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
