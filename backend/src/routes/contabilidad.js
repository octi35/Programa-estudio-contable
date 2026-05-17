const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { requireRol } = require('../middleware/auth');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');


// ─── PLAN DE CUENTAS ──────────────────────────────────────────────────────────

router.get('/cuentas', auth, async (req, res, next) => {
  try {
    const { empresaId, tipo, buscar } = req.query;
    const where = { empresa: { estudioId: req.usuario.estudioId } };
    if (empresaId) where.empresaId = empresaId;
    if (tipo) where.tipo = tipo;
    if (buscar) {
      where.OR = [
        { codigo: { contains: buscar } },
        { nombre: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    const cuentas = await prisma.cuentaContable.findMany({
      where,
      include: { cuentaPadre: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: { codigo: 'asc' },
    });
    res.json(cuentas);
  } catch (err) { next(err); }
});

router.post('/cuentas', auth, [
  body('empresaId').isUUID(),
  body('codigo').notEmpty(),
  body('nombre').notEmpty(),
  body('tipo').notEmpty(),
  body('naturaleza').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({ where: { id: req.body.empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const existing = await prisma.cuentaContable.findUnique({
      where: { empresaId_codigo: { empresaId: req.body.empresaId, codigo: req.body.codigo } },
    });
    if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese código' });

    const cuenta = await prisma.cuentaContable.create({ data: req.body });
    res.status(201).json(cuenta);
  } catch (err) { next(err); }
});

router.put('/cuentas/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.cuentaContable.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const { empresaId, ...data } = req.body;
    const updated = await prisma.cuentaContable.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/cuentas/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const cuenta = await prisma.cuentaContable.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: { lineasAsiento: { take: 1 } },
    });
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    if (cuenta.lineasAsiento.length > 0) {
      return res.status(409).json({ error: 'La cuenta tiene movimientos registrados y no puede eliminarse' });
    }
    await prisma.cuentaContable.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── EJERCICIOS CONTABLES ─────────────────────────────────────────────────────

router.get('/ejercicios', auth, async (req, res, next) => {
  try {
    const { empresaId } = req.query;
    const where = { empresa: { estudioId: req.usuario.estudioId } };
    if (empresaId) where.empresaId = empresaId;

    const ejercicios = await prisma.ejercicioContable.findMany({
      where,
      include: { _count: { select: { asientos: true } } },
      orderBy: { fechaInicio: 'desc' },
    });
    res.json(ejercicios);
  } catch (err) { next(err); }
});

router.post('/ejercicios', auth, [
  body('empresaId').isUUID(),
  body('nombre').notEmpty(),
  body('fechaInicio').isISO8601(),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({ where: { id: req.body.empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { empresaId, nombre, fechaInicio, fechaCierre } = req.body;
    const ejercicio = await prisma.ejercicioContable.create({
      data: { empresaId, nombre, fechaInicio: new Date(fechaInicio), fechaCierre: fechaCierre ? new Date(fechaCierre) : null },
    });
    res.status(201).json(ejercicio);
  } catch (err) { next(err); }
});

// POST /api/contabilidad/ejercicios/:id/cerrar — cierre contable con asiento automático
router.post('/ejercicios/:id/cerrar', auth, requireRol('ADMIN', 'CONTADOR'), [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const ejercicio = await prisma.ejercicioContable.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!ejercicio) return res.status(404).json({ error: 'Ejercicio no encontrado' });
    if (ejercicio.estado === 'CERRADO') return res.status(409).json({ error: 'El ejercicio ya está cerrado' });

    const empresaId = ejercicio.empresaId;

    // Busca cuentas de resultado con movimientos en este ejercicio
    const cuentasRes = await prisma.cuentaContable.findMany({
      where: { empresaId, tipo: { in: ['RESULTADO_POSITIVO', 'RESULTADO_NEGATIVO'] }, permiteMovimientos: true },
    });

    let asientoCierre = null;

    if (cuentasRes.length > 0) {
      const movLineas = await prisma.lineaAsiento.groupBy({
        by: ['cuentaContableId'],
        where: {
          cuentaContableId: { in: cuentasRes.map(c => c.id) },
          asiento: { ejercicioId: req.params.id, anulado: false },
        },
        _sum: { debe: true, haber: true },
      });

      const movMap = {};
      for (const l of movLineas) movMap[l.cuentaContableId] = { debe: parseFloat(l._sum.debe || 0), haber: parseFloat(l._sum.haber || 0) };

      // Busca cuenta Resultado del Ejercicio en Patrimonio Neto
      const ctaResult = await prisma.cuentaContable.findFirst({
        where: { empresaId, tipo: 'PATRIMONIO_NETO', nombre: { contains: 'resultado', mode: 'insensitive' }, permiteMovimientos: true },
      }) || await prisma.cuentaContable.findFirst({
        where: { empresaId, tipo: 'PATRIMONIO_NETO', permiteMovimientos: true },
        orderBy: { codigo: 'desc' },
      });

      const lineasCierre = [];
      let saldoNeto = 0; // positivo = ganancia, negativo = pérdida

      for (const c of cuentasRes) {
        const mov = movMap[c.id];
        if (!mov) continue;
        const saldo = mov.debe - mov.haber;
        if (Math.abs(saldo) < 0.01) continue;

        if (c.tipo === 'RESULTADO_NEGATIVO') {
          // Gasto (saldo deudor): cancelar con haber
          lineasCierre.push({ cuentaContableId: c.id, debe: 0, haber: Math.abs(saldo), descripcion: `Cierre ${c.nombre}`, orden: lineasCierre.length });
          saldoNeto -= Math.abs(saldo);
        } else {
          // Ingreso (saldo acreedor = haber > debe): cancelar con debe
          lineasCierre.push({ cuentaContableId: c.id, debe: Math.abs(saldo), haber: 0, descripcion: `Cierre ${c.nombre}`, orden: lineasCierre.length });
          saldoNeto += Math.abs(saldo);
        }
      }

      if (lineasCierre.length > 0 && ctaResult) {
        // Contrapartida en Resultado del Ejercicio
        if (saldoNeto >= 0) {
          lineasCierre.push({ cuentaContableId: ctaResult.id, debe: 0, haber: Math.abs(saldoNeto), descripcion: 'Resultado del ejercicio — ganancia', orden: lineasCierre.length });
        } else {
          lineasCierre.push({ cuentaContableId: ctaResult.id, debe: Math.abs(saldoNeto), haber: 0, descripcion: 'Resultado del ejercicio — pérdida', orden: lineasCierre.length });
        }

        const totalDebe = lineasCierre.reduce((s, l) => s + l.debe, 0);
        const totalHaber = lineasCierre.reduce((s, l) => s + l.haber, 0);
        const ultimo = await prisma.asiento.findFirst({ where: { empresaId, ejercicioId: req.params.id }, orderBy: { numero: 'desc' } });

        asientoCierre = await prisma.asiento.create({
          data: {
            empresaId, ejercicioId: req.params.id,
            numero: (ultimo?.numero || 0) + 1,
            fecha: new Date(),
            descripcion: `Asiento de cierre — ${ejercicio.nombre}`,
            origen: 'CIERRE',
            totalDebe: Math.round(totalDebe * 100) / 100,
            totalHaber: Math.round(totalHaber * 100) / 100,
            lineas: { create: lineasCierre },
          },
        });
      }
    }

    const updated = await prisma.ejercicioContable.update({
      where: { id: req.params.id },
      data: { estado: 'CERRADO', fechaCierre: new Date() },
    });

    res.json({ ejercicio: updated, asientoCierreId: asientoCierre?.id });
  } catch (err) { next(err); }
});

router.put('/ejercicios/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.ejercicioContable.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Ejercicio no encontrado' });

    const { empresaId, ...data } = req.body;
    if (data.fechaInicio) data.fechaInicio = new Date(data.fechaInicio);
    if (data.fechaCierre) data.fechaCierre = new Date(data.fechaCierre);
    const updated = await prisma.ejercicioContable.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── ASIENTOS CONTABLES ───────────────────────────────────────────────────────

router.get('/asientos', auth, async (req, res, next) => {
  try {
    const { empresaId, ejercicioId, origen, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { empresa: { estudioId: req.usuario.estudioId } };
    if (empresaId) where.empresaId = empresaId;
    if (ejercicioId) where.ejercicioId = ejercicioId;
    if (origen) where.origen = origen;

    const [data, total] = await Promise.all([
      prisma.asiento.findMany({
        where, skip, take: Number(limit),
        include: {
          lineas: {
            include: { cuentaContable: { select: { codigo: true, nombre: true } } },
            orderBy: { orden: 'asc' },
          },
        },
        orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
      }),
      prisma.asiento.count({ where }),
    ]);

    res.json({ data, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) { next(err); }
});

router.get('/asientos/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const asiento = await prisma.asiento.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: {
        lineas: {
          include: { cuentaContable: { select: { id: true, codigo: true, nombre: true, tipo: true, naturaleza: true } } },
          orderBy: { orden: 'asc' },
        },
        ejercicio: { select: { id: true, nombre: true } },
      },
    });
    if (!asiento) return res.status(404).json({ error: 'Asiento no encontrado' });
    res.json(asiento);
  } catch (err) { next(err); }
});

router.post('/asientos', auth, [
  body('empresaId').isUUID(),
  body('ejercicioId').isUUID(),
  body('fecha').isISO8601(),
  body('descripcion').notEmpty(),
  body('lineas').isArray({ min: 2 }),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, ejercicioId, fecha, descripcion, glosa, origen, origenId, lineas } = req.body;

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    // Valida balance debe = haber
    const totalDebe = lineas.reduce((s, l) => s + parseFloat(l.debe || 0), 0);
    const totalHaber = lineas.reduce((s, l) => s + parseFloat(l.haber || 0), 0);
    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      return res.status(400).json({ error: `Asiento desbalanceado: Debe $${totalDebe.toFixed(2)} ≠ Haber $${totalHaber.toFixed(2)}` });
    }

    // Número correlativo
    const ultimo = await prisma.asiento.findFirst({
      where: { empresaId, ejercicioId },
      orderBy: { numero: 'desc' },
    });
    const numero = (ultimo?.numero || 0) + 1;

    const asiento = await prisma.asiento.create({
      data: {
        empresaId, ejercicioId, fecha: new Date(fecha), numero, descripcion, glosa,
        origen: origen || 'MANUAL', origenId,
        totalDebe, totalHaber,
        lineas: { create: lineas.map((l, i) => ({ ...l, orden: i })) },
      },
      include: { lineas: { include: { cuentaContable: { select: { codigo: true, nombre: true } } } } },
    });

    res.status(201).json(asiento);
  } catch (err) { next(err); }
});

router.put('/asientos/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.asiento.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Asiento no encontrado' });
    if (existing.anulado) return res.status(409).json({ error: 'No se puede modificar un asiento anulado' });

    const { empresaId, ejercicioId, lineas, ...data } = req.body;
    if (data.fecha) data.fecha = new Date(data.fecha);

    if (lineas) {
      const totalDebe = lineas.reduce((s, l) => s + parseFloat(l.debe || 0), 0);
      const totalHaber = lineas.reduce((s, l) => s + parseFloat(l.haber || 0), 0);
      if (Math.abs(totalDebe - totalHaber) > 0.01) {
        return res.status(400).json({ error: `Asiento desbalanceado: Debe $${totalDebe.toFixed(2)} ≠ Haber $${totalHaber.toFixed(2)}` });
      }
      data.totalDebe = totalDebe;
      data.totalHaber = totalHaber;
      data.lineas = { deleteMany: {}, create: lineas.map((l, i) => ({ ...l, orden: i })) };
    }

    const updated = await prisma.asiento.update({
      where: { id: req.params.id },
      data,
      include: { lineas: { include: { cuentaContable: { select: { codigo: true, nombre: true } } } } },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/asientos/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.asiento.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Asiento no encontrado' });

    await prisma.asiento.update({ where: { id: req.params.id }, data: { anulado: true } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── MAYOR POR CUENTA ─────────────────────────────────────────────────────────

router.get('/mayor', auth, async (req, res, next) => {
  try {
    const { empresaId, cuentaId, ejercicioId, fechaDesde, fechaHasta } = req.query;
    if (!empresaId || !cuentaId) return res.status(400).json({ error: 'empresaId y cuentaId requeridos' });

    const where = {
      asiento: {
        empresa: { estudioId: req.usuario.estudioId },
        empresaId, anulado: false,
      },
      cuentaContableId: cuentaId,
    };
    if (ejercicioId) where.asiento.ejercicioId = ejercicioId;
    if (fechaDesde || fechaHasta) {
      where.asiento.fecha = {};
      if (fechaDesde) where.asiento.fecha.gte = new Date(fechaDesde);
      if (fechaHasta) where.asiento.fecha.lte = new Date(fechaHasta);
    }

    const lineas = await prisma.lineaAsiento.findMany({
      where,
      include: {
        asiento: { select: { id: true, fecha: true, numero: true, descripcion: true } },
        cuentaContable: { select: { codigo: true, nombre: true, naturaleza: true } },
      },
      orderBy: [{ asiento: { fecha: 'asc' } }, { asiento: { numero: 'asc' } }],
    });

    let saldo = 0;
    const movimientos = lineas.map(l => {
      saldo += parseFloat(l.debe) - parseFloat(l.haber);
      return { ...l, saldo: Math.round(saldo * 100) / 100 };
    });

    const totalDebe = lineas.reduce((s, l) => s + parseFloat(l.debe), 0);
    const totalHaber = lineas.reduce((s, l) => s + parseFloat(l.haber), 0);

    res.json({ movimientos, totalDebe: Math.round(totalDebe * 100) / 100, totalHaber: Math.round(totalHaber * 100) / 100, saldoFinal: Math.round(saldo * 100) / 100 });
  } catch (err) { next(err); }
});

// ─── BALANCE DE SUMAS Y SALDOS ────────────────────────────────────────────────

router.get('/balance-sumas-saldos', auth, async (req, res, next) => {
  try {
    const { empresaId, ejercicioId } = req.query;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const cuentas = await prisma.cuentaContable.findMany({
      where: { empresaId, empresa: { estudioId: req.usuario.estudioId }, permiteMovimientos: true },
      orderBy: { codigo: 'asc' },
    });

    const cuentaIds = cuentas.map(c => c.id);
    const whereLineas = {
      cuentaContableId: { in: cuentaIds },
      asiento: { anulado: false, empresaId },
    };
    if (ejercicioId) whereLineas.asiento.ejercicioId = ejercicioId;

    const lineas = await prisma.lineaAsiento.groupBy({
      by: ['cuentaContableId'],
      where: whereLineas,
      _sum: { debe: true, haber: true },
    });

    const movPorCuenta = {};
    for (const l of lineas) {
      movPorCuenta[l.cuentaContableId] = {
        sumaDebe: parseFloat(l._sum.debe || 0),
        sumaHaber: parseFloat(l._sum.haber || 0),
      };
    }

    const resultado = cuentas
      .filter(c => movPorCuenta[c.id])
      .map(c => {
        const { sumaDebe, sumaHaber } = movPorCuenta[c.id] || { sumaDebe: 0, sumaHaber: 0 };
        const saldo = sumaDebe - sumaHaber;
        return {
          ...c,
          sumaDebe: Math.round(sumaDebe * 100) / 100,
          sumaHaber: Math.round(sumaHaber * 100) / 100,
          saldoDeudor: saldo > 0 ? Math.round(saldo * 100) / 100 : 0,
          saldoAcreedor: saldo < 0 ? Math.round(Math.abs(saldo) * 100) / 100 : 0,
        };
      });

    res.json(resultado);
  } catch (err) { next(err); }
});

// ─── ESTADO DE RESULTADOS ─────────────────────────────────────────────────────

router.get('/estado-resultados', auth, async (req, res, next) => {
  try {
    const { empresaId, ejercicioId, fechaDesde, fechaHasta } = req.query;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const cuentas = await prisma.cuentaContable.findMany({
      where: {
        empresaId,
        tipo: { in: ['RESULTADO_POSITIVO', 'RESULTADO_NEGATIVO'] },
        permiteMovimientos: true,
      },
      orderBy: { codigo: 'asc' },
    });

    const cuentaIds = cuentas.map(c => c.id);
    const whereLineas = {
      cuentaContableId: { in: cuentaIds },
      asiento: { anulado: false, empresaId },
    };
    if (ejercicioId) whereLineas.asiento.ejercicioId = ejercicioId;
    if (fechaDesde || fechaHasta) {
      whereLineas.asiento.fecha = {};
      if (fechaDesde) whereLineas.asiento.fecha.gte = new Date(fechaDesde);
      if (fechaHasta) whereLineas.asiento.fecha.lte = new Date(fechaHasta);
    }

    const lineas = await prisma.lineaAsiento.groupBy({
      by: ['cuentaContableId'],
      where: whereLineas,
      _sum: { debe: true, haber: true },
    });

    const movPorCuenta = {};
    for (const l of lineas) {
      movPorCuenta[l.cuentaContableId] = {
        sumaDebe: parseFloat(l._sum.debe || 0),
        sumaHaber: parseFloat(l._sum.haber || 0),
      };
    }

    const ingresos = [];
    const egresos = [];
    let totalIngresos = 0;
    let totalEgresos = 0;

    for (const c of cuentas) {
      const mov = movPorCuenta[c.id] || { sumaDebe: 0, sumaHaber: 0 };
      // Para cuentas de resultado positivo (ingresos): naturaleza ACREEDORA → saldo = haber - debe
      // Para cuentas de resultado negativo (egresos): naturaleza DEUDORA → saldo = debe - haber
      let saldo;
      if (c.tipo === 'RESULTADO_POSITIVO') {
        saldo = Math.round((mov.sumaHaber - mov.sumaDebe) * 100) / 100;
        if (saldo !== 0) { ingresos.push({ ...c, saldo }); totalIngresos += saldo; }
      } else {
        saldo = Math.round((mov.sumaDebe - mov.sumaHaber) * 100) / 100;
        if (saldo !== 0) { egresos.push({ ...c, saldo }); totalEgresos += saldo; }
      }
    }

    const resultado = Math.round((totalIngresos - totalEgresos) * 100) / 100;

    res.json({
      ingresos,
      egresos,
      totalIngresos: Math.round(totalIngresos * 100) / 100,
      totalEgresos: Math.round(totalEgresos * 100) / 100,
      resultado,
      tipo: resultado >= 0 ? 'GANANCIA' : 'PERDIDA',
    });
  } catch (err) { next(err); }
});

// ─── BALANCE GENERAL ──────────────────────────────────────────────────────────

router.get('/balance-general', auth, async (req, res, next) => {
  try {
    const { empresaId, ejercicioId, fechaHasta } = req.query;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const cuentas = await prisma.cuentaContable.findMany({
      where: {
        empresaId,
        tipo: { in: ['ACTIVO', 'PASIVO', 'PATRIMONIO_NETO'] },
        permiteMovimientos: true,
      },
      orderBy: { codigo: 'asc' },
    });

    const cuentaIds = cuentas.map(c => c.id);
    const whereLineas = {
      cuentaContableId: { in: cuentaIds },
      asiento: { anulado: false, empresaId },
    };
    if (ejercicioId) whereLineas.asiento.ejercicioId = ejercicioId;
    if (fechaHasta) whereLineas.asiento.fecha = { lte: new Date(fechaHasta) };

    const lineas = await prisma.lineaAsiento.groupBy({
      by: ['cuentaContableId'],
      where: whereLineas,
      _sum: { debe: true, haber: true },
    });

    const movPorCuenta = {};
    for (const l of lineas) {
      movPorCuenta[l.cuentaContableId] = {
        sumaDebe: parseFloat(l._sum.debe || 0),
        sumaHaber: parseFloat(l._sum.haber || 0),
      };
    }

    const activos = [];
    const pasivos = [];
    const patrimonioNeto = [];
    let totalActivo = 0;
    let totalPasivo = 0;
    let totalPatrimonio = 0;

    for (const c of cuentas) {
      const mov = movPorCuenta[c.id] || { sumaDebe: 0, sumaHaber: 0 };
      // Activos: naturaleza DEUDORA → saldo = debe - haber
      // Pasivos/Patrimonio: naturaleza ACREEDORA → saldo = haber - debe
      let saldo;
      if (c.tipo === 'ACTIVO') {
        saldo = Math.round((mov.sumaDebe - mov.sumaHaber) * 100) / 100;
        if (saldo !== 0) { activos.push({ ...c, saldo }); totalActivo += saldo; }
      } else if (c.tipo === 'PASIVO') {
        saldo = Math.round((mov.sumaHaber - mov.sumaDebe) * 100) / 100;
        if (saldo !== 0) { pasivos.push({ ...c, saldo }); totalPasivo += saldo; }
      } else {
        saldo = Math.round((mov.sumaHaber - mov.sumaDebe) * 100) / 100;
        if (saldo !== 0) { patrimonioNeto.push({ ...c, saldo }); totalPatrimonio += saldo; }
      }
    }

    res.json({
      activos,
      pasivos,
      patrimonioNeto,
      totalActivo: Math.round(totalActivo * 100) / 100,
      totalPasivo: Math.round(totalPasivo * 100) / 100,
      totalPatrimonio: Math.round(totalPatrimonio * 100) / 100,
      totalPasivoMasPatrimonio: Math.round((totalPasivo + totalPatrimonio) * 100) / 100,
      balanceado: Math.abs(totalActivo - totalPasivo - totalPatrimonio) < 0.01,
    });
  } catch (err) { next(err); }
});

module.exports = router;
