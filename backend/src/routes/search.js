const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

const TAKE = 5;
const ESTADO_LIQ = { BORRADOR: 'Borrador', CALCULADO: 'Calculado', CONFIRMADO: 'Confirmado', ANULADO: 'Anulado' };

const fmtMoney = (n) => `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtFecha = (d) => new Date(d).toLocaleDateString('es-AR');

// GET /api/search?q=texto
// Búsqueda global en todas las entidades del estudio actual.
// Devuelve grupos ordenados, hasta 5 resultados por categoría.
router.get('/', auth, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ grupos: [], total: 0 });
    }

    const estudioId = req.usuario.estudioId;
    const esNumero = /^\d+$/.test(q);
    // Detecta "MM/YYYY" o "M/YYYY" para buscar liquidaciones por período
    const matchPeriodo = q.match(/^(\d{1,2})\/(\d{4})$/);

    const [
      empleados, empresas, liquidaciones, comprobantes, proveedores,
      facturasHonorarios, asientos, cuentasContables, conceptos, convenios,
      cuentasBancarias, movimientosBancarios, documentos, sucursales,
      presupuestos, usuarios,
    ] = await Promise.all([
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

      prisma.liquidacion.findMany({
        where: {
          empleado: { empresa: { estudioId } },
          OR: [
            ...(matchPeriodo ? [{ mes: Number(matchPeriodo[1]), anio: Number(matchPeriodo[2]) }] : []),
            { empleado: { apellido: { contains: q, mode: 'insensitive' } } },
            { empleado: { nombre: { contains: q, mode: 'insensitive' } } },
            { empleado: { cuil: { contains: q } } },
          ],
        },
        select: {
          id: true, anio: true, mes: true, tipo: true, estado: true, totalNeto: true,
          empleado: { select: { apellido: true, nombre: true } },
        },
        take: TAKE,
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      }),

      prisma.comprobanteIVA.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            ...(esNumero ? [{ numero: Number(q) }] : []),
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

      prisma.proveedorCliente.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            { razonSocial: { contains: q, mode: 'insensitive' } },
            { cuit: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, razonSocial: true, cuit: true, tipo: true, activo: true,
          empresa: { select: { razonSocial: true } },
        },
        take: TAKE,
        orderBy: [{ razonSocial: 'asc' }],
      }),

      prisma.facturaHonorarios.findMany({
        where: {
          estudioId,
          OR: [
            { numero: { contains: q, mode: 'insensitive' } },
            { concepto: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, numero: true, concepto: true, fecha: true, total: true, estado: true },
        take: TAKE,
        orderBy: { fecha: 'desc' },
      }),

      prisma.asiento.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            ...(esNumero ? [{ numero: Number(q) }] : []),
            { descripcion: { contains: q, mode: 'insensitive' } },
            { glosa: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, numero: true, descripcion: true, fecha: true, totalDebe: true, anulado: true,
          empresa: { select: { razonSocial: true } },
        },
        take: TAKE,
        orderBy: { fecha: 'desc' },
      }),

      prisma.cuentaContable.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            { codigo: { startsWith: q } },
            { nombre: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, codigo: true, nombre: true, tipo: true, activa: true,
          empresa: { select: { razonSocial: true } },
        },
        take: TAKE,
        orderBy: [{ codigo: 'asc' }],
      }),

      prisma.concepto.findMany({
        where: {
          OR: [
            { codigo: { contains: q, mode: 'insensitive' } },
            { nombre: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, codigo: true, nombre: true, tipo: true, activo: true },
        take: TAKE,
        orderBy: [{ codigo: 'asc' }],
      }),

      prisma.convenio.findMany({
        where: {
          OR: [
            { codigo: { contains: q, mode: 'insensitive' } },
            { nombre: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, codigo: true, nombre: true, activo: true },
        take: TAKE,
        orderBy: [{ codigo: 'asc' }],
      }),

      prisma.cuentaBancaria.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            { banco: { contains: q, mode: 'insensitive' } },
            { numeroCuenta: { contains: q } },
            { cbu: { contains: q } },
            { alias: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, banco: true, numeroCuenta: true, tipoCuenta: true, alias: true, activa: true,
          empresa: { select: { razonSocial: true } },
        },
        take: TAKE,
        orderBy: [{ banco: 'asc' }],
      }),

      prisma.movimientoBancario.findMany({
        where: {
          cuentaBancaria: { empresa: { estudioId } },
          OR: [
            { descripcion: { contains: q, mode: 'insensitive' } },
            { referencia: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, descripcion: true, fecha: true, debe: true, haber: true, cuentaBancariaId: true,
          cuentaBancaria: { select: { banco: true } },
        },
        take: TAKE,
        orderBy: { fecha: 'desc' },
      }),

      prisma.documento.findMany({
        where: {
          OR: [
            { empresa: { estudioId } },
            { empleado: { empresa: { estudioId } } },
          ],
          AND: {
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { descripcion: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
        select: {
          id: true, nombre: true, tipo: true, empresaId: true, empleadoId: true,
          empresa: { select: { razonSocial: true } },
          empleado: { select: { apellido: true, nombre: true } },
        },
        take: TAKE,
        orderBy: { createdAt: 'desc' },
      }),

      prisma.sucursal.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { codigo: { contains: q, mode: 'insensitive' } },
            { localidad: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, nombre: true, codigo: true, localidad: true, activa: true,
          empresa: { select: { razonSocial: true } },
        },
        take: TAKE,
        orderBy: [{ nombre: 'asc' }],
      }),

      prisma.presupuesto.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            ...(esNumero ? [{ anio: Number(q) }] : []),
            { nombre: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, nombre: true, anio: true,
          empresa: { select: { razonSocial: true } },
        },
        take: TAKE,
        orderBy: { anio: 'desc' },
      }),

      // Usuarios: solo visibles para administradores
      req.usuario.rol === 'ADMIN'
        ? prisma.usuario.findMany({
            where: {
              estudioId,
              OR: [
                { nombre: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
            select: { id: true, nombre: true, email: true, rol: true, activo: true },
            take: TAKE,
            orderBy: [{ nombre: 'asc' }],
          })
        : Promise.resolve([]),
    ]);

    const grupos = [
      {
        key: 'empleados', label: 'Empleados',
        items: empleados.map(e => ({
          id: e.id,
          titulo: `${e.apellido}, ${e.nombre}`,
          subtitulo: `${e.cuil}${e.legajoNumero ? ` · Leg ${e.legajoNumero}` : ''} · ${e.empresa?.razonSocial || ''}`,
          ruta: `/empleados/${e.id}`,
          activo: e.activo,
        })),
      },
      {
        key: 'empresas', label: 'Empresas',
        items: empresas.map(e => ({
          id: e.id,
          titulo: e.razonSocial,
          subtitulo: `CUIT: ${e.cuit}${e.nombreFantasia ? ` · ${e.nombreFantasia}` : ''}`,
          ruta: `/empresas/${e.id}`,
          activo: e.activa,
        })),
      },
      {
        key: 'liquidaciones', label: 'Liquidaciones',
        items: liquidaciones.map(l => ({
          id: l.id,
          titulo: `${l.empleado.apellido}, ${l.empleado.nombre} · ${String(l.mes).padStart(2, '0')}/${l.anio}`,
          subtitulo: `${l.tipo.replace(/_/g, ' ')} · ${ESTADO_LIQ[l.estado] || l.estado} · Neto ${fmtMoney(l.totalNeto)}`,
          ruta: `/liquidaciones/${l.id}`,
        })),
      },
      {
        key: 'comprobantes', label: 'Comprobantes IVA',
        items: comprobantes.map(c => ({
          id: c.id,
          titulo: `${c.tipoComprobante.replace(/_/g, ' ')} N° ${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`,
          subtitulo: `${c.tipoMovimiento} · ${c.proveedorCliente?.razonSocial || '—'} · ${c.empresa.razonSocial} · ${fmtMoney(c.total)}`,
          ruta: `/iva/comprobantes?id=${c.id}`,
        })),
      },
      {
        key: 'proveedores', label: 'Proveedores / Clientes',
        items: proveedores.map(p => ({
          id: p.id,
          titulo: p.razonSocial,
          subtitulo: `${p.tipo}${p.cuit ? ` · CUIT: ${p.cuit}` : ''} · ${p.empresa.razonSocial}`,
          ruta: `/iva/proveedores?id=${p.id}`,
          activo: p.activo,
        })),
      },
      {
        key: 'facturasHonorarios', label: 'Facturas de Honorarios',
        items: facturasHonorarios.map(f => ({
          id: f.id,
          titulo: `${f.numero ? `Factura ${f.numero}` : 'Factura s/n'} · ${f.concepto}`,
          subtitulo: `${fmtFecha(f.fecha)} · ${f.estado} · ${fmtMoney(f.total)}`,
          ruta: `/honorarios?id=${f.id}`,
        })),
      },
      {
        key: 'asientos', label: 'Asientos Contables',
        items: asientos.map(a => ({
          id: a.id,
          titulo: `${a.numero ? `Asiento N° ${a.numero} · ` : ''}${a.descripcion}`,
          subtitulo: `${fmtFecha(a.fecha)} · ${a.empresa.razonSocial} · ${fmtMoney(a.totalDebe)}${a.anulado ? ' · ANULADO' : ''}`,
          ruta: `/contabilidad/asientos?id=${a.id}`,
        })),
      },
      {
        key: 'cuentasContables', label: 'Plan de Cuentas',
        items: cuentasContables.map(c => ({
          id: c.id,
          titulo: `${c.codigo} · ${c.nombre}`,
          subtitulo: `${c.tipo.replace(/_/g, ' ')} · ${c.empresa.razonSocial}`,
          ruta: `/contabilidad/cuentas?id=${c.id}`,
          activo: c.activa,
        })),
      },
      {
        key: 'conceptos', label: 'Conceptos de Sueldo',
        items: conceptos.map(c => ({
          id: c.id,
          titulo: `${c.codigo} · ${c.nombre}`,
          subtitulo: c.tipo.replace(/_/g, ' '),
          ruta: `/conceptos?id=${c.id}`,
          activo: c.activo,
        })),
      },
      {
        key: 'convenios', label: 'Convenios (CCT)',
        items: convenios.map(c => ({
          id: c.id,
          titulo: `${c.codigo} · ${c.nombre}`,
          subtitulo: 'Convenio colectivo de trabajo',
          ruta: `/convenios?id=${c.id}`,
          activo: c.activo,
        })),
      },
      {
        key: 'cuentasBancarias', label: 'Cuentas Bancarias',
        items: cuentasBancarias.map(c => ({
          id: c.id,
          titulo: `${c.banco} · ${c.numeroCuenta}`,
          subtitulo: `${c.tipoCuenta.replace(/_/g, ' ')}${c.alias ? ` · ${c.alias}` : ''} · ${c.empresa.razonSocial}`,
          ruta: `/bancos?id=${c.id}`,
          activo: c.activa,
        })),
      },
      {
        key: 'movimientosBancarios', label: 'Movimientos Bancarios',
        items: movimientosBancarios.map(m => ({
          id: m.id,
          titulo: m.descripcion,
          subtitulo: `${fmtFecha(m.fecha)} · ${m.cuentaBancaria.banco} · ${Number(m.debe) > 0 ? `Debe ${fmtMoney(m.debe)}` : `Haber ${fmtMoney(m.haber)}`}`,
          ruta: `/bancos?cuenta=${m.cuentaBancariaId}`,
        })),
      },
      {
        key: 'documentos', label: 'Documentos',
        items: documentos.map(d => ({
          id: d.id,
          titulo: d.nombre,
          subtitulo: `${d.tipo.replace(/_/g, ' ')} · ${d.empleado ? `${d.empleado.apellido}, ${d.empleado.nombre}` : d.empresa?.razonSocial || '—'}`,
          ruta: d.empleadoId ? `/empleados/${d.empleadoId}` : `/empresas/${d.empresaId}`,
        })),
      },
      {
        key: 'sucursales', label: 'Sucursales',
        items: sucursales.map(s => ({
          id: s.id,
          titulo: s.nombre,
          subtitulo: `${s.codigo ? `${s.codigo} · ` : ''}${s.localidad ? `${s.localidad} · ` : ''}${s.empresa.razonSocial}`,
          ruta: `/sucursales?id=${s.id}`,
          activo: s.activa,
        })),
      },
      {
        key: 'presupuestos', label: 'Presupuestos',
        items: presupuestos.map(p => ({
          id: p.id,
          titulo: `${p.nombre} (${p.anio})`,
          subtitulo: p.empresa.razonSocial,
          ruta: `/presupuesto?id=${p.id}`,
        })),
      },
      {
        key: 'usuarios', label: 'Usuarios',
        items: usuarios.map(u => ({
          id: u.id,
          titulo: u.nombre,
          subtitulo: `${u.email} · ${u.rol}`,
          ruta: `/usuarios?id=${u.id}`,
          activo: u.activo,
        })),
      },
    ].filter(g => g.items.length > 0);

    res.json({
      grupos,
      total: grupos.reduce((acc, g) => acc + g.items.length, 0),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
