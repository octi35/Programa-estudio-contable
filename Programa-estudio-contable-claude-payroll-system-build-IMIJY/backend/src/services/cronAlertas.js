// Cron de alertas de vencimientos
// Diariamente revisa los vencimientos próximos (próximos 7 días) y envía un email
// resumen a los usuarios ADMIN y CONTADOR de cada estudio activo. Idempotente:
// solo envía una vez por día por estudio (chequea LogAccion).

const dayjs = require('dayjs');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');
const { calcularVencimientos, flattenForEmpresa } = require('../routes/vencimientos');

async function yaEnviadoHoy(estudioId) {
  const hoy = dayjs().startOf('day').toDate();
  const existe = await prisma.logAccion.findFirst({
    where: {
      estudioId,
      accion: 'ALERTA_VENCIMIENTOS_ENVIADA',
      createdAt: { gte: hoy },
    },
    select: { id: true },
  });
  return !!existe;
}

async function vencimientosProximos7Dias(estudioId) {
  const hoy = dayjs();
  const hasta = hoy.add(7, 'day').endOf('day');

  const empresas = await prisma.empresa.findMany({
    where: { estudioId, activa: true },
    select: { id: true, razonSocial: true, cuit: true },
  });
  if (empresas.length === 0) return [];

  const out = [];
  // Considerar mes actual y mes anterior (vencimientos del mes pasado pueden caer ahora)
  const mesActual = { a: hoy.year(), m: hoy.month() + 1 };
  const mesPrev = hoy.subtract(1, 'month');
  const mesAnterior = { a: mesPrev.year(), m: mesPrev.month() + 1 };

  for (const emp of empresas) {
    for (const { a, m } of [mesAnterior, mesActual]) {
      const items = calcularVencimientos(emp, a, m);
      for (const v of flattenForEmpresa(emp, items)) {
        const f = dayjs(v.fecha);
        if (f.isAfter(hoy.subtract(1, 'day')) && f.isBefore(hasta)) {
          out.push(v);
        }
      }
    }
  }
  out.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  return out;
}

async function alertasHabilitadasParaEstudio(estudioId) {
  // Parámetro fiscal opcional: ALERTAS_EMAIL_VENCIMIENTOS=false para deshabilitar
  const p = await prisma.parametroFiscal.findFirst({
    where: { estudioId, clave: 'ALERTAS_EMAIL_VENCIMIENTOS' },
    orderBy: { vigenciaDesde: 'desc' },
  });
  if (!p) return true; // habilitado por default
  return String(p.valor).toLowerCase() !== 'false';
}

async function generarYEnviarParaEstudio(estudio) {
  const habilitado = await alertasHabilitadasParaEstudio(estudio.id);
  if (!habilitado) return { skipped: 'deshabilitado por parámetro' };

  const vencs = await vencimientosProximos7Dias(estudio.id);
  if (vencs.length === 0) return { enviados: 0, vencimientos: 0, motivo: 'sin vencimientos próximos' };

  const usuarios = await prisma.usuario.findMany({
    where: {
      estudioId: estudio.id,
      activo: true,
      rol: { in: ['ADMIN', 'CONTADOR'] },
      email: { not: '' },
    },
    select: { email: true, nombre: true },
  });
  if (usuarios.length === 0) return { enviados: 0, motivo: 'sin destinatarios' };

  const { enviarAlertaVencimientos } = require('./emailService');

  let enviados = 0, fallidos = 0;
  const erroresDetalle = [];
  for (const u of usuarios) {
    try {
      await enviarAlertaVencimientos(u.email, u.nombre, estudio, vencs);
      enviados++;
    } catch (e) {
      fallidos++;
      erroresDetalle.push({ email: u.email, error: e.message });
    }
  }

  await prisma.logAccion.create({
    data: {
      estudioId: estudio.id,
      accion: 'ALERTA_VENCIMIENTOS_ENVIADA',
      entidad: 'Cron',
      detalle: { vencimientos: vencs.length, enviados, fallidos, errores: erroresDetalle.slice(0, 5) },
    },
  });

  return { enviados, fallidos, vencimientos: vencs.length };
}

async function ejecutarCronAlertas({ forzar = false } = {}) {
  const estudios = await prisma.estudio.findMany({});
  const resumen = [];
  for (const e of estudios) {
    if (!forzar && await yaEnviadoHoy(e.id)) {
      resumen.push({ estudio: e.razonSocial, skipped: 'ya enviado hoy' });
      continue;
    }
    try {
      const r = await generarYEnviarParaEstudio(e);
      resumen.push({ estudio: e.razonSocial, ...r });
    } catch (err) {
      logger.error?.(`[CronAlertas] estudio=${e.razonSocial} error=${err.message}`);
      resumen.push({ estudio: e.razonSocial, error: err.message });
    }
  }
  return resumen;
}

module.exports = { ejecutarCronAlertas, vencimientosProximos7Dias };
