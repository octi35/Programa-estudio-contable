const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const dayjs = require('dayjs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validarCUIL, validarCBU } = require('../utils/validacionesAr');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const empleadoValidations = [
  body('apellido').notEmpty().withMessage('Apellido requerido'),
  body('nombre').notEmpty().withMessage('Nombre requerido'),
  body('cuil').matches(/^\d{2}-\d{8}-\d{1}$/).withMessage('CUIL inválido (formato: XX-XXXXXXXX-X)'),
  body('fechaIngreso').isISO8601().withMessage('Fecha de ingreso inválida'),
  body('empresaId').isUUID().withMessage('Empresa inválida'),
];

// GET /api/empleados
router.get('/', auth, async (req, res, next) => {
  try {
    const { empresaId, buscar, activo, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {};
    if (activo !== undefined) where.activo = activo === 'true';
    if (empresaId) {
      where.empresaId = empresaId;
    } else {
      where.empresa = { estudioId: req.usuario.estudioId };
    }
    if (buscar) {
      where.OR = [
        { apellido: { contains: buscar, mode: 'insensitive' } },
        { nombre: { contains: buscar, mode: 'insensitive' } },
        { cuil: { contains: buscar } },
        { legajoNumero: { contains: buscar } },
      ];
    }

    const [empleados, total] = await Promise.all([
      prisma.empleado.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          empresa: { select: { id: true, razonSocial: true, cuit: true } },
        },
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      }),
      prisma.empleado.count({ where }),
    ]);

    const empleadosConAntiguedad = empleados.map(e => ({
      ...e,
      antiguedadAnios: dayjs().diff(dayjs(e.fechaIngreso), 'year'),
    }));

    res.json({
      data: empleadosConAntiguedad,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/empleados/:id
router.get('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empleado = await prisma.empleado.findFirst({
      where: {
        id: req.params.id,
        empresa: { estudioId: req.usuario.estudioId },
      },
      include: {
        empresa: { include: { convenio: true } },
        sucursal: { select: { id: true, nombre: true } },
        convenio: { select: { id: true, nombre: true, codigo: true } },
        novedades: { orderBy: { createdAt: 'desc' }, take: 20 },
        documentos: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    res.json({
      ...empleado,
      antiguedadAnios: dayjs().diff(dayjs(empleado.fechaIngreso), 'year'),
      antiguedadMeses: dayjs().diff(dayjs(empleado.fechaIngreso), 'month'),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/empleados
router.post('/', auth, [...empleadoValidations, validate], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({
      where: { id: req.body.empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const empleado = await prisma.empleado.create({
      data: req.body,
      include: { empresa: { select: { id: true, razonSocial: true } } },
    });

    await prisma.novedadEmpleado.create({
      data: {
        empleadoId: empleado.id,
        tipo: 'ALTA',
        descripcion: 'Alta de empleado',
        fechaDesde: new Date(req.body.fechaIngreso),
      },
    });

    res.status(201).json(empleado);
  } catch (err) {
    next(err);
  }
});

// PUT /api/empleados/:id
router.put('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const empleado = await prisma.empleado.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const { empresaId, ...dataUpdate } = req.body;

    if (dataUpdate.basicoMensual && dataUpdate.basicoMensual !== empleado.basicoMensual.toNumber()) {
      await prisma.novedadEmpleado.create({
        data: {
          empleadoId: empleado.id,
          tipo: 'MODIFICACION_SUELDO',
          descripcion: `Modificación de básico: $${empleado.basicoMensual} → $${dataUpdate.basicoMensual}`,
          fechaDesde: new Date(),
          valor: dataUpdate.basicoMensual,
        },
      });
    }

    const updated = await prisma.empleado.update({
      where: { id: req.params.id },
      data: dataUpdate,
      include: { empresa: { select: { id: true, razonSocial: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/empleados/:id/baja
router.post('/:id/baja', auth, [
  param('id').isUUID(),
  body('fechaEgreso').isISO8601().withMessage('Fecha de egreso inválida'),
  body('motivoEgreso').notEmpty().withMessage('Motivo de egreso requerido'),
  validate,
], async (req, res, next) => {
  try {
    const empleado = await prisma.empleado.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });

    const updated = await prisma.empleado.update({
      where: { id: req.params.id },
      data: {
        activo: false,
        fechaEgreso: new Date(req.body.fechaEgreso),
        motivoEgreso: req.body.motivoEgreso,
      },
    });

    await prisma.novedadEmpleado.create({
      data: {
        empleadoId: empleado.id,
        tipo: 'BAJA',
        descripcion: `Baja de empleado: ${req.body.motivoEgreso}`,
        fechaDesde: new Date(req.body.fechaEgreso),
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/empleados/:id/liquidaciones
router.get('/:id/liquidaciones', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidaciones = await prisma.liquidacion.findMany({
      where: { empleadoId: req.params.id },
      include: { periodo: true },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 24,
    });
    res.json(liquidaciones);
  } catch (err) {
    next(err);
  }
});

// GET /api/empleados/:id/historial-salarial?meses=12
// Devuelve los últimos N meses de liquidaciones del empleado para graficar evolución
router.get('/:id/historial-salarial', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const meses = Math.min(36, Math.max(1, Number(req.query.meses) || 12));

    // Verificar que el empleado pertenece al estudio
    const emp = await prisma.empleado.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      select: { id: true, apellido: true, nombre: true, cuil: true },
    });
    if (!emp) return res.status(404).json({ error: 'Empleado no encontrado' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { empleadoId: req.params.id, tipo: 'MENSUAL' },
      select: {
        anio: true, mes: true, tipo: true,
        totalHaberes: true, totalDescuentos: true, totalNeto: true, totalContribuciones: true,
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: meses,
    });

    // Devolver en orden ascendente (más antiguo primero) para el gráfico
    const historial = liquidaciones.reverse().map(l => ({
      anio: l.anio,
      mes: l.mes,
      periodo: `${String(l.mes).padStart(2, '0')}/${String(l.anio).slice(2)}`,
      bruto: Number(l.totalHaberes),
      neto: Number(l.totalNeto),
      descuentos: Number(l.totalDescuentos),
      contribuciones: Number(l.totalContribuciones),
    }));

    res.json({ empleado: emp, meses, historial });
  } catch (err) {
    next(err);
  }
});

// POST /api/empleados/:id/duplicar — duplica un empleado
router.post('/:id/duplicar', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const original = await prisma.empleado.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!original) return res.status(404).json({ error: 'Empleado no encontrado' });

    const { id, createdAt, updatedAt, cuil, legajoNumero, fechaIngreso, fechaEgreso, motivoEgreso, activo, ...datos } = original;

    // Cuenta cuántos duplicados existen ya para este empleado
    const count = await prisma.empleado.count({
      where: { empresaId: original.empresaId, apellido: original.apellido, nombre: original.nombre },
    });

    const nuevo = await prisma.empleado.create({
      data: {
        ...datos,
        cuil: req.body.cuil || '',
        legajoNumero: req.body.legajoNumero || null,
        fechaIngreso: req.body.fechaIngreso ? new Date(req.body.fechaIngreso) : new Date(),
        activo: false, // inactivo hasta completar datos
      },
    });

    res.status(201).json(nuevo);
  } catch (err) {
    next(err);
  }
});

// POST /api/empleados/importar — importación masiva desde Excel
router.post('/importar', auth, upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const { empresaId } = req.body;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];

    const errores = [];
    const creados = [];
    const headers = [];
    let isFirstRow = true;

    sheet.eachRow((row, rowNum) => {
      if (isFirstRow) {
        row.eachCell(cell => headers.push(String(cell.value || '').toLowerCase().trim()));
        isFirstRow = false;
        return;
      }

      const vals = {};
      row.eachCell((cell, colNum) => {
        vals[headers[colNum - 1]] = cell.value;
      });

      if (!vals.apellido || !vals.nombre) return;

      const cuil = String(vals.cuil || '').replace(/[-\s]/g, '');
      const cuilFormateado = cuil.length === 11 ? `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}` : String(vals.cuil || '');

      const fechaIngreso = vals['fecha ingreso'] || vals.fechaingreso || vals['fecha_ingreso'];

      creados.push({
        empresaId,
        apellido: String(vals.apellido),
        nombre: String(vals.nombre),
        cuil: cuilFormateado,
        dni: vals.dni ? String(vals.dni) : null,
        legajoNumero: vals.legajo ? String(vals.legajo) : null,
        categoria: vals.categoria ? String(vals.categoria) : null,
        puesto: vals.puesto || vals.tarea ? String(vals.puesto || vals.tarea) : null,
        basicoMensual: parseFloat(vals['basico'] || vals['basicomensual'] || vals['sueldo'] || 0) || 0,
        fechaIngreso: fechaIngreso ? new Date(fechaIngreso) : new Date(),
        email: vals.email ? String(vals.email) : null,
        telefono: vals.telefono ? String(vals.telefono) : null,
        cbu: vals.cbu ? String(vals.cbu) : null,
      });
    });

    const resultados = await Promise.allSettled(
      creados.map(async (data) => {
        try {
          const emp = await prisma.empleado.create({ data });
          await prisma.novedadEmpleado.create({
            data: { empleadoId: emp.id, tipo: 'ALTA', descripcion: 'Alta por importación Excel', fechaDesde: emp.fechaIngreso },
          });
          return emp;
        } catch (e) {
          return Promise.reject({ cuil: data.cuil, error: e.message });
        }
      })
    );

    const exitosos = resultados.filter(r => r.status === 'fulfilled').map(r => r.value);
    const fallidos = resultados.filter(r => r.status === 'rejected').map(r => r.reason);

    res.json({ total: creados.length, exitosos: exitosos.length, fallidos: fallidos.length, errores: fallidos });
  } catch (err) {
    next(err);
  }
});

// POST /api/empleados/novedades/masiva — aplica una novedad a múltiples empleados
router.post('/novedades/masiva', auth, [
  body('empleadoIds').isArray({ min: 1 }),
  body('tipo').notEmpty(),
  body('fechaDesde').isISO8601(),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoIds, tipo, descripcion, fechaDesde, fechaHasta, valor, importe } = req.body;
    const valorFinal = valor ?? importe ?? null;

    // Verifica que todos pertenezcan al estudio
    const count = await prisma.empleado.count({
      where: { id: { in: empleadoIds }, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (count !== empleadoIds.length) {
      return res.status(403).json({ error: 'Algunos empleados no pertenecen al estudio' });
    }

    await prisma.novedadEmpleado.createMany({
      data: empleadoIds.map(empleadoId => ({
        empleadoId,
        tipo,
        descripcion: descripcion || tipo,
        fechaDesde: new Date(fechaDesde),
        fechaHasta: fechaHasta ? new Date(fechaHasta) : null,
        valor: valorFinal ? parseFloat(valorFinal) : null,
      })),
    });

    res.json({ ok: true, aplicados: empleadoIds.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/empleados/novedades/importar — importación masiva de novedades desde Excel
router.post('/novedades/importar', auth, upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const ws = workbook.worksheets[0];

    const rows = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      rows.push({
        cuil: String(row.getCell(1).value || '').trim().replace(/[^0-9\-]/g, ''),
        legajo: String(row.getCell(2).value || '').trim(),
        tipo: String(row.getCell(3).value || '').trim().toUpperCase().replace(/ /g, '_'),
        descripcion: String(row.getCell(4).value || '').trim(),
        fechaDesde: row.getCell(5).value,
        fechaHasta: row.getCell(6).value || null,
        valor: row.getCell(7).value ? parseFloat(row.getCell(7).value) : null,
        importe: row.getCell(8).value ? parseFloat(row.getCell(8).value) : null,
      });
    });

    const importados = [];
    const errores = [];

    for (const r of rows) {
      try {
        const where = r.cuil
          ? { cuil: r.cuil, empresa: { estudioId: req.usuario.estudioId } }
          : { legajoNumero: r.legajo, empresa: { estudioId: req.usuario.estudioId } };

        const empleado = await prisma.empleado.findFirst({ where });
        if (!empleado) { errores.push({ fila: r.cuil || r.legajo, error: 'Empleado no encontrado' }); continue; }
        if (!r.tipo) { errores.push({ fila: r.cuil || r.legajo, error: 'Tipo de novedad requerido' }); continue; }

        await prisma.novedadEmpleado.create({
          data: {
            empleadoId: empleado.id,
            tipo: r.tipo,
            descripcion: r.descripcion || r.tipo,
            fechaDesde: r.fechaDesde ? new Date(r.fechaDesde) : new Date(),
            fechaHasta: r.fechaHasta ? new Date(r.fechaHasta) : null,
            valor: r.valor || r.importe || null,
          },
        });
        importados.push(empleado.id);
      } catch (e) {
        errores.push({ fila: r.cuil || r.legajo, error: e.message });
      }
    }

    res.json({ ok: true, importados: importados.length, errores });
  } catch (err) {
    next(err);
  }
});

// GET /api/empleados/:id/ausentismos
router.get('/:id/ausentismos', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const ausentismos = await prisma.ausentismo.findMany({
      where: { empleadoId: req.params.id, empleado: { empresa: { estudioId: req.usuario.estudioId } } },
      orderBy: { fechaDesde: 'desc' },
    });
    res.json(ausentismos);
  } catch (err) {
    next(err);
  }
});

// GET /api/empleados/:id/familiares
router.get('/:id/familiares', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const familiares = await prisma.familiar.findMany({
      where: { empleadoId: req.params.id, empleado: { empresa: { estudioId: req.usuario.estudioId } } },
      orderBy: { apellido: 'asc' },
    });
    res.json(familiares);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
