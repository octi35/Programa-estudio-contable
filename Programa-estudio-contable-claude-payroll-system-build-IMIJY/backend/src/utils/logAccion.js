const prisma = require('../lib/prisma');

async function logAccion({ usuarioId, estudioId, accion, entidad, entidadId, detalle, ip }) {
  try {
    await prisma.logAccion.create({
      data: {
        usuarioId: usuarioId || null,
        estudioId: estudioId || null,
        accion,
        entidad: entidad || null,
        entidadId: entidadId || null,
        detalle: detalle || null,
        ip: ip || null,
      },
    });
  } catch (_) {
    // Logging never breaks the main flow
  }
}

module.exports = logAccion;
