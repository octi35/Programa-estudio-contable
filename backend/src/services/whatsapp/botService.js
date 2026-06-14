/**
 * Bot conversacional de WhatsApp del estudio contable.
 *
 * Es una máquina de estados *pura de transporte*: recibe un mensaje de texto y
 * el teléfono del remitente, y devuelve una lista de respuestas
 * ({ tipo:'texto'|'media', ... }). Quien la invoca (la ruta del webhook o n8n)
 * se encarga de enviarlas por Evolution API. Así el bot es testeable sin red.
 *
 * El estado conversacional vive en la tabla `sesiones_whatsapp`, scoped por
 * estudio. La identidad del remitente se resuelve por su número:
 *   - EMPLEADO: el teléfono matchea un legajo activo del estudio.
 *   - OPERADOR: el teléfono está en estudio.waOperadores (o WHATSAPP_OPERADORES).
 *   - DESCONOCIDO: cualquier otro.
 *
 * Seguridad: el estudioId nunca viene del mensaje; se resuelve desde la
 * instancia de Evolution que recibió el mensaje (1 instancia = 1 estudio).
 */

const prisma = require('../../lib/prisma');
const logger = require('../../utils/logger');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ── Helpers de números y formato ────────────────────────────────────────────

/** Compara dos teléfonos por sus últimos 10 dígitos (robusto a +54 / 9 / 0). */
function mismoNumero(a, b) {
  const da = String(a || '').replace(/\D/g, '').slice(-10);
  const db = String(b || '').replace(/\D/g, '').slice(-10);
  return da.length === 10 && da === db;
}

function soloDigitos(s) { return String(s || '').replace(/\D/g, ''); }

function pesos(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function texto(t) { return { tipo: 'texto', texto: t }; }
function media({ base64, fileName, caption }) { return { tipo: 'media', media: base64, fileName, caption, mimetype: 'application/pdf' }; }

// ── Resolución de estudio e identidad ───────────────────────────────────────

/** Encuentra el estudio dueño de una instancia de Evolution. */
async function estudioDeInstancia(instance) {
  if (!instance) return null;
  let estudio = await prisma.estudio.findFirst({ where: { waInstance: instance } });
  // Fallback para el período de prueba (instancia única): primer estudio.
  if (!estudio && (process.env.WHATSAPP_FALLBACK_ESTUDIO === 'true' || instance === process.env.EVOLUTION_INSTANCE)) {
    estudio = await prisma.estudio.findFirst({ orderBy: { createdAt: 'asc' } });
  }
  return estudio;
}

/** Determina el rol del remitente y, si es empleado, su legajo. */
async function identificar(estudio, telefono) {
  // OPERADOR: lista del estudio + fallback por env (para pruebas).
  const operadores = [
    ...String(estudio.waOperadores || '').split(','),
    ...String(process.env.WHATSAPP_OPERADORES || '').split(','),
    estudio.telefono || '',
  ].map(soloDigitos).filter(Boolean);
  if (operadores.some((op) => mismoNumero(op, telefono))) {
    return { rol: 'OPERADOR', empleadoId: null };
  }

  // EMPLEADO: buscar legajo activo del estudio con ese teléfono.
  const empleados = await prisma.empleado.findMany({
    where: { activo: true, telefono: { not: null }, empresa: { estudioId: estudio.id } },
    select: { id: true, telefono: true },
  });
  const emp = empleados.find((e) => mismoNumero(e.telefono, telefono));
  if (emp) return { rol: 'EMPLEADO', empleadoId: emp.id };

  return { rol: 'DESCONOCIDO', empleadoId: null };
}

// ── Sesión ──────────────────────────────────────────────────────────────────

async function cargarSesion(estudioId, telefono, pushName) {
  const tel = soloDigitos(telefono);
  let sesion = await prisma.sesionWhatsapp.findUnique({
    where: { estudioId_telefono: { estudioId, telefono: tel } },
  });
  if (!sesion) {
    sesion = await prisma.sesionWhatsapp.create({
      data: { estudioId, telefono: tel, pushName: pushName || null },
    });
  } else if (pushName && sesion.pushName !== pushName) {
    sesion = await prisma.sesionWhatsapp.update({ where: { id: sesion.id }, data: { pushName } });
  }
  return sesion;
}

async function guardarSesion(id, { estado, contexto, rol, empleadoId }) {
  return prisma.sesionWhatsapp.update({
    where: { id },
    data: {
      ...(estado !== undefined ? { estado } : {}),
      ...(contexto !== undefined ? { contexto } : {}),
      ...(rol !== undefined ? { rol } : {}),
      ...(empleadoId !== undefined ? { empleadoId } : {}),
    },
  });
}

// ── Menús ─────────────────────────────────────────────────────────────────

function menuEmpleado(nombre) {
  return texto(
    `Hola ${nombre || ''} 👋 Soy el asistente del estudio. ¿Qué necesitás?\n\n` +
    `1️⃣  *Recibo* — tu último recibo de sueldo\n` +
    `2️⃣  *Vacaciones* — días que te corresponden\n` +
    `3️⃣  *Certificado* — pedir certificado de trabajo\n` +
    `4️⃣  *Mis datos* — ver tu legajo\n\n` +
    `Respondé con el número o la palabra.`
  );
}

function menuOperador(nombre) {
  return texto(
    `Hola ${nombre || ''} 👋 ¿Qué querés hacer?\n\n` +
    `1️⃣  *Facturar* — emitir una factura a un cliente\n` +
    `2️⃣  *Ayuda*\n\n` +
    `Escribí *facturar* para arrancar, o *cancelar* en cualquier momento.`
  );
}

// ── Flujos de empleado ──────────────────────────────────────────────────────

async function reciboEmpleado(empleadoId) {
  const liq = await prisma.liquidacion.findFirst({
    where: { empleadoId, estado: 'CONFIRMADO' },
    include: {
      empleado: { include: { empresa: { include: { estudio: true, convenio: true } } } },
      periodo: true,
      detalles: { orderBy: { orden: 'asc' } },
    },
    orderBy: [{ periodo: { anio: 'desc' } }, { periodo: { mes: 'desc' } }],
  });
  if (!liq) return [texto('Todavía no tenés recibos confirmados disponibles. Cuando el estudio confirme tu liquidación, vas a poder descargarlo desde acá.')];

  const pdfService = require('../pdfService');
  const buffer = await pdfService.generarRecibo(liq);
  const periodo = `${MESES[liq.periodo.mes - 1]} ${liq.periodo.anio}`;
  return [media({
    base64: Buffer.from(buffer).toString('base64'),
    fileName: `recibo_${liq.periodo.anio}_${String(liq.periodo.mes).padStart(2, '0')}.pdf`,
    caption: `📄 Tu recibo de *${periodo}*\nNeto: *${pesos(liq.totalNeto)}*`,
  })];
}

function diasVacaciones(fechaIngreso) {
  // Antigüedad a la fecha (LCT art. 150). Es un cálculo orientativo: el estudio
  // confirma el detalle final según días efectivamente trabajados.
  const hoy = new Date();
  const ingreso = new Date(fechaIngreso);
  const meses = (hoy.getFullYear() - ingreso.getFullYear()) * 12 + (hoy.getMonth() - ingreso.getMonth());
  const anios = Math.floor(meses / 12);

  if (meses < 6) {
    // Proporcional: 1 día cada 20 días trabajados (art. 153).
    const dias = Math.floor((hoy - ingreso) / (1000 * 60 * 60 * 24));
    return { dias: Math.max(0, Math.floor(dias / 20)), proporcional: true, anios };
  }
  if (anios < 5) return { dias: 14, proporcional: false, anios };
  if (anios < 10) return { dias: 21, proporcional: false, anios };
  if (anios < 20) return { dias: 28, proporcional: false, anios };
  return { dias: 35, proporcional: false, anios };
}

async function vacacionesEmpleado(empleadoId) {
  const emp = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!emp) return [texto('No encontré tu legajo. Avisale al estudio.')];
  const v = diasVacaciones(emp.fechaIngreso);
  const ingresoStr = new Date(emp.fechaIngreso).toLocaleDateString('es-AR');
  if (v.proporcional) {
    return [texto(`Ingresaste el ${ingresoStr}. Como tenés menos de 6 meses, te corresponden *${v.dias} días* proporcionales este año.\n\nEl detalle final lo confirma el estudio según tus días efectivamente trabajados.`)];
  }
  return [texto(`Ingresaste el ${ingresoStr} (antigüedad: ${v.anios} año/s).\nTe corresponden *${v.dias} días corridos* de vacaciones este año (LCT art. 150).\n\nLa fecha de otorgamiento la coordina tu empleador.`)];
}

async function certificadoEmpleado(estudioId, empleadoId, telefono) {
  const emp = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { empresa: true },
  });
  if (!emp) return [texto('No encontré tu legajo.')];
  // Dejamos registrado el pedido para que el estudio lo emita.
  try {
    const logAccion = require('../../utils/logAccion');
    await logAccion?.({
      estudioId,
      accion: 'PEDIDO_CERTIFICADO_WHATSAPP',
      entidad: 'Empleado',
      entidadId: empleadoId,
      detalle: { empleado: `${emp.apellido}, ${emp.nombre}`, empresa: emp.empresa?.razonSocial, telefono },
    });
  } catch (_) { /* el log no es crítico */ }
  return [texto(`✅ Registré tu pedido de *certificado de trabajo*.\nEl estudio lo va a preparar y te lo envía por acá o por mail. Suele estar listo en 24-48 hs hábiles.`)];
}

async function datosEmpleado(empleadoId) {
  const emp = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { empresa: { select: { razonSocial: true } } },
  });
  if (!emp) return [texto('No encontré tu legajo.')];
  return [texto(
    `*Tu legajo*\n\n` +
    `Nombre: ${emp.apellido}, ${emp.nombre}\n` +
    `CUIL: ${emp.cuil}\n` +
    `Legajo: ${emp.legajoNumero || '—'}\n` +
    `Empresa: ${emp.empresa?.razonSocial || '—'}\n` +
    `Categoría: ${emp.categoria || '—'}\n` +
    `Ingreso: ${new Date(emp.fechaIngreso).toLocaleDateString('es-AR')}\n\n` +
    `Si algún dato está mal, avisale al estudio.`
  )];
}

// ── Flujo de facturación (operador) ──────────────────────────────────────────

async function facturarConfirmar(estudio, ctx) {
  const empresa = await prisma.empresa.findFirst({
    where: { id: ctx.empresaId, estudioId: estudio.id },
  });
  if (!empresa) return [texto('No encuentro el cliente. Empezá de nuevo escribiendo *facturar*.')];

  const { facturarMasivo } = require('../afip/afipFacturacionService');
  const simulado = (estudio.afipAmbiente || process.env.AFIP_AMBIENTE || 'SIMULADO') === 'SIMULADO';

  const resultado = await facturarMasivo(estudio, [{
    empresaId: empresa.id,
    importeNeto: ctx.neto,
    importeIVA: ctx.iva,
    importeTotal: ctx.total,
    concepto: ctx.concepto,
    fecha: new Date(),
  }], { simulado });

  if (resultado.errores.length) {
    return [texto(`❌ AFIP rechazó la factura:\n${resultado.errores[0].error}\n\nProbá de nuevo más tarde o cargala desde el sistema.`)];
  }
  const ok = resultado.exitosos[0];
  const respuestas = [texto(
    `✅ *Factura emitida*${simulado ? ' _(modo prueba)_' : ''}\n\n` +
    `Cliente: ${empresa.razonSocial}\n` +
    `Comprobante: ${ok.tipo} ${ok.nro}\n` +
    `CAE: ${ok.cae}\n` +
    `Total: *${pesos(ok.total)}*`
  )];

  // Adjuntar el PDF del comprobante.
  try {
    const comp = await prisma.comprobanteElectronico.findUnique({ where: { id: ok.comprobanteId } });
    if (comp) {
      const pdfService = require('../pdfService');
      const buffer = await pdfService.generarComprobanteElectronico(comp, ok.tipo);
      respuestas.push(media({
        base64: Buffer.from(buffer).toString('base64'),
        fileName: `factura_${ok.nro.replace(/\D/g, '')}.pdf`,
        caption: `Comprobante ${ok.nro}`,
      }));
    }
  } catch (e) {
    logger.warn?.(`[bot] no se pudo generar PDF del comprobante: ${e.message}`);
  }
  return respuestas;
}

// ── Núcleo: procesar un mensaje ──────────────────────────────────────────────

/**
 * @param {object} args { estudio, telefono, texto, pushName }
 * @returns {Promise<{ replies: Array, sesion: object }>}
 */
async function procesar({ estudio, telefono, texto: mensaje, pushName }) {
  const tel = soloDigitos(telefono);
  const msg = String(mensaje || '').trim();
  const lower = msg.toLowerCase();

  let sesion = await cargarSesion(estudio.id, tel, pushName);

  // (Re)identificar rol si hace falta.
  let rol = sesion.rol;
  let empleadoId = sesion.empleadoId;
  if (rol === 'DESCONOCIDO' || !rol) {
    const id = await identificar(estudio, tel);
    rol = id.rol;
    empleadoId = id.empleadoId;
    if (rol !== sesion.rol || empleadoId !== sesion.empleadoId) {
      sesion = await guardarSesion(sesion.id, { rol, empleadoId });
    }
  }

  const nombre = pushName || sesion.pushName || '';
  const ctx = sesion.contexto || {};

  // Comandos globales.
  if (['cancelar', 'salir', 'menu', 'menú', 'inicio', 'hola', 'buenas'].includes(lower)) {
    await guardarSesion(sesion.id, { estado: 'MENU', contexto: {} });
    if (rol === 'OPERADOR') return { replies: [menuOperador(nombre)], sesion };
    if (rol === 'EMPLEADO') return { replies: [menuEmpleado(nombre)], sesion };
  }

  // Remitente no registrado.
  if (rol === 'DESCONOCIDO') {
    return {
      replies: [texto(
        `Hola 👋 Soy el asistente del estudio contable.\n\n` +
        `Tu número no figura en nuestro sistema. Si sos empleado de una empresa que liquidamos, pedile a RR.HH. que cargue este número en tu legajo. ` +
        `Si sos cliente del estudio, escribinos para darte de alta.`
      )],
      sesion,
    };
  }

  // ── Empleado ──
  if (rol === 'EMPLEADO') {
    if (['1', 'recibo', 'recibos', 'mi recibo'].includes(lower)) return { replies: await reciboEmpleado(empleadoId), sesion };
    if (['2', 'vacaciones', 'vacas', 'dias', 'días'].includes(lower)) return { replies: await vacacionesEmpleado(empleadoId), sesion };
    if (['3', 'certificado', 'certificacion', 'certificación'].includes(lower)) return { replies: await certificadoEmpleado(estudio.id, empleadoId, tel), sesion };
    if (['4', 'datos', 'mis datos', 'legajo'].includes(lower)) return { replies: await datosEmpleado(empleadoId), sesion };
    return { replies: [menuEmpleado(nombre)], sesion };
  }

  // ── Operador (facturación) ──
  if (rol === 'OPERADOR') {
    // Inicio del flujo.
    if (['1', 'facturar', 'factura', 'nueva factura'].includes(lower) && sesion.estado !== 'FACT_CUIT') {
      await guardarSesion(sesion.id, { estado: 'FACT_CUIT', contexto: {} });
      return { replies: [texto('🧾 *Nueva factura*\n\nDecime el *CUIT del cliente* (con o sin guiones). Tiene que ser un cliente ya cargado en el sistema.')], sesion };
    }

    if (sesion.estado === 'FACT_CUIT') {
      const cuit = soloDigitos(msg);
      if (!/^\d{11}$/.test(cuit)) return { replies: [texto('Ese CUIT no parece válido (deben ser 11 dígitos). Probá de nuevo o escribí *cancelar*.')], sesion };
      const empresa = await prisma.empresa.findFirst({
        where: { cuit: { contains: cuit.slice(0, 11) }, estudioId: estudio.id },
      }) || await prisma.empresa.findFirst({
        where: { estudioId: estudio.id, cuit: { in: [cuit, `${cuit.slice(0,2)}-${cuit.slice(2,10)}-${cuit.slice(10)}`] } },
      });
      if (!empresa) {
        return { replies: [texto(`No encontré un cliente con CUIT ${cuit} en tu cartera. Verificá el número o cargá el cliente en el sistema primero. Escribí *cancelar* para salir.`)], sesion };
      }
      await guardarSesion(sesion.id, { estado: 'FACT_MONTO', contexto: { ...ctx, empresaId: empresa.id, empresaNombre: empresa.razonSocial } });
      return { replies: [texto(`Cliente: *${empresa.razonSocial}*\n\n¿Cuál es el *importe neto* (sin IVA)? Mandame sólo el número, ej: 150000`)], sesion };
    }

    if (sesion.estado === 'FACT_MONTO') {
      const neto = Number(msg.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
      if (!neto || neto <= 0) return { replies: [texto('Importe inválido. Mandame sólo el número del neto, ej: 150000. O *cancelar*.')], sesion };
      const iva = Math.round(neto * 0.21 * 100) / 100;
      const total = Math.round((neto + iva) * 100) / 100;
      await guardarSesion(sesion.id, { estado: 'FACT_DESC', contexto: { ...ctx, neto, iva, total } });
      return { replies: [texto(`Neto: ${pesos(neto)}\nIVA 21%: ${pesos(iva)}\nTotal: *${pesos(total)}*\n\nÚltimo dato: escribí el *concepto* (ej: "Honorarios mayo 2026").`)], sesion };
    }

    if (sesion.estado === 'FACT_DESC') {
      const concepto = msg.slice(0, 250) || 'Honorarios profesionales';
      const nuevoCtx = { ...ctx, concepto };
      await guardarSesion(sesion.id, { estado: 'FACT_CONFIRM', contexto: nuevoCtx });
      return { replies: [texto(
        `Confirmá la factura:\n\n` +
        `Cliente: ${ctx.empresaNombre}\n` +
        `Concepto: ${concepto}\n` +
        `Neto: ${pesos(ctx.neto)}\n` +
        `IVA: ${pesos(ctx.iva)}\n` +
        `*Total: ${pesos(ctx.total)}*\n\n` +
        `Respondé *SÍ* para emitirla o *cancelar* para descartar.`
      )], sesion };
    }

    if (sesion.estado === 'FACT_CONFIRM') {
      if (['si', 'sí', 'confirmar', 'dale', 'ok', 'emitir'].includes(lower)) {
        const replies = await facturarConfirmar(estudio, ctx);
        await guardarSesion(sesion.id, { estado: 'MENU', contexto: {} });
        return { replies, sesion };
      }
      await guardarSesion(sesion.id, { estado: 'MENU', contexto: {} });
      return { replies: [texto('Listo, descarté la factura. Escribí *facturar* cuando quieras emitir otra.')], sesion };
    }

    return { replies: [menuOperador(nombre)], sesion };
  }

  return { replies: [menuEmpleado(nombre)], sesion };
}

module.exports = {
  procesar,
  estudioDeInstancia,
  identificar,
  diasVacaciones,
  mismoNumero,
  soloDigitos,
};
