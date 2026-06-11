const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  getTiposVigentes,
  calcularContribucionesEmpresa,
  comparativoMesAnterior,
  FALLBACK_AR_2026,
  APORTES_EMPLEADO_FALLBACK,
} = require('../services/sueldos/contribucionesService');
const logAccion = require('../utils/logAccion');

// ── TIPOS DE CONTRIBUCIÓN (ABM) ───────────────────────────────────────────────

// GET /api/contribuciones/tipos?empresaId=&convenioId=&vigentesAl=YYYY-MM-DD
router.get('/tipos', auth, async (req, res, next) => {
  try {
    const { empresaId, convenioId, vigentesAl, todos } = req.query;
    if (todos === 'true') {
      const rows = await prisma.tipoContribucion.findMany({
        where: { estudioId: req.usuario.estudioId },
        orderBy: [{ codigo: 'asc' }, { vigenciaDesde: 'desc' }],
      });
      return res.json(rows);
    }
    const fecha = vigentesAl ? new Date(vigentesAl) : new Date();
    const tipos = await getTiposVigentes(
      req.usuario.estudioId,
      empresaId || null,
      convenioId || null,
      fecha,
    );
    res.json(tipos);
  } catch (err) { next(err); }
});

// GET /api/contribuciones/fallback — referencia con las alícuotas legales AR
router.get('/fallback', auth, (req, res) => {
  res.json({
    contribucionesPatronales: FALLBACK_AR_2026,
    aportesEmpleado: APORTES_EMPLEADO_FALLBACK,
  });
});

// POST /api/contribuciones/tipos
router.post('/tipos', auth, [
  body('codigo').isString().notEmpty(),
  body('nombre').isString().notEmpty(),
  body('alicuota').isFloat({ min: 0, max: 1 }),
  body('base').isIn(['REMUNERATIVO', 'BRUTO', 'PRESTACION_DINERARIA', 'FIJO']),
  body('vigenciaDesde').isISO8601(),
  validate,
], async (req, res, next) => {
  try {
    const data = {
      ...req.body,
      estudioId: req.usuario.estudioId,
      vigenciaDesde: new Date(req.body.vigenciaDesde),
      vigenciaHasta: req.body.vigenciaHasta ? new Date(req.body.vigenciaHasta) : null,
    };
    const row = await prisma.tipoContribucion.create({ data });
    await logAccion({
      usuarioId: req.usuario.id, estudioId: req.usuario.estudioId,
      accion: 'CREAR_TIPO_CONTRIBUCION', entidad: 'TipoContribucion', entidadId: row.id,
      detalle: { codigo: row.codigo, alicuota: row.alicuota },
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe ese tipo/vigencia' });
    next(err);
  }
});

// POST /api/contribuciones/tipos/cargar-fallback — alta masiva de las 7 categorías AR
router.post('/tipos/cargar-fallback', auth, [
  body('vigenciaDesde').isISO8601(),
  body('empresaId').optional().isUUID(),
  body('convenioId').optional().isUUID(),
  validate,
], async (req, res, next) => {
  try {
    const vigenciaDesde = new Date(req.body.vigenciaDesde);
    const empresaId = req.body.empresaId || null;
    const convenioId = req.body.convenioId || null;

    const data = FALLBACK_AR_2026.map(t => ({
      ...t,
      estudioId: req.usuario.estudioId,
      empresaId, convenioId, vigenciaDesde, activo: true,
    }));
    const result = await prisma.tipoContribucion.createMany({ data, skipDuplicates: true });
    res.status(201).json({ creadas: result.count, total: data.length });
  } catch (err) { next(err); }
});

// PUT /api/contribuciones/tipos/:id
router.put('/tipos/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existe = await prisma.tipoContribucion.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existe) return res.status(404).json({ error: 'No encontrado' });

    const { id, estudioId, ...data } = req.body;
    if (data.vigenciaDesde) data.vigenciaDesde = new Date(data.vigenciaDesde);
    if (data.vigenciaHasta) data.vigenciaHasta = new Date(data.vigenciaHasta);

    const upd = await prisma.tipoContribucion.update({ where: { id: req.params.id }, data });
    res.json(upd);
  } catch (err) { next(err); }
});

// DELETE /api/contribuciones/tipos/:id
router.delete('/tipos/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existe = await prisma.tipoContribucion.findFirst({
      where: { id: req.params.id, estudioId: req.usuario.estudioId },
    });
    if (!existe) return res.status(404).json({ error: 'No encontrado' });
    await prisma.tipoContribucion.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── CÁLCULO Y RESUMEN ────────────────────────────────────────────────────────

// GET /api/contribuciones/resumen?empresaId&anio&mes&tipo
router.get('/resumen', auth, [
  query('empresaId').isUUID(),
  query('anio').isInt({ min: 2000, max: 2099 }),
  query('mes').isInt({ min: 1, max: 12 }),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipo = 'MENSUAL', comparar } = req.query;
    if (comparar === 'true') {
      const r = await comparativoMesAnterior(req.usuario.estudioId, empresaId, Number(anio), Number(mes));
      return res.json(r);
    }
    const r = await calcularContribucionesEmpresa(req.usuario.estudioId, empresaId, Number(anio), Number(mes), tipo);
    res.json(r);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

// GET /api/contribuciones/exportar?empresaId&anio&mes — Excel detallado
router.get('/exportar', auth, [
  query('empresaId').isUUID(),
  query('anio').isInt({ min: 2000, max: 2099 }),
  query('mes').isInt({ min: 1, max: 12 }),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.query;
    const r = await calcularContribucionesEmpresa(req.usuario.estudioId, empresaId, Number(anio), Number(mes));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Contribuciones');
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    // Encabezado
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `Contribuciones Patronales — ${r.empresa.razonSocial} — ${MESES[Number(mes) - 1]} ${anio}`;
    ws.getCell('A1').font = { bold: true, size: 13 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `CUIT: ${r.empresa.cuit} | Empleados: ${r.cantidadEmpleados} | Generado: ${new Date().toLocaleDateString('es-AR')}`;
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.addRow([]);

    // Tipos aplicados como header dinámico
    const tipos = r.tiposAplicados;
    const headers = ['Legajo', 'Apellido y Nombre', 'CUIL', 'Remun. Bruto'];
    tipos.forEach(t => headers.push(`${t.nombre} (${(Number(t.alicuota) * 100).toFixed(2)}%)`));
    headers.push('Total Contrib.', 'Costo Total');

    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: col >= 4 ? 'right' : 'left', vertical: 'middle' };
    });
    headerRow.height = 22;

    // Anchos
    const widths = [10, 32, 16, 16];
    tipos.forEach(() => widths.push(18));
    widths.push(18, 18);
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const fmt = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 });

    // Detalle
    for (const e of r.detallePorEmpleado) {
      const fila = [e.legajo || '—', e.empleado, e.cuil, fmt(e.remunerativo)];
      tipos.forEach(t => fila.push(fmt(e.contribuciones[t.codigo] || 0)));
      fila.push(fmt(e.totalContribuciones), fmt(e.costoTotal));
      const row = ws.addRow(fila);
      row.eachCell((c, col) => { if (col >= 4) c.alignment = { horizontal: 'right' }; });
    }

    // Totales
    const totalFila = ['', `TOTALES (${r.cantidadEmpleados})`, '', fmt(r.totalRemunerativo)];
    tipos.forEach(t => totalFila.push(fmt(r.totales[t.codigo] || 0)));
    totalFila.push(fmt(r.totalGeneral), fmt(r.costoTotal));
    const totalRow = ws.addRow(totalFila);
    totalRow.eachCell((c, col) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0E8' } };
      c.font = { bold: true };
      if (col >= 4) c.alignment = { horizontal: 'right' };
    });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="contribuciones_${r.empresa.cuit}_${anio}${String(mes).padStart(2,'0')}.xlsx"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// ── SIMULADOR DE COSTO LABORAL ───────────────────────────────────────────────
// Responde la pregunta más frecuente de los clientes del estudio:
// "¿cuánto me cuesta de verdad contratar a alguien con sueldo X?"

// POST /api/contribuciones/simulador
// Body: { bruto, empresaId?, convenioId?, incluirSindicato? (default false), alicuotaSindicato? }
router.post('/simulador', auth, [
  body('bruto').isFloat({ min: 1 }),
  body('empresaId').optional({ values: 'falsy' }).isUUID(),
  body('convenioId').optional({ values: 'falsy' }).isUUID(),
  body('incluirSindicato').optional().isBoolean(),
  body('alicuotaSindicato').optional().isFloat({ min: 0, max: 0.1 }),
  validate,
], async (req, res, next) => {
  try {
    const bruto = Number(req.body.bruto);
    const incluirSindicato = req.body.incluirSindicato === true;
    const alicuotaSindicato = Number(req.body.alicuotaSindicato || 0.02);

    const tipos = await getTiposVigentes(
      req.usuario.estudioId,
      req.body.empresaId || null,
      req.body.convenioId || null,
    );

    const r2 = (n) => Math.round(n * 100) / 100;

    // Aportes del empleado (lo que se le retiene)
    const aportes = APORTES_EMPLEADO_FALLBACK.map(a => ({
      ...a, importe: r2(bruto * a.alicuota),
    }));
    if (incluirSindicato) {
      aportes.push({ codigo: 'SINDICATO', nombre: 'Cuota sindical', alicuota: alicuotaSindicato, importe: r2(bruto * alicuotaSindicato) });
    }
    const totalAportes = r2(aportes.reduce((s, a) => s + a.importe, 0));
    const netoBolsillo = r2(bruto - totalAportes);

    // Contribuciones patronales (lo que paga el empleador además del bruto)
    const contribuciones = tipos.map(t => ({
      codigo: t.codigo, nombre: t.nombre, alicuota: Number(t.alicuota),
      importe: t.base === 'FIJO' ? r2(Number(t.alicuota)) : r2(bruto * Number(t.alicuota)),
    }));
    const totalContribuciones = r2(contribuciones.reduce((s, c) => s + c.importe, 0));

    // Provisiones mensuales (SAC = 1/12 del bruto + sus contribuciones)
    const provisionSAC = r2(bruto / 12);
    const provisionSACContrib = r2(provisionSAC * (totalContribuciones / bruto));

    const costoMensual = r2(bruto + totalContribuciones);
    const costoMensualConProvisiones = r2(costoMensual + provisionSAC + provisionSACContrib);

    res.json({
      bruto,
      empleado: { aportes, totalAportes, netoBolsillo },
      empleador: {
        contribuciones,
        totalContribuciones,
        provisionSAC,
        provisionSACContrib,
        costoMensual,
        costoMensualConProvisiones,
        costoAnual: r2(costoMensual * 12 + provisionSAC * 12 + provisionSACContrib * 12),
      },
      indicadores: {
        // Cuánto cuesta cada $1 que llega al bolsillo del empleado
        costoPorPesoNeto: r2(costoMensualConProvisiones / netoBolsillo),
        cargaTotalPorcentaje: r2(((costoMensualConProvisiones - netoBolsillo) / netoBolsillo) * 100),
      },
      fuenteAlicuotas: tipos[0] && tipos[0]._source === 'db' ? 'configuradas' : 'legales AR 2026 (Dec. 814/01 PyME)',
    });
  } catch (err) { next(err); }
});

module.exports = router;
