// Cron de cierre automático de períodos de liquidación
//
// Lógica:
//  - Para cada período ABIERTO de cada estudio:
//    - Si todas las liquidaciones del período están CONFIRMADAS y hay al menos 1
//    - Y el período tiene >= AUTO_CIERRE_DIAS días desde su creación (default 5)
//    - Y el parámetro AUTO_CIERRE_PERIODOS != 'false' del estudio
//    → cierra el período (estado=CERRADO, fechaCierre=ahora) y genera el F.931.
//
// Idempotente: si el período ya está CERRADO, no hace nada.

const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

const DEFAULT_DIAS_ESPERA = 5;

async function diasEsperaParaEstudio(estudioId) {
  const p = await prisma.parametroFiscal.findFirst({
    where: { estudioId, clave: 'AUTO_CIERRE_DIAS' },
    orderBy: { vigenciaDesde: 'desc' },
  });
  if (!p) return DEFAULT_DIAS_ESPERA;
  const n = parseInt(p.valor, 10);
  return isFinite(n) && n >= 0 ? n : DEFAULT_DIAS_ESPERA;
}

async function autoCierreHabilitado(estudioId) {
  const p = await prisma.parametroFiscal.findFirst({
    where: { estudioId, clave: 'AUTO_CIERRE_PERIODOS' },
    orderBy: { vigenciaDesde: 'desc' },
  });
  if (!p) return true; // habilitado por default
  return String(p.valor).toLowerCase() !== 'false';
}

async function generarF931ComoDocumento(empresa, periodo) {
  const liquidaciones = await prisma.liquidacion.findMany({
    where: { periodoId: periodo.id, tipo: 'MENSUAL', estado: { in: ['CALCULADO', 'CONFIRMADO'] } },
    include: { empleado: { select: { apellido: true, nombre: true, cuil: true, legajoNumero: true, cbu: true } } },
  });
  if (liquidaciones.length === 0) return null;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('F.931');
  ws.addRow(['F.931 SICOSS', empresa.razonSocial, `Período: ${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`]);
  ws.addRow(['CUIL','Apellido y Nombre','Legajo','Días','Remun. Bruta','Ap.Jub','Ap.OS','Ap.PAMI','Ct.Jub','Ct.OS','Ct.PAMI','Ct.ART','Total Contrib','Costo Total']);
  for (const liq of liquidaciones) {
    const bruta = Number(liq.totalHaberes);
    const apJub = bruta * 0.11, apOS = bruta * 0.03, apPami = bruta * 0.03;
    const cjJub = bruta * 0.16, cjOS = bruta * 0.06, cjPami = bruta * 0.015, art = bruta * 0.025;
    ws.addRow([
      liq.empleado.cuil, `${liq.empleado.apellido}, ${liq.empleado.nombre}`, liq.empleado.legajoNumero || '—',
      Number(liq.diasTrabajados) || 30, bruta, apJub, apOS, apPami, cjJub, cjOS, cjPami, art,
      cjJub + cjOS + cjPami + art, bruta + cjJub + cjOS + cjPami + art,
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();

  const uploadDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (_) {}
  const cuitSinGuion = empresa.cuit.replace(/-/g, '');
  const fileName = `F931_${cuitSinGuion}_${periodo.anio}${String(periodo.mes).padStart(2, '0')}_auto_${Date.now()}.xlsx`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(buf));

  return prisma.documento.create({
    data: {
      empresaId: empresa.id,
      tipo: 'F931',
      nombre: `F.931 ${periodo.anio}-${String(periodo.mes).padStart(2, '0')} (auto)`,
      descripcion: 'Generado por cierre automático de período',
      url: `/uploads/${fileName}`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      tamanio: buf.byteLength,
      anio: periodo.anio,
      mes: periodo.mes,
    },
  });
}

async function intentarCerrarPeriodo(estudio, periodo) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: periodo.empresaId },
    select: { id: true, razonSocial: true, cuit: true, estudioId: true },
  });
  if (!empresa || empresa.estudioId !== estudio.id) return { skipped: 'empresa fuera del estudio' };

  // Estado de liquidaciones del período
  const estadoConteo = await prisma.liquidacion.groupBy({
    by: ['estado'],
    where: { periodoId: periodo.id },
    _count: { estado: true },
  });
  const total = estadoConteo.reduce((s, r) => s + r._count.estado, 0);
  const confirmadas = estadoConteo.find(r => r.estado === 'CONFIRMADO')?._count.estado || 0;

  if (total === 0) return { skipped: 'sin liquidaciones' };
  if (confirmadas !== total) return { skipped: `${confirmadas}/${total} confirmadas (necesita 100%)` };

  // Cierre transaccional
  await prisma.periodoLiquidacion.update({
    where: { id: periodo.id },
    data: { estado: 'CERRADO', fechaCierre: new Date() },
  });

  let f931Doc = null;
  try {
    f931Doc = await generarF931ComoDocumento(empresa, periodo);
  } catch (err) {
    logger.error?.(`[CronCierreAuto] F.931 falló para ${empresa.razonSocial} ${periodo.anio}-${periodo.mes}: ${err.message}`);
  }

  await prisma.logAccion.create({
    data: {
      estudioId: estudio.id,
      accion: 'CIERRE_AUTOMATICO_PERIODO',
      entidad: 'PeriodoLiquidacion',
      entidadId: periodo.id,
      detalle: {
        empresa: empresa.razonSocial, anio: periodo.anio, mes: periodo.mes, tipo: periodo.tipo,
        liquidacionesConfirmadas: confirmadas, f931Generado: !!f931Doc,
      },
    },
  });

  return { cerrado: true, liquidaciones: confirmadas, f931: !!f931Doc };
}

async function ejecutarCierreAutomatico() {
  const estudios = await prisma.estudio.findMany({});
  const resumen = [];

  for (const estudio of estudios) {
    if (!(await autoCierreHabilitado(estudio.id))) {
      resumen.push({ estudio: estudio.razonSocial, skipped: 'cierre automático deshabilitado' });
      continue;
    }
    const diasEspera = await diasEsperaParaEstudio(estudio.id);
    const corte = dayjs().subtract(diasEspera, 'day').toDate();

    const periodos = await prisma.periodoLiquidacion.findMany({
      where: {
        estado: 'ABIERTO',
        empresa: { estudioId: estudio.id },
        createdAt: { lte: corte },
      },
      include: { empresa: { select: { razonSocial: true } } },
    });

    if (periodos.length === 0) {
      resumen.push({ estudio: estudio.razonSocial, periodos: 0 });
      continue;
    }

    const detalle = [];
    for (const periodo of periodos) {
      try {
        const r = await intentarCerrarPeriodo(estudio, periodo);
        detalle.push({ empresa: periodo.empresa.razonSocial, periodo: `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`, ...r });
      } catch (err) {
        logger.error?.(`[CronCierreAuto] error periodo ${periodo.id}: ${err.message}`);
        detalle.push({ empresa: periodo.empresa.razonSocial, periodo: `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`, error: err.message });
      }
    }

    resumen.push({
      estudio: estudio.razonSocial,
      diasEspera,
      periodos: periodos.length,
      cerrados: detalle.filter(d => d.cerrado).length,
      detalle,
    });
  }

  return resumen;
}

module.exports = { ejecutarCierreAutomatico };
