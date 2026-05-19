const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const liquidacionService = require('../services/liquidacionService');
const pdfService = require('../services/pdfService');
const { crearAsientoLiquidacion } = require('../services/asientosAutoService');
const logAccion = require('../utils/logAccion');
const ExcelJS = require('exceljs');


// POST /api/liquidaciones/calcular
router.post('/calcular', auth, [
  body('empleadoId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  body('tipo').isIn(['MENSUAL', 'SAC_JUNIO', 'SAC_DICIEMBRE', 'VACACIONES']),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, anio, mes, tipo, ...opciones } = req.body;

    let resultado;
    if (tipo === 'MENSUAL') {
      resultado = await liquidacionService.calcularLiquidacionMensual(empleadoId, anio, mes, opciones);
    } else if (tipo === 'SAC_JUNIO') {
      resultado = await liquidacionService.calcularSAC(empleadoId, anio, 1);
    } else if (tipo === 'SAC_DICIEMBRE') {
      resultado = await liquidacionService.calcularSAC(empleadoId, anio, 2);
    } else if (tipo === 'VACACIONES') {
      resultado = await liquidacionService.calcularVacaciones(empleadoId, anio, mes);
    }

    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/calcular-batch
// Calcula la liquidación de TODOS los empleados activos de la empresa que NO tengan
// liquidación en el período, sin recalcular las existentes. Procesa en secuencia.
router.post('/calcular-batch', auth, [
  body('empresaId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  body('tipo').isIn(['MENSUAL', 'SAC_JUNIO', 'SAC_DICIEMBRE', 'VACACIONES']).optional(),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipo = 'MENSUAL' } = req.body;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    let periodo = await prisma.periodoLiquidacion.findFirst({
      where: { empresaId, anio, mes, tipo },
    });
    if (!periodo) {
      periodo = await prisma.periodoLiquidacion.create({
        data: { empresaId, anio, mes, tipo, estado: 'ABIERTO' },
      });
    }

    // Empleados activos sin liquidación en este período
    const empleados = await prisma.empleado.findMany({
      where: { empresaId, activo: true },
      select: { id: true, apellido: true, nombre: true, cuil: true },
    });

    const existentes = await prisma.liquidacion.findMany({
      where: { periodoId: periodo.id, empleadoId: { in: empleados.map(e => e.id) } },
      select: { empleadoId: true },
    });
    const yaLiquidados = new Set(existentes.map(l => l.empleadoId));
    const pendientes = empleados.filter(e => !yaLiquidados.has(e.id));

    const conceptos = await prisma.concepto.findMany({ where: { convenioId: empresa.convenioId } });
    const conceptosMap = {};
    conceptos.forEach(c => { conceptosMap[c.codigo] = c.id; });

    // Procesar en chunks de 5 en paralelo
    const CHUNK_SIZE = 5;
    const erroresList = [];
    const procesadosList = [];

    const calcularPara = async (emp) => {
      let calc;
      if (tipo === 'MENSUAL') {
        calc = await liquidacionService.calcularLiquidacionMensual(emp.id, anio, mes);
      } else if (tipo === 'SAC_JUNIO') {
        calc = await liquidacionService.calcularSAC(emp.id, anio, 1);
      } else if (tipo === 'SAC_DICIEMBRE') {
        calc = await liquidacionService.calcularSAC(emp.id, anio, 2);
      } else if (tipo === 'VACACIONES') {
        calc = await liquidacionService.calcularVacaciones(emp.id, anio, mes);
      }
      await liquidacionService.guardarLiquidacion(calc, periodo.id, conceptosMap);
      return calc;
    };

    for (let i = 0; i < pendientes.length; i += CHUNK_SIZE) {
      const chunk = pendientes.slice(i, i + CHUNK_SIZE);
      const resultados = await Promise.allSettled(chunk.map(emp => calcularPara(emp)));

      resultados.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          procesadosList.push({ empleadoId: chunk[idx].id, nombre: `${chunk[idx].apellido} ${chunk[idx].nombre}` });
        } else {
          erroresList.push({
            empleadoId: chunk[idx].id,
            nombre: `${chunk[idx].apellido} ${chunk[idx].nombre}`,
            error: r.reason?.message || 'Error desconocido',
          });
        }
      });
    }

    res.json({
      periodo,
      totalEmpleados: empleados.length,
      yaLiquidados: yaLiquidados.size,
      pendientesAlInicio: pendientes.length,
      procesados: procesadosList.length,
      procesadosDetalle: procesadosList,
      errores: erroresList,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/periodo
router.post('/periodo', auth, [
  body('empresaId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  body('tipo').isIn(['MENSUAL', 'SAC_JUNIO', 'SAC_DICIEMBRE', 'VACACIONES', 'LIQUIDACION_FINAL']).optional(),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipo = 'MENSUAL' } = req.body;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    let periodo = await prisma.periodoLiquidacion.findFirst({
      where: { empresaId, anio, mes, tipo },
    });

    if (!periodo) {
      periodo = await prisma.periodoLiquidacion.create({
        data: { empresaId, anio, mes, tipo, estado: 'ABIERTO' },
      });
    }

    const empleados = await prisma.empleado.findMany({
      where: { empresaId, activo: true },
    });

    const conceptos = await prisma.concepto.findMany({
      where: { convenioId: empresa.convenioId },
    });
    const conceptosMap = {};
    conceptos.forEach(c => { conceptosMap[c.codigo] = c.id; });

    const resultados = [];
    for (const emp of empleados) {
      try {
        let calc;
        if (tipo === 'MENSUAL') {
          calc = await liquidacionService.calcularLiquidacionMensual(emp.id, anio, mes);
        } else if (tipo === 'SAC_JUNIO') {
          calc = await liquidacionService.calcularSAC(emp.id, anio, 1);
        } else if (tipo === 'SAC_DICIEMBRE') {
          calc = await liquidacionService.calcularSAC(emp.id, anio, 2);
        } else if (tipo === 'VACACIONES') {
          calc = await liquidacionService.calcularVacaciones(emp.id, anio, mes);
        }
        const guardada = await liquidacionService.guardarLiquidacion(calc, periodo.id, conceptosMap);
        resultados.push({ empleadoId: emp.id, empleado: `${emp.apellido} ${emp.nombre}`, exito: true, liquidacionId: guardada.id });
      } catch (e) {
        resultados.push({ empleadoId: emp.id, empleado: `${emp.apellido} ${emp.nombre}`, exito: false, error: e.message });
      }
    }

    res.json({ periodo, resultados, procesados: resultados.filter(r => r.exito).length, errores: resultados.filter(r => !r.exito).length });
  } catch (err) {
    next(err);
  }
});

// GET /api/liquidaciones?empresaId=X&anio=Y&mes=Z&tipo=&estado=&page=1&limit=20
router.get('/', auth, async (req, res, next) => {
  try {
    const { empresaId, periodoId, empleadoId, anio, mes, tipo, estado, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {
      periodo: { empresa: { estudioId: req.usuario.estudioId } },
    };
    if (periodoId) where.periodoId = periodoId;
    if (empleadoId) where.empleadoId = empleadoId;
    if (anio) where.anio = parseInt(anio);
    if (mes) where.mes = parseInt(mes);
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (empresaId) {
      where.periodo = { ...where.periodo, empresaId };
    }

    const [total, liquidaciones] = await Promise.all([
      prisma.liquidacion.count({ where }),
      prisma.liquidacion.findMany({
        where,
        include: {
          empleado: { select: { id: true, apellido: true, nombre: true, cuil: true, legajoNumero: true } },
          periodo: { select: { id: true, empresaId: true, empresa: { select: { id: true, razonSocial: true } }, estado: true } },
        },
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { empleado: { apellido: 'asc' } }],
        skip,
        take,
      }),
    ]);

    res.json({
      data: liquidaciones,
      pagination: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/calcular-final — calcula liquidación final de un empleado
router.post('/calcular-final', auth, [
  body('empleadoId').isUUID(),
  body('fechaBaja').isISO8601(),
  body('motivo').isIn(['DESPIDO_SIN_CAUSA', 'DESPIDO_CON_CAUSA', 'RENUNCIA', 'MUTUO_ACUERDO', 'JUBILACION', 'FALLECIMIENTO', 'VENCIMIENTO_CONTRATO']),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, fechaBaja, motivo } = req.body;
    const resultado = await liquidacionService.calcularLiquidacionFinal(empleadoId, fechaBaja, motivo);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/guardar-final — calcula y persiste la liquidación final de UN empleado
router.post('/guardar-final', auth, [
  body('empleadoId').isUUID(),
  body('empresaId').isUUID(),
  body('fechaBaja').isISO8601(),
  body('motivo').isIn(['DESPIDO_SIN_CAUSA', 'DESPIDO_CON_CAUSA', 'RENUNCIA', 'MUTUO_ACUERDO', 'JUBILACION', 'FALLECIMIENTO', 'VENCIMIENTO_CONTRATO']),
  validate,
], async (req, res, next) => {
  try {
    const { empleadoId, empresaId, fechaBaja, motivo } = req.body;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const calc = await liquidacionService.calcularLiquidacionFinal(empleadoId, fechaBaja, motivo);

    let periodo = await prisma.periodoLiquidacion.findFirst({
      where: { empresaId, anio: calc.anio, mes: calc.mes, tipo: 'LIQUIDACION_FINAL' },
    });
    if (!periodo) {
      periodo = await prisma.periodoLiquidacion.create({
        data: { empresaId, anio: calc.anio, mes: calc.mes, tipo: 'LIQUIDACION_FINAL', estado: 'ABIERTO' },
      });
    }

    const conceptos = await prisma.concepto.findMany({ where: { convenioId: empresa.convenioId } });
    const conceptosMap = {};
    conceptos.forEach(c => { conceptosMap[c.codigo] = c.id; });

    const saved = await liquidacionService.guardarLiquidacion(calc, periodo.id, conceptosMap);
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

// GET /api/liquidaciones/resumen-periodo?empresaId&anio&mes
// Calcula los totales del período y compara con el mes anterior.
router.get('/resumen-periodo', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.query;
    if (!empresaId || !anio || !mes) return res.status(400).json({ error: 'empresaId, anio y mes requeridos' });

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
      select: { id: true, razonSocial: true, cuit: true },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const anioN = Number(anio);
    const mesN = Number(mes);

    const cargarPeriodo = async (a, m) => {
      const liquidaciones = await prisma.liquidacion.findMany({
        where: { periodo: { empresaId, anio: a, mes: m }, tipo: 'MENSUAL' },
        select: { totalHaberes: true, totalDescuentos: true, totalNeto: true, totalContribuciones: true },
      });
      return liquidaciones.reduce((acc, l) => ({
        cantidad: acc.cantidad + 1,
        totalHaberes: acc.totalHaberes + Number(l.totalHaberes),
        totalDescuentos: acc.totalDescuentos + Number(l.totalDescuentos),
        totalNeto: acc.totalNeto + Number(l.totalNeto),
        totalContribuciones: acc.totalContribuciones + Number(l.totalContribuciones),
      }), { cantidad: 0, totalHaberes: 0, totalDescuentos: 0, totalNeto: 0, totalContribuciones: 0 });
    };

    const actual = await cargarPeriodo(anioN, mesN);
    const mesAnteriorM = mesN === 1 ? 12 : mesN - 1;
    const anioAnterior = mesN === 1 ? anioN - 1 : anioN;
    const anterior = await cargarPeriodo(anioAnterior, mesAnteriorM);

    const variacion = (campo) => {
      if (!anterior[campo] || anterior[campo] === 0) return null;
      return Math.round(((actual[campo] - anterior[campo]) / anterior[campo]) * 1000) / 10;
    };

    res.json({
      empresa,
      periodo: { anio: anioN, mes: mesN },
      actual,
      anterior: { anio: anioAnterior, mes: mesAnteriorM, ...anterior },
      variacion: {
        cantidad: variacion('cantidad'),
        totalHaberes: variacion('totalHaberes'),
        totalDescuentos: variacion('totalDescuentos'),
        totalNeto: variacion('totalNeto'),
        totalContribuciones: variacion('totalContribuciones'),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/cerrar-periodo
// Cierra el período (estado = CERRADO), confirma todas las liquidaciones CALCULADAS
// y genera el F.931 automáticamente como documento asociado.
router.post('/cerrar-periodo', auth, [
  body('empresaId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  body('tipo').isIn(['MENSUAL', 'SAC_JUNIO', 'SAC_DICIEMBRE', 'VACACIONES', 'LIQUIDACION_FINAL']).optional(),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipo = 'MENSUAL' } = req.body;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const periodo = await prisma.periodoLiquidacion.findFirst({
      where: { empresaId, anio, mes, tipo },
    });
    if (!periodo) return res.status(404).json({ error: 'Período no encontrado' });

    // Confirmar todas las liquidaciones CALCULADAS del período
    const calculadas = await prisma.liquidacion.updateMany({
      where: { periodoId: periodo.id, estado: 'CALCULADO' },
      data: { estado: 'CONFIRMADO' },
    });

    // Marcar el período como CERRADO
    const periodoCerrado = await prisma.periodoLiquidacion.update({
      where: { id: periodo.id },
      data: { estado: 'CERRADO', fechaCierre: new Date() },
    });

    // Generar F.931 automáticamente como documento adjunto
    let f931Documento = null;
    try {
      const ExcelJSLocal = require('exceljs');
      const liquidaciones = await prisma.liquidacion.findMany({
        where: { periodoId: periodo.id, tipo: 'MENSUAL', estado: { in: ['CALCULADO', 'CONFIRMADO'] } },
        include: {
          empleado: { select: { apellido: true, nombre: true, cuil: true, legajoNumero: true, cbu: true } },
        },
      });

      if (liquidaciones.length > 0) {
        const wb = new ExcelJSLocal.Workbook();
        const ws = wb.addWorksheet('F.931');
        ws.addRow(['F.931 SICOSS', `${empresa.razonSocial}`, `Período: ${anio}-${String(mes).padStart(2, '0')}`]);
        ws.addRow(['CUIL','Apellido y Nombre','Legajo','Días','Remun. Bruta','Ap.Jub','Ap.OS','Ap.PAMI','Ct.Jub','Ct.OS','Ct.PAMI','Ct.ART','Total Contrib','Costo Total']);
        for (const liq of liquidaciones) {
          const bruta = Number(liq.totalHaberes);
          const apJub = bruta*0.11, apOS = bruta*0.03, apPami = bruta*0.03;
          const cjJub = bruta*0.16, cjOS = bruta*0.06, cjPami = bruta*0.015, art = bruta*0.025;
          ws.addRow([liq.empleado.cuil, `${liq.empleado.apellido}, ${liq.empleado.nombre}`, liq.empleado.legajoNumero || '—',
            Number(liq.diasTrabajados)||30, bruta, apJub, apOS, apPami, cjJub, cjOS, cjPami, art,
            cjJub+cjOS+cjPami+art, bruta+cjJub+cjOS+cjPami+art]);
        }
        const buf = await wb.xlsx.writeBuffer();

        // Guardar como Documento (URL en base64 inline para no requerir filesystem)
        const fs = require('fs');
        const path = require('path');
        const uploadDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
        try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (_) {}
        const cuitSinGuion = empresa.cuit.replace(/-/g, '');
        const fileName = `F931_${cuitSinGuion}_${anio}${String(mes).padStart(2,'0')}_${Date.now()}.xlsx`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(buf));

        f931Documento = await prisma.documento.create({
          data: {
            empresaId,
            tipo: 'F931',
            nombre: `F.931 ${anio}-${String(mes).padStart(2, '0')}`,
            descripcion: `Generado automáticamente al cerrar período ${anio}-${String(mes).padStart(2, '0')}`,
            url: `/uploads/${fileName}`,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            tamanio: buf.byteLength,
            anio: Number(anio),
            mes: Number(mes),
          },
        });
      }
    } catch (errF931) {
      // No bloquea el cierre si el F.931 falla
      console.error('Error generando F.931 al cerrar período:', errF931.message);
    }

    await logAccion({
      usuarioId: req.usuario.id,
      estudioId: req.usuario.estudioId,
      accion: 'CERRAR_PERIODO',
      entidad: 'PeriodoLiquidacion',
      entidadId: periodo.id,
      detalle: { empresaId, anio, mes, tipo, liquidacionesConfirmadas: calculadas.count, f931Generado: !!f931Documento },
      ip: req.ip,
    });

    res.json({
      periodo: periodoCerrado,
      liquidacionesConfirmadas: calculadas.count,
      f931: f931Documento,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/liquidaciones/nomina-excel — exporta nómina del período en Excel
// MUST be before /:id to avoid UUID conflict
router.get('/nomina-excel', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.query;
    if (!empresaId || !anio || !mes) return res.status(400).json({ error: 'empresaId, anio y mes requeridos' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { periodo: { empresaId, anio: Number(anio), mes: Number(mes) } },
      include: {
        empleado: { select: { apellido: true, nombre: true, cuil: true, legajoNumero: true, categoria: true, puesto: true, cbu: true, obraSocialNombre: true } },
      },
      orderBy: [{ empleado: { apellido: 'asc' } }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'EstudioPRO';
    const ws = wb.addWorksheet('Nómina');
    const MESES_NOM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    ws.mergeCells('A1:K1');
    ws.getCell('A1').value = `NÓMINA DE SUELDOS — ${empresa.razonSocial} — ${MESES_NOM[Number(mes)-1]} ${anio}`;
    ws.getCell('A1').font = { bold: true, size: 13 };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 22;

    ws.mergeCells('A2:K2');
    ws.getCell('A2').value = `CUIT: ${empresa.cuit} | Generado: ${new Date().toLocaleDateString('es-AR')}`;
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.addRow([]);

    const headers = ['Legajo','Apellido y Nombre','CUIL','Categoría','Puesto','Días Trab.','Total Haberes','Total Descuentos','Neto a Cobrar','Contribuciones','Estado'];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: col >= 7 ? 'right' : 'left', vertical: 'middle' };
    });
    headerRow.height = 18;
    [8,30,16,12,18,10,18,18,18,18,12].forEach((w,i) => { ws.getColumn(i+1).width = w; });

    const fmt = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    let sumaHaberes=0, sumaDesc=0, sumaNeto=0, sumaContrib=0, rowNum=5;

    for (const liq of liquidaciones) {
      const emp = liq.empleado;
      sumaHaberes += Number(liq.totalHaberes); sumaDesc += Number(liq.totalDescuentos);
      sumaNeto += Number(liq.totalNeto); sumaContrib += Number(liq.totalContribuciones);
      const row = ws.addRow([emp.legajoNumero||'—',`${emp.apellido}, ${emp.nombre}`,emp.cuil,emp.categoria||'—',emp.puesto||'—',liq.diasTrabajados||0,fmt(liq.totalHaberes),fmt(liq.totalDescuentos),fmt(liq.totalNeto),fmt(liq.totalContribuciones),liq.estado]);
      row.eachCell((cell,col) => {
        if(rowNum%2===1) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF5F8FF'}};
        if(col>=7) cell.alignment={horizontal:'right'};
        if(col===9) cell.font={bold:true};
      });
      rowNum++;
    }

    const totalRow = ws.addRow(['',`TOTALES (${liquidaciones.length})`, '','','','',fmt(sumaHaberes),fmt(sumaDesc),fmt(sumaNeto),fmt(sumaContrib),'']);
    totalRow.eachCell((cell,col) => {
      cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F0E8'}};
      cell.font={bold:true};
      if(col>=7) cell.alignment={horizontal:'right'};
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="nomina_${empresa.cuit}_${anio}${String(mes).padStart(2,'0')}.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
});

// GET /api/liquidaciones/:id
router.get('/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidacion = await prisma.liquidacion.findFirst({
      where: {
        id: req.params.id,
        periodo: { empresa: { estudioId: req.usuario.estudioId } },
      },
      include: {
        empleado: { include: { empresa: { include: { convenio: true } } } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' } },
      },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });
    res.json(liquidacion);
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/:id/confirmar
router.post('/:id/confirmar', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidacion = await prisma.liquidacion.findFirst({
      where: { id: req.params.id, periodo: { empresa: { estudioId: req.usuario.estudioId } } },
      include: {
        empleado: { include: { empresa: { select: { id: true, razonSocial: true } } } },
        detalles: true,
      },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const updated = await prisma.liquidacion.update({
      where: { id: req.params.id },
      data: { estado: 'CONFIRMADO' },
    });

    // Intenta crear asiento automático (no bloquea si falla)
    const asiento = await crearAsientoLiquidacion(liquidacion);

    await logAccion({
      usuarioId: req.usuario.id,
      estudioId: req.usuario.estudioId,
      accion: 'CONFIRMAR_LIQUIDACION',
      entidad: 'Liquidacion',
      entidadId: req.params.id,
      detalle: { empleado: `${liquidacion.empleado?.apellido} ${liquidacion.empleado?.nombre}`, mes: liquidacion.mes, anio: liquidacion.anio, totalNeto: liquidacion.totalNeto },
      ip: req.ip,
    });

    res.json({ ...updated, asientoCreado: !!asiento, asientoId: asiento?.id });
  } catch (err) {
    next(err);
  }
});

// PUT /api/liquidaciones/:id/conceptos — modifica líneas de una liquidación no confirmada
router.put('/:id/conceptos', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidacion = await prisma.liquidacion.findFirst({
      where: { id: req.params.id, periodo: { empresa: { estudioId: req.usuario.estudioId } } },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });
    if (liquidacion.estado === 'CONFIRMADO') return res.status(409).json({ error: 'No se puede modificar una liquidación confirmada' });

    const { detalles } = req.body;
    if (!Array.isArray(detalles)) return res.status(400).json({ error: 'detalles debe ser un array' });

    await prisma.$transaction([
      prisma.detalleLiquidacion.deleteMany({ where: { liquidacionId: req.params.id } }),
      prisma.detalleLiquidacion.createMany({
        data: detalles.map((d, i) => ({
          liquidacionId: req.params.id,
          conceptoId: d.conceptoId,
          descripcion: d.descripcion,
          naturaleza: d.naturaleza,
          tipo: d.tipo,
          remunerativo: d.remunerativo ?? true,
          importe: d.importe,
          cantidad: d.cantidad || null,
          valorUnitario: d.valorUnitario || null,
          orden: d.orden ?? i + 1,
        })),
      }),
    ]);

    const haberes = detalles.filter(d => d.naturaleza === 'HABER').reduce((s, d) => s + Number(d.importe), 0);
    const descuentos = detalles.filter(d => d.naturaleza === 'DESCUENTO').reduce((s, d) => s + Math.abs(Number(d.importe)), 0);
    const contribuciones = detalles.filter(d => d.naturaleza === 'INFORMATIVO').reduce((s, d) => s + Number(d.importe), 0);

    const updated = await prisma.liquidacion.update({
      where: { id: req.params.id },
      data: {
        totalHaberes: haberes,
        totalDescuentos: descuentos,
        totalNeto: haberes - descuentos,
        totalContribuciones: contribuciones,
      },
      include: { detalles: { orderBy: { orden: 'asc' } } },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/liquidaciones/:id/recibo (PDF)
router.get('/:id/recibo', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidacion = await prisma.liquidacion.findFirst({
      where: {
        id: req.params.id,
        periodo: { empresa: { estudioId: req.usuario.estudioId } },
      },
      include: {
        empleado: { include: { empresa: { include: { estudio: true, convenio: true } }, convenio: true } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' }, include: { concepto: { select: { codigo: true, unidad: true } } } },
      },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const pdfBuffer = await pdfService.generarRecibo(liquidacion);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibo_${liquidacion.empleado.apellido}_${liquidacion.anio}${String(liquidacion.mes).padStart(2, '0')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// POST /api/liquidaciones/enviar-recibos-whatsapp — envía recibos PDF por WhatsApp
// Body: { empresaId, anio, mes, tipo? }
// Para que el destinatario pueda descargar el PDF, lo guardamos en /uploads/recibos/
// y enviamos la URL pública. Requiere PUBLIC_URL configurada para producción.
router.post('/enviar-recibos-whatsapp', auth, [
  body('empresaId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipo = 'MENSUAL' } = req.body;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
      include: { estudio: { select: { razonSocial: true } } },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { periodo: { empresaId, anio: Number(anio), mes: Number(mes), tipo }, estado: 'CONFIRMADO' },
      include: {
        empleado: { include: { empresa: { include: { estudio: true, convenio: true } }, convenio: true } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' }, include: { concepto: { select: { codigo: true, unidad: true } } } },
      },
      orderBy: { empleado: { apellido: 'asc' } },
    });

    if (liquidaciones.length === 0) {
      return res.status(404).json({ error: 'No hay liquidaciones CONFIRMADAS en este período' });
    }

    const { enviarRecibo: enviarReciboWA } = require('../services/whatsappService');
    const fs = require('fs');
    const path = require('path');

    // Preparar carpeta pública para recibos
    const uploadDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads', 'recibos');
    fs.mkdirSync(uploadDir, { recursive: true });
    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

    const enviados = [];
    const sinTelefono = [];
    const errores = [];
    const MESES_NOM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const periodoStr = `${MESES_NOM[Number(mes) - 1]} ${anio}`;

    // Chunk de 3 para no saturar la API del provider
    const CHUNK = 3;
    for (let i = 0; i < liquidaciones.length; i += CHUNK) {
      const slice = liquidaciones.slice(i, i + CHUNK);
      await Promise.allSettled(slice.map(async (liq) => {
        const empleado = liq.empleado;
        const nombre = `${empleado.apellido}, ${empleado.nombre}`;
        const telefono = empleado.telefono;
        if (!telefono) {
          sinTelefono.push({ empleadoId: empleado.id, nombre, cuil: empleado.cuil });
          return;
        }
        try {
          // Generar PDF y guardarlo en /uploads/recibos/<liqId>.pdf (URL pública)
          const pdfBuffer = await pdfService.generarRecibo(liq);
          const fileName = `recibo_${liq.id}.pdf`;
          const filePath = path.join(uploadDir, fileName);
          fs.writeFileSync(filePath, pdfBuffer);
          const pdfUrl = `${baseUrl}/uploads/recibos/${fileName}`;

          const r = await enviarReciboWA({
            telefono,
            empleadoNombre: empleado.nombre,
            periodo: periodoStr,
            neto: liq.totalNeto,
            pdfUrl,
            pdfNombre: fileName,
            estudioNombre: empresa.estudio?.razonSocial,
          });
          enviados.push({ empleadoId: empleado.id, nombre, telefono, providerId: r.providerId, provider: r.provider });
        } catch (e) {
          errores.push({ empleadoId: empleado.id, nombre, telefono, error: e.message });
        }
      }));
    }

    await logAccion({
      usuarioId: req.usuario.id,
      estudioId: req.usuario.estudioId,
      accion: 'ENVIAR_RECIBOS_WHATSAPP',
      entidad: 'PeriodoLiquidacion',
      detalle: {
        empresaId, anio, mes, tipo,
        total: liquidaciones.length, enviados: enviados.length, sinTelefono: sinTelefono.length, errores: errores.length,
      },
      ip: req.ip,
    });

    res.json({
      total: liquidaciones.length,
      enviados: enviados.length,
      sinTelefono: sinTelefono.length,
      errores: errores.length,
      provider: require('../services/whatsappService').PROVIDER,
      detalle: { enviados, sinTelefono, errores },
    });
  } catch (err) { next(err); }
});

// POST /api/liquidaciones/enviar-recibos-bulk — envía por email los recibos
// PDF de todas las liquidaciones CONFIRMADAS de un período a sus empleados.
// Body: { empresaId, anio, mes, tipo? }
router.post('/enviar-recibos-bulk', auth, [
  body('empresaId').isUUID(),
  body('anio').isInt({ min: 2000, max: 2099 }),
  body('mes').isInt({ min: 1, max: 12 }),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipo = 'MENSUAL' } = req.body;

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { periodo: { empresaId, anio: Number(anio), mes: Number(mes), tipo }, estado: 'CONFIRMADO' },
      include: {
        empleado: { include: { empresa: { include: { estudio: true, convenio: true } }, convenio: true } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' }, include: { concepto: { select: { codigo: true, unidad: true } } } },
      },
      orderBy: { empleado: { apellido: 'asc' } },
    });

    if (liquidaciones.length === 0) {
      return res.status(404).json({ error: 'No hay liquidaciones CONFIRMADAS en este período' });
    }

    const { enviarRecibo } = require('../services/emailService');

    const enviados = [];
    const sinEmail = [];
    const errores = [];

    // Procesar en chunks de 3 en paralelo (SMTP puede limitar conexiones simultáneas)
    const CHUNK = 3;
    for (let i = 0; i < liquidaciones.length; i += CHUNK) {
      const slice = liquidaciones.slice(i, i + CHUNK);
      await Promise.allSettled(slice.map(async (liq) => {
        const empleado = liq.empleado;
        const nombre = `${empleado.apellido}, ${empleado.nombre}`;
        if (!empleado.email) {
          sinEmail.push({ empleadoId: empleado.id, nombre, cuil: empleado.cuil });
          return;
        }
        try {
          const pdfBuffer = await pdfService.generarRecibo(liq);
          const nombreArchivo = `recibo_${empleado.apellido}_${anio}${String(mes).padStart(2, '0')}.pdf`;
          await enviarRecibo(empleado.email, nombre, pdfBuffer, nombreArchivo);
          enviados.push({ empleadoId: empleado.id, nombre, email: empleado.email });
        } catch (e) {
          errores.push({ empleadoId: empleado.id, nombre, email: empleado.email, error: e.message });
        }
      }));
    }

    await logAccion({
      usuarioId: req.usuario.id,
      estudioId: req.usuario.estudioId,
      accion: 'ENVIAR_RECIBOS_BULK',
      entidad: 'PeriodoLiquidacion',
      detalle: {
        empresaId, anio, mes, tipo,
        total: liquidaciones.length, enviados: enviados.length, sinEmail: sinEmail.length, errores: errores.length,
      },
      ip: req.ip,
    });

    res.json({
      total: liquidaciones.length,
      enviados: enviados.length,
      sinEmail: sinEmail.length,
      errores: errores.length,
      detalle: { enviados, sinEmail, errores },
    });
  } catch (err) {
    if (err.message?.includes('SMTP') || err.message?.includes('nodemailer')) {
      return res.status(503).json({ error: err.message });
    }
    next(err);
  }
});

// POST /api/liquidaciones/:id/enviar-recibo
router.post('/:id/enviar-recibo', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const liquidacion = await prisma.liquidacion.findFirst({
      where: { id: req.params.id, periodo: { empresa: { estudioId: req.usuario.estudioId } } },
      include: {
        empleado: { include: { empresa: { include: { estudio: true, convenio: true } }, convenio: true } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' }, include: { concepto: { select: { codigo: true, unidad: true } } } },
      },
    });
    if (!liquidacion) return res.status(404).json({ error: 'Liquidación no encontrada' });

    const email = req.body.email || liquidacion.empleado?.email;
    if (!email) return res.status(400).json({ error: 'El empleado no tiene email registrado. Provea uno en el cuerpo de la solicitud.' });

    const { enviarRecibo } = require('../services/emailService');
    const pdfBuffer = await pdfService.generarRecibo(liquidacion);
    const nombreArchivo = `recibo_${liquidacion.empleado.apellido}_${liquidacion.anio}${String(liquidacion.mes).padStart(2, '0')}.pdf`;

    await enviarRecibo(email, `${liquidacion.empleado.apellido}, ${liquidacion.empleado.nombre}`, pdfBuffer, nombreArchivo);
    res.json({ ok: true, enviadoA: email });
  } catch (err) {
    if (err.message?.includes('SMTP') || err.message?.includes('nodemailer')) {
      return res.status(503).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
