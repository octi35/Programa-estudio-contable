/**
 * Escalas salariales por convenio (paritarias).
 *
 * Flujo: importar la escala nueva (Excel/CSV con categoría + básico) con su
 * vigencia → aplicarla a todos los empleados activos del convenio que tengan
 * categoría coincidente → opcionalmente calcular el retroactivo de meses ya
 * liquidados con el básico viejo y dejarlo como novedad para la próxima
 * liquidación.
 */

const prisma = require('../../lib/prisma');

const norm = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Importa filas {categoria, basico, descripcion?} como TablaSueldo con
 * vigenciaDesde. Cierra la vigencia anterior de cada categoría
 * (vigenciaHasta = día anterior) para mantener el historial.
 */
async function importarEscala(convenioId, filas, vigenciaDesde) {
  const vigencia = new Date(vigenciaDesde);
  const finAnterior = new Date(vigencia.getTime() - 24 * 60 * 60 * 1000);

  const validas = filas
    .map(f => ({ categoria: norm(f.categoria), basico: Number(f.basico), descripcion: f.descripcion || null }))
    .filter(f => f.categoria && f.basico > 0);

  if (validas.length === 0) {
    throw Object.assign(new Error('El archivo no tiene filas válidas (se esperan columnas: categoría, básico)'), { statusCode: 400 });
  }

  let creadas = 0;
  await prisma.$transaction(async (tx) => {
    for (const f of validas) {
      // Cerrar vigencia abierta anterior de la misma categoría
      await tx.tablaSueldo.updateMany({
        where: { convenioId, categoria: f.categoria, vigenciaHasta: null, vigenciaDesde: { lt: vigencia } },
        data: { vigenciaHasta: finAnterior },
      });
      // Evitar duplicado exacto (misma categoría + vigencia)
      const existe = await tx.tablaSueldo.findFirst({
        where: { convenioId, categoria: f.categoria, vigenciaDesde: vigencia },
      });
      if (existe) {
        await tx.tablaSueldo.update({ where: { id: existe.id }, data: { basicoMensual: f.basico, descripcion: f.descripcion } });
      } else {
        await tx.tablaSueldo.create({
          data: { convenioId, categoria: f.categoria, basicoMensual: f.basico, descripcion: f.descripcion, vigenciaDesde: vigencia },
        });
        creadas++;
      }
    }
  });

  return { procesadas: validas.length, creadas, actualizadas: validas.length - creadas };
}

/** Escala vigente a una fecha: la fila más reciente por categoría. */
async function escalaVigente(convenioId, fecha = new Date()) {
  const filas = await prisma.tablaSueldo.findMany({
    where: {
      convenioId,
      vigenciaDesde: { lte: fecha },
      OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: fecha } }],
    },
    orderBy: { vigenciaDesde: 'desc' },
  });
  const porCategoria = new Map();
  for (const f of filas) {
    if (!porCategoria.has(f.categoria)) porCategoria.set(f.categoria, f);
  }
  return Array.from(porCategoria.values()).sort((a, b) => a.categoria.localeCompare(b.categoria));
}

/**
 * Aplica la escala vigente a los empleados activos del convenio.
 * Actualiza basicoMensual y registra NovedadEmpleado MODIFICACION_SUELDO.
 * Con dryRun devuelve la preview sin tocar nada.
 */
async function aplicarEscala(estudioId, convenioId, { fecha = new Date(), dryRun = false } = {}) {
  const escala = await escalaVigente(convenioId, fecha);
  if (escala.length === 0) {
    throw Object.assign(new Error('El convenio no tiene escala vigente cargada'), { statusCode: 400 });
  }
  const porCategoria = new Map(escala.map(f => [f.categoria, Number(f.basicoMensual)]));

  const empleados = await prisma.empleado.findMany({
    where: { convenioId, activo: true, empresa: { estudioId } },
    select: { id: true, apellido: true, nombre: true, categoria: true, basicoMensual: true, empresa: { select: { razonSocial: true } } },
  });

  const cambios = [];
  const sinCategoria = [];
  const sinCambio = [];

  for (const e of empleados) {
    const cat = norm(e.categoria);
    const nuevo = porCategoria.get(cat);
    if (!nuevo) { sinCategoria.push({ empleado: `${e.apellido}, ${e.nombre}`, categoria: e.categoria || '—', empresa: e.empresa.razonSocial }); continue; }
    const actual = Number(e.basicoMensual);
    if (r2(nuevo) === r2(actual)) { sinCambio.push({ empleado: `${e.apellido}, ${e.nombre}` }); continue; }
    cambios.push({
      empleadoId: e.id,
      empleado: `${e.apellido}, ${e.nombre}`,
      empresa: e.empresa.razonSocial,
      categoria: e.categoria,
      basicoAnterior: actual,
      basicoNuevo: nuevo,
      variacion: actual > 0 ? r2(((nuevo - actual) / actual) * 100) : null,
    });
  }

  if (!dryRun && cambios.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const c of cambios) {
        await tx.empleado.update({ where: { id: c.empleadoId }, data: { basicoMensual: c.basicoNuevo } });
        await tx.novedadEmpleado.create({
          data: {
            empleadoId: c.empleadoId,
            tipo: 'MODIFICACION_SUELDO',
            descripcion: `[Paritaria] Básico ${c.categoria}: $${c.basicoAnterior.toLocaleString('es-AR')} → $${c.basicoNuevo.toLocaleString('es-AR')}`,
            fechaDesde: fecha,
            valor: c.basicoNuevo,
          },
        });
      }
    });
  }

  return { aplicado: !dryRun, cambios, sinCategoria, sinCambio: sinCambio.length, totalEmpleados: empleados.length };
}

/**
 * Retroactivo: para cada empleado del convenio, compara el básico liquidado
 * en los períodos [desde, hasta] contra el básico de la escala vigente HOY y
 * calcula la diferencia proporcional (sobre el concepto Sueldo Básico).
 * Si crear=true, registra una NovedadEmpleado PERSONALIZADA con el total,
 * lista para incluir como haber en la próxima liquidación.
 *
 * Nota: el cálculo cubre la diferencia de básico proporcional; los adicionales
 * que derivan del básico (presentismo, antigüedad) se recalculan al liquidar.
 */
async function calcularRetroactivo(estudioId, convenioId, { anioDesde, mesDesde, anioHasta, mesHasta, crear = false }) {
  const escala = await escalaVigente(convenioId);
  if (escala.length === 0) {
    throw Object.assign(new Error('El convenio no tiene escala vigente cargada'), { statusCode: 400 });
  }
  const porCategoria = new Map(escala.map(f => [f.categoria, Number(f.basicoMensual)]));

  // Lista de períodos (anio, mes) del rango
  const periodos = [];
  let a = anioDesde, m = mesDesde;
  while (a < anioHasta || (a === anioHasta && m <= mesHasta)) {
    periodos.push({ anio: a, mes: m });
    m++; if (m > 12) { m = 1; a++; }
  }
  if (periodos.length === 0 || periodos.length > 12) {
    throw Object.assign(new Error('Rango de períodos inválido (máximo 12 meses)'), { statusCode: 400 });
  }

  const liquidaciones = await prisma.liquidacion.findMany({
    where: {
      tipo: 'MENSUAL',
      estado: { in: ['CALCULADO', 'CONFIRMADO'] },
      OR: periodos.map(p => ({ anio: p.anio, mes: p.mes })),
      empleado: { convenioId, activo: true, empresa: { estudioId } },
    },
    include: {
      empleado: { select: { id: true, apellido: true, nombre: true, categoria: true, empresa: { select: { razonSocial: true } } } },
      detalles: { where: { descripcion: { startsWith: 'Sueldo Básico' } }, select: { importe: true, cantidad: true } },
    },
  });

  const porEmpleado = new Map();
  for (const liq of liquidaciones) {
    const cat = norm(liq.empleado.categoria);
    const basicoNuevo = porCategoria.get(cat);
    if (!basicoNuevo) continue;

    const detalleBasico = liq.detalles[0];
    if (!detalleBasico) continue;

    const basicoLiquidado = Number(detalleBasico.importe);
    // Proporción liquidada del mes (días trabajados / hábiles), inferida del propio recibo
    const proporcion = Number(liq.diasTrabajados) > 0 && Number(liq.diasNoTrabajados) >= 0
      ? Number(liq.diasTrabajados) / (Number(liq.diasTrabajados) + Number(liq.diasNoTrabajados))
      : 1;
    const basicoNuevoProporcional = r2(basicoNuevo * proporcion);
    const diferencia = r2(basicoNuevoProporcional - basicoLiquidado);
    if (diferencia <= 0) continue;

    const key = liq.empleado.id;
    if (!porEmpleado.has(key)) {
      porEmpleado.set(key, {
        empleadoId: key,
        empleado: `${liq.empleado.apellido}, ${liq.empleado.nombre}`,
        empresa: liq.empleado.empresa.razonSocial,
        categoria: liq.empleado.categoria,
        meses: [],
        total: 0,
      });
    }
    const e = porEmpleado.get(key);
    e.meses.push({ anio: liq.anio, mes: liq.mes, basicoLiquidado, diferencia });
    e.total = r2(e.total + diferencia);
  }

  const detalle = Array.from(porEmpleado.values()).sort((x, y) => x.empleado.localeCompare(y.empleado));
  const totalGeneral = r2(detalle.reduce((s, e) => s + e.total, 0));

  if (crear && detalle.length > 0) {
    const rango = `${String(mesDesde).padStart(2, '0')}/${anioDesde}–${String(mesHasta).padStart(2, '0')}/${anioHasta}`;
    await prisma.novedadEmpleado.createMany({
      data: detalle.map(e => ({
        empleadoId: e.empleadoId,
        tipo: 'PERSONALIZADA',
        descripcion: `[Retroactivo paritaria ${rango}] ${e.meses.length} mes(es) — incluir como haber remunerativo`,
        fechaDesde: new Date(),
        valor: e.total,
      })),
    });
  }

  return { periodos: periodos.length, empleadosConRetro: detalle.length, totalGeneral, detalle, novedadesCreadas: crear ? detalle.length : 0 };
}

module.exports = { importarEscala, escalaVigente, aplicarEscala, calcularRetroactivo, norm };
