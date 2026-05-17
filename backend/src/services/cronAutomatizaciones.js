// Automatizaciones varias que se ejecutan 1 vez por día.
//
// 1. Marca facturas de honorarios PENDIENTES como VENCIDAS si la fecha de
//    emisión + N días (default 30) ya pasó (estado VENCIDA = forma de
//    representarlo en honorarios → usamos string 'PENDIENTE' con fechaCobro=null
//    pero antigüedad alta, así que en realidad sólo enviamos recordatorio).
// 2. Marca declaraciones IIBB como VENCIDAS si pasó la fecha de vencimiento
//    y siguen en BORRADOR.
// 3. Envía recordatorio de cobro a empresas con facturas vencidas > 7 días.

const dayjs = require('dayjs');
const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

async function marcarIIBBVencidas() {
  const hoy = new Date();
  const result = await prisma.declaracionIIBB.updateMany({
    where: {
      estado: { in: ['BORRADOR', 'PRESENTADA'] },
      fechaVencimiento: { not: null, lt: hoy },
    },
    data: { estado: 'VENCIDA' },
  });
  return { actualizadas: result.count };
}

async function enviarRecordatoriosCobro() {
  const hace7 = dayjs().subtract(7, 'day').toDate();

  // Honorarios pendientes con más de 7 días sin cobrar
  const pendientes = await prisma.facturaHonorarios.findMany({
    where: {
      estado: 'PENDIENTE',
      fecha: { lt: hace7 },
    },
    include: {},
  });

  if (pendientes.length === 0) return { enviados: 0, total: 0 };

  // Agrupar por empresa para no enviar 1 email por factura
  const porEmpresa = {};
  for (const f of pendientes) {
    (porEmpresa[f.empresaId] = porEmpresa[f.empresaId] || []).push(f);
  }

  let enviados = 0, fallidos = 0;
  for (const [empresaId, facturas] of Object.entries(porEmpresa)) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      include: { estudio: { select: { razonSocial: true, email: true } } },
    });
    if (!empresa?.email) continue;

    // Verificar si ya enviamos hoy
    const hoy = dayjs().startOf('day').toDate();
    const ya = await prisma.logAccion.findFirst({
      where: {
        estudioId: empresa.estudioId,
        accion: 'RECORDATORIO_COBRO_ENVIADO',
        entidad: 'Empresa',
        entidadId: empresa.id,
        createdAt: { gte: hoy },
      },
    });
    if (ya) continue;

    try {
      const { enviarRecordatorioCobro } = require('./emailService');
      await enviarRecordatorioCobro(empresa.email, empresa.razonSocial, empresa.estudio, facturas);
      enviados++;

      await prisma.logAccion.create({
        data: {
          estudioId: empresa.estudioId,
          accion: 'RECORDATORIO_COBRO_ENVIADO',
          entidad: 'Empresa',
          entidadId: empresa.id,
          detalle: { facturas: facturas.length, total: facturas.reduce((s, f) => s + Number(f.total), 0) },
        },
      });
    } catch (err) {
      fallidos++;
      logger.error?.(`[CronAutomatizaciones] recordatorio cobro a ${empresa.razonSocial} falló: ${err.message}`);
    }
  }

  return { total: pendientes.length, enviados, fallidos };
}

async function ejecutarAutomatizacionesDiarias() {
  const resultado = { hora: new Date().toISOString() };
  try {
    resultado.iibbVencidas = await marcarIIBBVencidas();
  } catch (err) {
    resultado.iibbVencidas = { error: err.message };
  }
  try {
    resultado.recordatoriosCobro = await enviarRecordatoriosCobro();
  } catch (err) {
    resultado.recordatoriosCobro = { error: err.message };
  }
  return resultado;
}

module.exports = { ejecutarAutomatizacionesDiarias, marcarIIBBVencidas, enviarRecordatoriosCobro };
