/**
 * Importador de F.572 web (SIRADIG).
 *
 * El empleador descarga de ARCA el XML de la presentación del empleado.
 * Acá lo parseamos de forma tolerante (los formatos varían entre versiones)
 * y volcamos las deducciones al modelo GananciasEmpleado del año, que ya
 * alimenta el cálculo de Ganancias 4ª categoría.
 *
 * Parser por regex a propósito: sin dependencias nuevas y tolerante a
 * namespaces/atributos distintos entre versiones del formulario.
 */

const prisma = require('../../lib/prisma');

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const r2 = (n) => Math.round(n * 100) / 100;

function extraerTag(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function extraerBloques(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const bloques = [];
  let m;
  while ((m = re.exec(xml)) !== null) bloques.push(m[0]);
  return bloques;
}

function extraerNumero(bloque, tags) {
  for (const tag of tags) {
    const v = extraerTag(bloque, tag);
    if (v != null) {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

// Clasifica una deducción del F.572 a un campo de GananciasEmpleado.
// Cubre tanto descripciones como códigos numéricos de SIRADIG.
function clasificarDeduccion(bloque) {
  const tipoAttr = /tipo\s*=\s*"([^"]+)"/i.exec(bloque)?.[1] || '';
  const tipoTag = extraerTag(bloque, 'tipoDeduccion') || extraerTag(bloque, 'tipo') || '';
  const desc = extraerTag(bloque, 'descripcion') || '';
  const texto = `${tipoAttr} ${tipoTag} ${desc}`.toUpperCase();

  if (/MEDIC|ASISTENCIAL|PREPAGA|\b1\b/.test(texto) && /CUOTA|MEDIC|PREPAGA/.test(texto)) return 'medicinaPrivada';
  if (/ALQUILER/.test(texto)) return 'alquiler';
  if (/HIPOTEC/.test(texto)) return 'hipoteca';
  if (/SEPELIO/.test(texto)) return 'sepelio';
  if (/DONAC/.test(texto)) return 'donaciones';
  return 'otrasDeducciones';
}

/**
 * Parsea el XML del F.572 y devuelve { cuil, anio, conyuge, hijos,
 * hijosDiscapacitados, deducciones: {campo: monto} }.
 */
function parsearF572(xmlBuffer) {
  const xml = xmlBuffer.toString('utf8');
  if (!/presentacion|siradig|f572|ddjj/i.test(xml)) {
    throw Object.assign(new Error('El archivo no parece ser un F.572 de SIRADIG'), { statusCode: 400 });
  }

  // CUIL del empleado: primer cuit/cuil dentro del bloque empleado (o del documento)
  const bloqueEmpleado = extraerBloques(xml, 'empleado')[0] || xml;
  const cuil = soloDigitos(extraerTag(bloqueEmpleado, 'cuit') || extraerTag(bloqueEmpleado, 'cuil'));
  if (cuil.length !== 11) {
    throw Object.assign(new Error('No se pudo identificar el CUIL del empleado en el XML'), { statusCode: 400 });
  }

  // Período de la presentación
  const anioTexto = extraerTag(xml, 'periodo') || extraerTag(xml, 'anio') || extraerTag(xml, 'periodoFiscal');
  const anio = Number(soloDigitos(anioTexto).slice(0, 4)) || new Date().getFullYear();

  // Cargas de familia
  let conyuge = false;
  let hijos = 0;
  let hijosDiscapacitados = 0;
  const cargas = extraerBloques(xml, 'cargaFamilia');
  for (const c of cargas) {
    const parentesco = (extraerTag(c, 'parentesco') || c).toUpperCase();
    const discapacitado = /discapac/i.test(c) && /(>|")\s*(S|SI|TRUE|1)\s*(<|")/i.test(c);
    if (/CONYUGE|CÓNYUGE|ESPOS/.test(parentesco)) conyuge = true;
    else if (/HIJO/.test(parentesco)) {
      hijos++;
      if (discapacitado) hijosDiscapacitados++;
    }
  }

  // Deducciones
  const deducciones = {};
  for (const d of extraerBloques(xml, 'deduccion')) {
    const campo = clasificarDeduccion(d);
    // montos: suma de montoTotal / importe / monto de cada bloque
    const monto = extraerNumero(d, ['montoTotal', 'importeTotal', 'importe', 'monto']);
    if (monto > 0) deducciones[campo] = r2((deducciones[campo] || 0) + monto);
  }

  return { cuil, anio, conyuge, hijos, hijosDiscapacitados, deducciones };
}

/**
 * Importa un F.572: ubica al empleado por CUIL dentro del estudio y hace
 * upsert de GananciasEmpleado para el año de la presentación.
 */
async function importarF572(estudioId, xmlBuffer, { anioOverride = null } = {}) {
  const datos = parsearF572(xmlBuffer);
  const anio = anioOverride || datos.anio;

  const cuilFormateado = `${datos.cuil.slice(0, 2)}-${datos.cuil.slice(2, 10)}-${datos.cuil.slice(10)}`;
  const empleado = await prisma.empleado.findFirst({
    where: {
      OR: [{ cuil: cuilFormateado }, { cuil: datos.cuil }],
      empresa: { estudioId },
    },
    select: { id: true, apellido: true, nombre: true, cuil: true, empresa: { select: { razonSocial: true } } },
  });
  if (!empleado) {
    throw Object.assign(new Error(`No existe empleado con CUIL ${cuilFormateado} en el estudio`), { statusCode: 404 });
  }

  const d = datos.deducciones;
  const data = {
    conyuge: datos.conyuge,
    hijos: datos.hijos,
    hijosDiscapacitados: datos.hijosDiscapacitados,
    alquiler: d.alquiler ?? null,
    hipoteca: d.hipoteca ?? null,
    medicinaPrivada: d.medicinaPrivada ?? null,
    sepelio: d.sepelio ?? null,
    donaciones: d.donaciones ?? null,
    otrasDeducciones: d.otrasDeducciones ?? null,
  };

  const registro = await prisma.gananciasEmpleado.upsert({
    where: { empleadoId_anio: { empleadoId: empleado.id, anio } },
    create: { empleadoId: empleado.id, anio, ...data },
    update: data,
  });

  return {
    empleado: `${empleado.apellido}, ${empleado.nombre}`,
    cuil: empleado.cuil,
    empresa: empleado.empresa.razonSocial,
    anio,
    aplicado: {
      conyuge: datos.conyuge,
      hijos: datos.hijos,
      hijosDiscapacitados: datos.hijosDiscapacitados,
      ...d,
    },
    registroId: registro.id,
  };
}

module.exports = { parsearF572, importarF572 };
