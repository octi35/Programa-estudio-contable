/**
 * Asistente IA sobre los datos del estudio.
 *
 * Chat con tool calling (Llama vía Groq u otra API compatible OpenAI — ver
 * llmClient.js). El modelo consulta los datos con herramientas de solo
 * lectura, siempre filtradas por el estudioId del usuario autenticado
 * (el modelo nunca elige el estudio, lo inyecta el backend).
 *
 * Sin LLM_API_KEY el endpoint responde 503 y el resto del sistema funciona
 * igual (degradación elegante).
 */

const prisma = require('../../lib/prisma');
const { chatCompletion, habilitado, MODEL } = require('./llmClient');

const MAX_ITERACIONES = 8;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ── Herramientas (solo lectura, scoped por estudio) ─────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'listar_empresas',
      description: 'Lista las empresas (clientes) del estudio con su cantidad de empleados activos. Llamala cuando pregunten por empresas, clientes o necesites el ID de una empresa.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_empleado',
      description: 'Busca empleados por apellido o nombre (búsqueda parcial, sin distinguir mayúsculas). Llamala cuando pregunten por una persona: devuelve ID, CUIL, empresa, categoría, básico y estado.',
      parameters: {
        type: 'object',
        properties: { nombre: { type: 'string', description: 'Apellido o nombre (o parte)' } },
        required: ['nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'liquidaciones_empleado',
      description: 'Devuelve las liquidaciones de un empleado (haberes, descuentos, neto, por período y tipo: MENSUAL, SAC_JUNIO, SAC_DICIEMBRE, VACACIONES). Llamala para responder cuánto cobró alguien, su aguinaldo, su histórico salarial. Usá primero buscar_empleado para obtener el empleadoId.',
      parameters: {
        type: 'object',
        properties: {
          empleadoId: { type: 'string', description: 'ID del empleado (de buscar_empleado)' },
          anio: { type: 'integer', description: 'Filtrar por año (opcional)' },
        },
        required: ['empleadoId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resumen_periodo',
      description: 'Resumen de liquidaciones de un período (año + mes): por empresa, cantidad de empleados liquidados, total neto, y qué empresas tienen empleados activos SIN liquidar. Llamala para "¿cómo viene el mes?", "¿qué falta liquidar?", masa salarial.',
      parameters: {
        type: 'object',
        properties: {
          anio: { type: 'integer' },
          mes: { type: 'integer', description: '1 a 12' },
        },
        required: ['anio', 'mes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'comprobantes_iva',
      description: 'Totales de IVA compras/ventas de una empresa en un período fiscal. Llamala para posición de IVA, total facturado o gastado.',
      parameters: {
        type: 'object',
        properties: {
          empresaId: { type: 'string', description: 'ID de la empresa (de listar_empresas)' },
          anio: { type: 'integer' },
          mes: { type: 'integer' },
        },
        required: ['empresaId', 'anio', 'mes'],
      },
    },
  },
];

async function ejecutarTool(estudioId, nombre, input) {
  switch (nombre) {
    case 'listar_empresas': {
      const empresas = await prisma.empresa.findMany({
        where: { estudioId },
        select: {
          id: true, razonSocial: true, cuit: true,
          _count: { select: { empleados: { where: { activo: true } } } },
        },
        orderBy: { razonSocial: 'asc' },
      });
      return empresas.map(e => ({ id: e.id, razonSocial: e.razonSocial, cuit: e.cuit, empleadosActivos: e._count.empleados }));
    }

    case 'buscar_empleado': {
      const empleados = await prisma.empleado.findMany({
        where: {
          empresa: { estudioId },
          OR: [
            { apellido: { contains: input.nombre, mode: 'insensitive' } },
            { nombre: { contains: input.nombre, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: {
          id: true, apellido: true, nombre: true, cuil: true, categoria: true,
          basicoMensual: true, activo: true, fechaIngreso: true,
          empresa: { select: { razonSocial: true } },
        },
      });
      return empleados.map(e => ({
        id: e.id, empleado: `${e.apellido}, ${e.nombre}`, cuil: e.cuil,
        empresa: e.empresa.razonSocial, categoria: e.categoria,
        basicoMensual: Number(e.basicoMensual), activo: e.activo,
        fechaIngreso: e.fechaIngreso.toISOString().slice(0, 10),
      }));
    }

    case 'liquidaciones_empleado': {
      const liqs = await prisma.liquidacion.findMany({
        where: {
          empleadoId: input.empleadoId,
          empleado: { empresa: { estudioId } },
          ...(input.anio ? { anio: input.anio } : {}),
          estado: { in: ['CALCULADO', 'CONFIRMADO'] },
        },
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
        take: 36,
        select: { anio: true, mes: true, tipo: true, totalHaberes: true, totalDescuentos: true, totalNeto: true, estado: true },
      });
      return liqs.map(l => ({
        periodo: `${l.mes}/${l.anio}`, tipo: l.tipo,
        haberes: Number(l.totalHaberes), descuentos: Number(l.totalDescuentos),
        neto: Number(l.totalNeto), estado: l.estado,
      }));
    }

    case 'resumen_periodo': {
      const empresas = await prisma.empresa.findMany({
        where: { estudioId },
        select: {
          id: true, razonSocial: true,
          empleados: { where: { activo: true }, select: { id: true } },
        },
      });
      const resultado = [];
      for (const emp of empresas) {
        const liqs = await prisma.liquidacion.findMany({
          where: { periodo: { empresaId: emp.id, anio: input.anio, mes: input.mes, tipo: 'MENSUAL' }, estado: { in: ['CALCULADO', 'CONFIRMADO'] } },
          select: { empleadoId: true, totalNeto: true },
        });
        const liquidados = new Set(liqs.map(l => l.empleadoId));
        const sinLiquidar = emp.empleados.filter(e => !liquidados.has(e.id)).length;
        resultado.push({
          empresa: emp.razonSocial,
          empleadosActivos: emp.empleados.length,
          liquidados: liqs.length,
          sinLiquidar,
          totalNeto: Math.round(liqs.reduce((s, l) => s + Number(l.totalNeto), 0) * 100) / 100,
        });
      }
      return resultado;
    }

    case 'comprobantes_iva': {
      const comps = await prisma.comprobanteIVA.findMany({
        where: {
          empresaId: input.empresaId,
          empresa: { estudioId },
          periodoFiscalAnio: input.anio,
          periodoFiscalMes: input.mes,
          anulado: false,
        },
        select: { tipoMovimiento: true, total: true, iva21: true, iva105: true, iva27: true },
      });
      const suma = (tipo, campo) => Math.round(comps.filter(c => c.tipoMovimiento === tipo).reduce((s, c) => s + Number(c[campo]), 0) * 100) / 100;
      return {
        ventas: { cantidad: comps.filter(c => c.tipoMovimiento === 'VENTA').length, total: suma('VENTA', 'total'), ivaDebito: suma('VENTA', 'iva21') + suma('VENTA', 'iva105') + suma('VENTA', 'iva27') },
        compras: { cantidad: comps.filter(c => c.tipoMovimiento === 'COMPRA').length, total: suma('COMPRA', 'total'), ivaCredito: suma('COMPRA', 'iva21') + suma('COMPRA', 'iva105') + suma('COMPRA', 'iva27') },
      };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ── Loop agéntico ────────────────────────────────────────────────────────────

function systemPrompt(nombreEstudio) {
  const hoy = new Date();
  return `Sos el asistente del estudio contable "${nombreEstudio}", un sistema de gestión para estudios contables argentinos (sueldos, IVA, contabilidad).
Hoy es ${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}.

Respondés preguntas sobre los datos del estudio usando las herramientas disponibles. Reglas:
- Usá las herramientas para obtener datos reales; nunca inventes números. Si una herramienta no devuelve lo que se necesita, decilo.
- Los montos son pesos argentinos: formatealos como $1.234.567,89.
- "Aguinaldo" = liquidaciones tipo SAC_JUNIO o SAC_DICIEMBRE. "Sueldo" = tipo MENSUAL.
- Respondé en español rioplatense, directo y breve. Una tabla simple en markdown está bien para listados.
- Si la pregunta no es sobre los datos del estudio (clima, política, etc.), decí amablemente que solo respondés sobre el sistema.`;
}

/**
 * Procesa un turno de chat. `historial` es [{role: 'user'|'assistant', content: string}].
 * Devuelve { respuesta, herramientasUsadas }.
 */
async function chat(estudioId, nombreEstudio, historial) {
  if (!habilitado()) {
    throw Object.assign(new Error('El asistente IA no está configurado (falta LLM_API_KEY / GROQ_API_KEY — gratis en console.groq.com)'), { statusCode: 503 });
  }

  const messages = [
    { role: 'system', content: systemPrompt(nombreEstudio) },
    ...historial.map(m => ({ role: m.role, content: m.content })),
  ];
  const herramientasUsadas = [];

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const data = await chatCompletion({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.2,
      tools: TOOLS,
      tool_choice: 'auto',
      messages,
    });

    const msg = data.choices?.[0]?.message;
    if (!msg) throw Object.assign(new Error('Respuesta vacía del LLM'), { statusCode: 502 });

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { respuesta: msg.content || 'Sin respuesta.', herramientasUsadas };
    }

    // Ejecutar las tools pedidas y devolver resultados
    messages.push(msg);
    for (const call of msg.tool_calls) {
      const nombre = call.function?.name;
      herramientasUsadas.push(nombre);
      let resultado;
      try {
        const input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        resultado = await ejecutarTool(estudioId, nombre, input);
      } catch (e) {
        resultado = { error: e.message };
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(resultado),
      });
    }
  }

  return { respuesta: 'La consulta requirió demasiados pasos. Probá con una pregunta más específica.', herramientasUsadas };
}

module.exports = { chat, TOOLS, ejecutarTool };
