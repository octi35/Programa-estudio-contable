const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const pdfService = require('../services/pdfService');


const MESES_NOM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const fmtARS = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 });

// GET /api/reportes/resumen-empresa/:empresaId/:anio/:mes
router.get('/resumen-empresa/:empresaId/:anio/:mes', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.params;
    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { periodo: { empresaId, anio: Number(anio), mes: Number(mes) }, tipo: 'MENSUAL' },
      include: { empleado: { select: { apellido: true, nombre: true, cuil: true, categoria: true } } },
    });

    const totales = liquidaciones.reduce((acc, liq) => ({
      totalHaberes: acc.totalHaberes + Number(liq.totalHaberes),
      totalDescuentos: acc.totalDescuentos + Number(liq.totalDescuentos),
      totalNeto: acc.totalNeto + Number(liq.totalNeto),
      totalContribuciones: acc.totalContribuciones + Number(liq.totalContribuciones),
      cantEmpleados: acc.cantEmpleados + 1,
    }), { totalHaberes: 0, totalDescuentos: 0, totalNeto: 0, totalContribuciones: 0, cantEmpleados: 0 });

    totales.costoTotal = totales.totalHaberes + totales.totalContribuciones;
    res.json({ empresa, periodo: { anio: Number(anio), mes: Number(mes) }, totales, liquidaciones });
  } catch (err) { next(err); }
});

// GET /api/reportes/panel-estudio
router.get('/panel-estudio', auth, async (req, res, next) => {
  try {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth() + 1;

    const [cantEmpresas, cantEmpleados, liquidacionesMes] = await Promise.all([
      prisma.empresa.count({ where: { estudioId: req.usuario.estudioId, activa: true } }),
      prisma.empleado.count({ where: { empresa: { estudioId: req.usuario.estudioId }, activo: true } }),
      prisma.liquidacion.findMany({
        where: { periodo: { empresa: { estudioId: req.usuario.estudioId }, anio, mes }, tipo: 'MENSUAL' },
        select: { totalHaberes: true, totalNeto: true, estado: true },
      }),
    ]);

    const empresas = await prisma.empresa.findMany({
      where: { estudioId: req.usuario.estudioId, activa: true },
      select: {
        id: true, razonSocial: true, cuit: true,
        _count: { select: { empleados: { where: { activo: true } } } },
        periodos: { where: { anio, mes }, select: { estado: true, _count: { select: { liquidaciones: true } } }, take: 1 },
      },
      orderBy: { razonSocial: 'asc' },
    });

    res.json({
      resumen: { cantEmpresas, cantEmpleados, liquidacionesMes: liquidacionesMes.length, totalMensual: liquidacionesMes.reduce((s, l) => s + Number(l.totalHaberes), 0) },
      empresas, periodo: { anio, mes },
    });
  } catch (err) { next(err); }
});

// GET /api/reportes/comparativo/:empresaId
router.get('/comparativo/:empresaId', auth, async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const { meses = 6 } = req.query;
    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const periodos = await prisma.periodoLiquidacion.findMany({
      where: { empresaId, tipo: 'MENSUAL' },
      include: { _count: { select: { liquidaciones: true } }, liquidaciones: { select: { totalHaberes: true, totalDescuentos: true, totalNeto: true }, where: { tipo: 'MENSUAL' } } },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: Number(meses),
    });

    const comparativo = periodos.map(p => ({
      anio: p.anio, mes: p.mes,
      cantLiquidaciones: p._count.liquidaciones,
      totalHaberes: p.liquidaciones.reduce((s, l) => s + Number(l.totalHaberes), 0),
      totalNeto: p.liquidaciones.reduce((s, l) => s + Number(l.totalNeto), 0),
    })).reverse();

    res.json({ empresa, comparativo });
  } catch (err) { next(err); }
});

// Mapa de módulos → entidades del sistema (para filtro agrupado en log de acciones)
const MODULOS_LOG = {
  SUELDOS:      ['Liquidacion', 'Empleado', 'Familiar', 'Ausentismo', 'PeriodoLiquidacion', 'NovedadEmpleado', 'Concepto'],
  IVA:          ['ComprobanteIVA', 'ProveedorCliente', 'PagoComprobante'],
  CONTABILIDAD: ['Asiento', 'CuentaContable', 'EjercicioContable', 'LineaAsiento'],
  IMPUESTOS:    ['DeclaracionIIBB', 'GananciasEmpleado', 'MonotributoCliente', 'ComprobanteElectronico'],
  GESTION:      ['Usuario', 'Empresa', 'Estudio', 'Sucursal', 'ParametroFiscal', 'Honorario', 'FacturaHonorarios'],
  FINANZAS:     ['CuentaBancaria', 'MovimientoBancario', 'TipoCambio', 'Presupuesto'],
};

// Clasificación de la acción según su prefijo/sufijo: CREAR, EDITAR, ELIMINAR, AUTH, OTRO
function tipoDeAccion(accion = '') {
  const a = accion.toUpperCase();
  if (a.startsWith('CREAR') || a === 'CREATE') return 'CREAR';
  if (a.startsWith('ACTUALIZAR') || a.startsWith('EDITAR') || a.startsWith('MODIFICAR') || a === 'UPDATE') return 'EDITAR';
  if (a.startsWith('ELIMINAR') || a.startsWith('ANULAR') || a.startsWith('BORRAR') || a === 'DELETE') return 'ELIMINAR';
  if (a.startsWith('CONFIRMAR') || a.startsWith('CERRAR')) return 'CONFIRMAR';
  if (a === 'LOGIN' || a === 'LOGOUT' || a.startsWith('LOGIN_')) return 'AUTH';
  return 'OTRO';
}

const ACCIONES_POR_TIPO = {
  CREAR: { startsWith: ['CREAR'] },
  EDITAR: { startsWith: ['ACTUALIZAR', 'EDITAR', 'MODIFICAR'] },
  ELIMINAR: { startsWith: ['ELIMINAR', 'ANULAR', 'BORRAR'] },
  CONFIRMAR: { startsWith: ['CONFIRMAR', 'CERRAR'] },
  AUTH: { equals: ['LOGIN', 'LOGOUT'], startsWith: ['LOGIN_'] },
};

// GET /api/reportes/log-acciones
router.get('/log-acciones', auth, async (req, res, next) => {
  try {
    const { entidad, usuarioId, modulo, tipoAccion, desde, hasta, q, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = { estudioId: req.usuario.estudioId };

    if (entidad) where.entidad = entidad;
    if (usuarioId) where.usuarioId = usuarioId;

    if (modulo && MODULOS_LOG[modulo]) {
      // Si vino también `entidad`, prevalece entidad (más específica)
      if (!entidad) where.entidad = { in: MODULOS_LOG[modulo] };
    }

    if (tipoAccion && ACCIONES_POR_TIPO[tipoAccion]) {
      const cfg = ACCIONES_POR_TIPO[tipoAccion];
      const OR = [];
      (cfg.startsWith || []).forEach(p => OR.push({ accion: { startsWith: p } }));
      (cfg.equals || []).forEach(e => OR.push({ accion: e }));
      if (OR.length) where.OR = OR;
    }

    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt.gte = new Date(desde);
      if (hasta) {
        const h = new Date(hasta);
        h.setHours(23, 59, 59, 999);
        where.createdAt.lte = h;
      }
    }

    if (q) {
      const search = String(q).trim();
      where.AND = [{
        OR: [
          { accion: { contains: search, mode: 'insensitive' } },
          { entidad: { contains: search, mode: 'insensitive' } },
          { entidadId: { contains: search, mode: 'insensitive' } },
        ],
      }];
    }

    const [logs, total, usuarios] = await Promise.all([
      prisma.logAccion.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.logAccion.count({ where }),
      prisma.usuario.findMany({ where: { estudioId: req.usuario.estudioId }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    ]);

    res.json({
      data: logs,
      usuarios,
      modulos: Object.keys(MODULOS_LOG),
      tiposAccion: Object.keys(ACCIONES_POR_TIPO),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) { next(err); }
});

// GET /api/reportes/f931?empresaId&anio&mes — Exporta datos F.931 en Excel y TXT SICOSS
router.get('/f931', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes, formato = 'excel' } = req.query;
    if (!empresaId || !anio || !mes) return res.status(400).json({ error: 'empresaId, anio y mes requeridos' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { periodo: { empresaId, anio: Number(anio), mes: Number(mes) }, tipo: 'MENSUAL', estado: { in: ['CALCULADO', 'CONFIRMADO'] } },
      include: {
        empleado: { select: { apellido: true, nombre: true, cuil: true, legajoNumero: true, categoria: true, cbu: true, fechaIngreso: true, diasTrabajados: true } },
        detalles: { where: { naturaleza: { in: ['HABER', 'DESCUENTO', 'INFORMATIVO'] } } },
      },
      orderBy: { empleado: { apellido: 'asc' } },
    });

    const cuitSinGuion = empresa.cuit.replace(/-/g, '');
    const periodo = `${anio}${String(mes).padStart(2, '0')}`;

    if (formato === 'txt') {
      // Formato TXT para importación SICOSS
      const lines = [];

      // Registro tipo 1 — Cabecera del empleador
      const cantEmpleados = String(liquidaciones.length).padStart(5, '0');
      const totalRemun = liquidaciones.reduce((s, l) => s + Number(l.totalHaberes), 0);
      const totalApJub = liquidaciones.reduce((s, l) => s + Number(l.totalDescuentos) * 0.579, 0);
      lines.push(`1${cuitSinGuion}${periodo}${cantEmpleados}${String(Math.round(totalRemun * 100)).padStart(15, '0')}`.padEnd(120, ' '));

      // Registro tipo 2 — Detalle por empleado
      for (const liq of liquidaciones) {
        const emp = liq.empleado;
        const cuil = emp.cuil.replace(/-/g, '').padStart(11, '0');
        const remun = Math.round(Number(liq.totalHaberes) * 100);
        const apJub = Math.round(Number(liq.totalHaberes) * 0.11 * 100);
        const apOS = Math.round(Number(liq.totalHaberes) * 0.03 * 100);
        const apPami = Math.round(Number(liq.totalHaberes) * 0.03 * 100);
        const cjJub = Math.round(Number(liq.totalHaberes) * 0.16 * 100);
        const cjOS = Math.round(Number(liq.totalHaberes) * 0.06 * 100);
        const cjPami = Math.round(Number(liq.totalHaberes) * 0.015 * 100);
        const dias = String(liq.diasTrabajados || 30).padStart(2, '0');
        const cbu = (emp.cbu || '0'.repeat(22)).replace(/\D/g, '').padStart(22, '0').slice(0, 22);

        lines.push(
          `2${cuil}01${cbu}01${dias}1` +
          String(remun).padStart(15, '0') +
          String(apJub).padStart(15, '0') +
          String(apOS).padStart(15, '0') +
          String(apPami).padStart(15, '0') +
          String(cjJub).padStart(15, '0') +
          String(cjOS).padStart(15, '0') +
          String(cjPami).padStart(15, '0')
        );
      }

      // Registro tipo 9 — Cierre
      lines.push(`9${cuitSinGuion}${periodo}${cantEmpleados}`.padEnd(60, ' '));

      const txt = lines.join('\r\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="F931_${cuitSinGuion}_${periodo}.txt"`);
      return res.send(txt);
    }

    // Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EstudioPRO';
    const ws = wb.addWorksheet('F.931');
    const wsResumen = wb.addWorksheet('Resumen SICOSS');

    // Título
    ws.mergeCells('A1:P1');
    ws.getCell('A1').value = `DECLARACIÓN JURADA F.931 — SICOSS — ${empresa.razonSocial} — ${MESES_NOM[Number(mes)-1]} ${anio}`;
    ws.getCell('A1').font = { bold: true, size: 12 };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 22;

    ws.mergeCells('A2:P2');
    ws.getCell('A2').value = `CUIT Empleador: ${empresa.cuit}  |  Período: ${periodo}  |  Empleados: ${liquidaciones.length}  |  Generado: ${new Date().toLocaleDateString('es-AR')}`;
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.addRow([]);

    const headers = [
      'CUIL','Apellido y Nombre','Legajo','Días Trab.','Situación',
      'Remun. Bruta','Ap.Jubilación 11%','Ap.Obra Social 3%','Ap.PAMI 3%','Total Aportes',
      'Ct.Jubilación 16%','Ct.Obra Social 6%','Ct.PAMI 1.5%','Ct.ART 2.5%','Total Contrib.',
      'Costo Total'
    ];
    const hr = ws.addRow(headers);
    hr.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    hr.height = 30;

    const colWidths = [16,28,8,8,10,16,16,16,16,16,16,16,16,16,16,16];
    colWidths.forEach((w, i) => { ws.getColumn(i+1).width = w; });

    let sumBruta=0, sumApJub=0, sumApOS=0, sumApPami=0, sumCjJub=0, sumCjOS=0, sumCjPami=0, sumART=0;
    let rowIdx = 5;

    for (const liq of liquidaciones) {
      const emp = liq.empleado;
      const bruta = Number(liq.totalHaberes);
      const apJub = bruta * 0.11, apOS = bruta * 0.03, apPami = bruta * 0.03;
      const cjJub = bruta * 0.16, cjOS = bruta * 0.06, cjPami = bruta * 0.015, art = bruta * 0.025;
      const totalAp = apJub + apOS + apPami;
      const totalCj = cjJub + cjOS + cjPami + art;

      sumBruta+=bruta; sumApJub+=apJub; sumApOS+=apOS; sumApPami+=apPami;
      sumCjJub+=cjJub; sumCjOS+=cjOS; sumCjPami+=cjPami; sumART+=art;

      const row = ws.addRow([
        emp.cuil, `${emp.apellido}, ${emp.nombre}`, emp.legajoNumero||'—',
        liq.diasTrabajados||30, '01',
        fmtARS(bruta), fmtARS(apJub), fmtARS(apOS), fmtARS(apPami), fmtARS(totalAp),
        fmtARS(cjJub), fmtARS(cjOS), fmtARS(cjPami), fmtARS(art), fmtARS(totalCj),
        fmtARS(bruta + totalCj)
      ]);
      row.eachCell((cell, col) => {
        if (rowIdx % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FF' } };
        if (col >= 6) cell.alignment = { horizontal: 'right' };
        if (col === 10 || col === 15 || col === 16) cell.font = { bold: true };
      });
      rowIdx++;
    }

    // Totals row
    const totRow = ws.addRow([
      '', `TOTALES (${liquidaciones.length} empleados)`, '', '', '',
      fmtARS(sumBruta), fmtARS(sumApJub), fmtARS(sumApOS), fmtARS(sumApPami), fmtARS(sumApJub+sumApOS+sumApPami),
      fmtARS(sumCjJub), fmtARS(sumCjOS), fmtARS(sumCjPami), fmtARS(sumART), fmtARS(sumCjJub+sumCjOS+sumCjPami+sumART),
      fmtARS(sumBruta+sumCjJub+sumCjOS+sumCjPami+sumART)
    ]);
    totRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0E8' } };
      cell.font = { bold: true };
    });

    // Hoja resumen SICOSS
    wsResumen.mergeCells('A1:D1');
    wsResumen.getCell('A1').value = `RESUMEN PARA SICOSS — ${empresa.razonSocial} — ${MESES_NOM[Number(mes)-1]} ${anio}`;
    wsResumen.getCell('A1').font = { bold: true, size: 11 };
    wsResumen.addRow([]);

    const resumenData = [
      ['CUIT Empleador', empresa.cuit],
      ['Período', `${MESES_NOM[Number(mes)-1]} ${anio} (${periodo})`],
      ['Cantidad de empleados', liquidaciones.length],
      ['', ''],
      ['TOTAL Remuneraciones Brutas', fmtARS(sumBruta)],
      ['', ''],
      ['APORTES DEL EMPLEADO', ''],
      ['  Jubilación (11%)', fmtARS(sumApJub)],
      ['  Obra Social (3%)', fmtARS(sumApOS)],
      ['  PAMI/INSSJP (3%)', fmtARS(sumApPami)],
      ['  TOTAL APORTES', fmtARS(sumApJub+sumApOS+sumApPami)],
      ['', ''],
      ['CONTRIBUCIONES DEL EMPLEADOR', ''],
      ['  Jubilación (16%)', fmtARS(sumCjJub)],
      ['  Obra Social (6%)', fmtARS(sumCjOS)],
      ['  PAMI/INSSJP (1.5%)', fmtARS(sumCjPami)],
      ['  ART (2.5%)', fmtARS(sumART)],
      ['  TOTAL CONTRIBUCIONES', fmtARS(sumCjJub+sumCjOS+sumCjPami+sumART)],
      ['', ''],
      ['COSTO TOTAL EMPLEADOR (Bruta + Contrib)', fmtARS(sumBruta+sumCjJub+sumCjOS+sumCjPami+sumART)],
    ];

    resumenData.forEach((row, i) => {
      const r = wsResumen.addRow(row);
      if (row[0].startsWith('  TOTAL') || row[0] === 'COSTO TOTAL EMPLEADOR (Bruta + Contrib)') r.font = { bold: true };
      if (row[0] === 'APORTES DEL EMPLEADO' || row[0] === 'CONTRIBUCIONES DEL EMPLEADOR') r.font = { bold: true, color: { argb: 'FF1E3A5F' } };
    });
    wsResumen.getColumn(1).width = 42;
    wsResumen.getColumn(2).width = 22;

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="F931_${cuitSinGuion}_${periodo}.xlsx"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// GET /api/reportes/libro-sueldos-data?empresaId&anio&mes — Previsualización JSON del Libro de Sueldos
router.get('/libro-sueldos-data', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.query;
    if (!empresaId || !anio || !mes) return res.status(400).json({ error: 'empresaId, anio y mes requeridos' });

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
      include: { convenio: true },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { periodo: { empresaId, anio: Number(anio), mes: Number(mes) }, tipo: 'MENSUAL', estado: { in: ['CALCULADO', 'CONFIRMADO'] } },
      include: { empleado: { select: { apellido: true, nombre: true, cuil: true, legajoNumero: true, categoria: true } } },
      orderBy: { empleado: { apellido: 'asc' } },
    });

    const filas = liquidaciones.map(liq => ({
      id: liq.id,
      legajo: liq.empleado.legajoNumero || '—',
      nombre: `${liq.empleado.apellido}, ${liq.empleado.nombre}`,
      cuil: liq.empleado.cuil,
      categoria: liq.empleado.categoria || '—',
      diasTrabajados: liq.diasTrabajados || 30,
      totalHaberes: Number(liq.totalHaberes),
      totalDescuentos: Number(liq.totalDescuentos),
      totalNeto: Number(liq.totalNeto),
      totalContribuciones: Number(liq.totalContribuciones),
      estado: liq.estado,
    }));

    const totales = filas.reduce((acc, f) => ({
      totalHaberes: acc.totalHaberes + f.totalHaberes,
      totalDescuentos: acc.totalDescuentos + f.totalDescuentos,
      totalNeto: acc.totalNeto + f.totalNeto,
      totalContribuciones: acc.totalContribuciones + f.totalContribuciones,
    }), { totalHaberes: 0, totalDescuentos: 0, totalNeto: 0, totalContribuciones: 0 });

    res.json({
      empresa: { id: empresa.id, razonSocial: empresa.razonSocial, cuit: empresa.cuit, convenio: empresa.convenio?.nombre || 'LCT 20.744' },
      periodo: { anio: Number(anio), mes: Number(mes), nombre: `${MESES_NOM[Number(mes) - 1]} ${anio}` },
      filas,
      totales,
    });
  } catch (err) { next(err); }
});

// GET /api/reportes/libro-sueldos?empresaId&anio&mes — Exporta Libro de Sueldos Digital (LSD)
router.get('/libro-sueldos', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes, formato = 'excel' } = req.query;
    if (!empresaId || !anio || !mes) return res.status(400).json({ error: 'empresaId, anio y mes requeridos' });

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
      include: { convenio: true },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { periodo: { empresaId, anio: Number(anio), mes: Number(mes) }, tipo: 'MENSUAL', estado: { in: ['CALCULADO', 'CONFIRMADO'] } },
      include: {
        empleado: true,
        detalles: { orderBy: { orden: 'asc' } },
      },
      orderBy: { empleado: { apellido: 'asc' } },
    });

    const periodo = `${anio}${String(mes).padStart(2, '0')}`;
    const cuitSinGuion = empresa.cuit.replace(/-/g, '');

    if (formato === 'txt') {
      const lines = [];
      for (const liq of liquidaciones) {
        const emp = liq.empleado;
        const cuil = emp.cuil.replace(/-/g, '').padStart(11, '0');
        const bruta = Math.round(Number(liq.totalHaberes) * 100);
        const neta = Math.round(Number(liq.totalNeto) * 100);
        const aports = Math.round(Number(liq.totalDescuentos) * 100);
        const contribs = Math.round(Number(liq.totalContribuciones) * 100);

        lines.push(
          `${cuitSinGuion}|${cuil}|${periodo}|01|01|` +
          `${String(bruta).padStart(15,'0')}|${String(aports).padStart(15,'0')}|${String(contribs).padStart(15,'0')}|${String(neta).padStart(15,'0')}|` +
          `${liq.diasTrabajados||30}`
        );
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="LSD_${cuitSinGuion}_${periodo}.txt"`);
      return res.send(lines.join('\r\n'));
    }

    // Excel format — Hojas Móviles Libro de Sueldos
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EstudioPRO';

    for (const liq of liquidaciones) {
      const emp = liq.empleado;
      const wsName = `${emp.apellido} ${emp.nombre}`.substring(0, 31);
      const ws = wb.addWorksheet(wsName);

      // Employee header
      ws.mergeCells('A1:F1');
      ws.getCell('A1').value = `HOJA MÓVIL — LIBRO DE SUELDOS Y JORNALES`;
      ws.getCell('A1').font = { bold: true, size: 12 };
      ws.getCell('A1').alignment = { horizontal: 'center' };

      ws.mergeCells('A2:F2');
      ws.getCell('A2').value = `${empresa.razonSocial} — CUIT: ${empresa.cuit} — Período: ${MESES_NOM[Number(mes)-1]} ${anio}`;
      ws.getCell('A2').alignment = { horizontal: 'center' };
      ws.addRow([]);

      const info = [
        ['Empleado:', `${emp.apellido}, ${emp.nombre}`, 'CUIL:', emp.cuil],
        ['Legajo:', emp.legajoNumero || '—', 'Fecha Ingreso:', emp.fechaIngreso ? new Date(emp.fechaIngreso).toLocaleDateString('es-AR') : '—'],
        ['Categoría:', emp.categoria || '—', 'Puesto:', emp.puesto || '—'],
        ['Convenio:', empresa.convenio?.nombre || 'LCT 20.744', 'Obra Social:', emp.obraSocialNombre || '—'],
        ['Días Trabajados:', liq.diasTrabajados || 30, 'Básico:', fmtARS(emp.basicoMensual)],
      ];
      info.forEach(row => {
        const r = ws.addRow(row);
        r.getCell(1).font = { bold: true };
        r.getCell(3).font = { bold: true };
      });
      ws.addRow([]);

      // Concepts
      const hdr = ws.addRow(['Código', 'Concepto', 'Naturaleza', 'Tipo', 'Cantidad', 'Importe']);
      hdr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; });

      const haberes = liq.detalles.filter(d => d.naturaleza === 'HABER');
      const descuentos = liq.detalles.filter(d => d.naturaleza === 'DESCUENTO');
      const informativos = liq.detalles.filter(d => d.naturaleza === 'INFORMATIVO');

      [...haberes, ...descuentos, ...informativos].forEach((d, i) => {
        const r = ws.addRow([d.codigo || '—', d.descripcion, d.naturaleza, d.tipo, d.cantidad || '', fmtARS(Math.abs(Number(d.importe)))]);
        if (i % 2 === 0) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FF' } }; });
        r.getCell(3).font = { color: { argb: d.naturaleza === 'HABER' ? 'FF1a6b1a' : d.naturaleza === 'DESCUENTO' ? 'FF8b1a1a' : 'FF555555' } };
      });

      ws.addRow([]);
      const totR = ws.addRow(['', 'TOTAL HABERES:', '', '', '', fmtARS(liq.totalHaberes)]);
      totR.font = { bold: true };
      const totD = ws.addRow(['', 'TOTAL DESCUENTOS:', '', '', '', fmtARS(liq.totalDescuentos)]);
      totD.font = { bold: true };
      const totN = ws.addRow(['', 'NETO A PERCIBIR:', '', '', '', fmtARS(liq.totalNeto)]);
      totN.font = { bold: true, size: 12 };
      totN.getCell(6).font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } };
      const totC = ws.addRow(['', 'CONTRIBUCIONES EMPLEADOR:', '', '', '', fmtARS(liq.totalContribuciones)]);
      totC.font = { color: { argb: 'FF666666' } };

      [18, 40, 15, 18, 10, 18].forEach((w, i) => { ws.getColumn(i+1).width = w; });
    }

    // Summary sheet
    const wsTot = wb.addWorksheet('TOTALES');
    wsTot.mergeCells('A1:G1');
    wsTot.getCell('A1').value = `RESUMEN — ${empresa.razonSocial} — ${MESES_NOM[Number(mes)-1]} ${anio}`;
    wsTot.getCell('A1').font = { bold: true, size: 12 };
    wsTot.addRow([]);
    const hTot = wsTot.addRow(['Legajo','Apellido y Nombre','CUIL','Días','Bruto','Descuentos','Neto','Contribuciones']);
    hTot.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; });

    liquidaciones.forEach((liq, i) => {
      const emp = liq.empleado;
      const r = wsTot.addRow([emp.legajoNumero||'—', `${emp.apellido}, ${emp.nombre}`, emp.cuil, liq.diasTrabajados||30, fmtARS(liq.totalHaberes), fmtARS(liq.totalDescuentos), fmtARS(liq.totalNeto), fmtARS(liq.totalContribuciones)]);
      if (i % 2 === 0) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FF' } }; });
    });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="LibroSueldos_${cuitSinGuion}_${periodo}.xlsx"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// GET /api/reportes/recibos-bulk?empresaId&anio&mes — PDF con todos los recibos del período
router.get('/recibos-bulk', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.query;
    if (!empresaId || !anio || !mes) return res.status(400).json({ error: 'empresaId, anio y mes requeridos' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { periodo: { empresaId, anio: Number(anio), mes: Number(mes) }, estado: { in: ['CALCULADO', 'CONFIRMADO'] } },
      include: {
        empleado: { include: { empresa: { include: { estudio: true, convenio: true } } } },
        periodo: true,
        detalles: { orderBy: { orden: 'asc' } },
      },
      orderBy: { empleado: { apellido: 'asc' } },
    });

    if (!liquidaciones.length) return res.status(404).json({ error: 'No hay liquidaciones para este período' });

    const pdfBuffer = await pdfService.generarRecibosBulk(liquidaciones);
    const periodo = `${anio}${String(mes).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Recibos_${empresa.cuit.replace(/-/g,'')}_${periodo}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// GET /api/reportes/empleados-excel — exporta planilla de empleados
router.get('/empleados-excel', auth, async (req, res, next) => {
  try {
    const { empresaId } = req.query;
    const where = { empresa: { estudioId: req.usuario.estudioId }, activo: true };
    if (empresaId) where.empresaId = empresaId;

    const empleados = await prisma.empleado.findMany({
      where,
      include: { empresa: { select: { razonSocial: true, cuit: true } } },
      orderBy: [{ empresa: { razonSocial: 'asc' } }, { apellido: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'EstudioPRO';
    const ws = wb.addWorksheet('Empleados');

    ws.mergeCells('A1:M1');
    ws.getCell('A1').value = 'NÓMINA DE EMPLEADOS — EstudioPRO';
    ws.getCell('A1').font = { bold: true, size: 12 };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.addRow([]);

    const headers = ['Empresa','Legajo','Apellido','Nombre','CUIL','DNI','Fecha Ingreso','Categoría','Puesto','Básico','Obra Social','CBU','Email'];
    const hr = ws.addRow(headers);
    hr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; });
    [28,8,18,18,16,12,14,14,18,14,20,26,28].forEach((w,i) => { ws.getColumn(i+1).width = w; });

    empleados.forEach((emp, i) => {
      const r = ws.addRow([
        emp.empresa?.razonSocial || '—', emp.legajoNumero||'—', emp.apellido, emp.nombre,
        emp.cuil, emp.dni||'—', emp.fechaIngreso ? new Date(emp.fechaIngreso).toLocaleDateString('es-AR') : '—',
        emp.categoria||'—', emp.puesto||'—', fmtARS(emp.basicoMensual||0),
        emp.obraSocialNombre||'—', emp.cbu||'—', emp.email||'—',
      ]);
      if (i % 2 === 0) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FF' } }; });
    });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Empleados_${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.send(buf);
  } catch (err) { next(err); }
});

module.exports = router;
