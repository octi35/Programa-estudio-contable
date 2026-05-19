// Cron de sincronización del buzón E-Ventanilla AFIP.
// Corre 1 vez por día (default 7am) — antes del cron de alertas para que las
// notificaciones críticas ya estén en DB cuando se envíen los emails.

const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

async function yaCorrioHoy() {
  const dayjs = require('dayjs');
  const hoy = dayjs().startOf('day').toDate();
  return !!(await prisma.logAccion.findFirst({
    where: { accion: 'SYNC_EVENTANILLA', createdAt: { gte: hoy } },
    select: { id: true },
  }));
}

async function ejecutarSyncEVentanilla() {
  const { sincronizarTodos } = require('./afip/afipEVentanillaService');
  const resultado = await sincronizarTodos();

  const nuevos = resultado.reduce((s, r) => s + (r.nuevos || 0), 0);
  const total = resultado.reduce((s, r) => s + (r.total || 0), 0);
  const errores = resultado.filter(r => r.error).length;

  await prisma.logAccion.create({
    data: {
      accion: 'SYNC_EVENTANILLA',
      entidad: 'Cron',
      detalle: { empresas: resultado.length, mensajesTotales: total, nuevosEnDB: nuevos, errores },
    },
  });

  logger.info(`[CronEVentanilla] empresas=${resultado.length} total=${total} nuevos=${nuevos} errores=${errores}`);
  return resultado;
}

module.exports = { ejecutarSyncEVentanilla, yaCorrioHoy };
