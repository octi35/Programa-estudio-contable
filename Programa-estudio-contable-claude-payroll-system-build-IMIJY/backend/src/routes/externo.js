const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

// Cache en memoria simple (evita hammering a APIs externas)
const cache = {};

async function fetchJSON(url, ttlSeconds = 300) {
  const now = Date.now();
  if (cache[url] && (now - cache[url].time) < ttlSeconds * 1000) {
    return cache[url].data;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'EstudioPRO/1.0' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache[url] = { data, time: now };
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, ttlSeconds = 900) {
  const now = Date.now();
  if (cache[url] && (now - cache[url].time) < ttlSeconds * 1000) {
    return cache[url].data;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'EstudioPRO/1.0' } });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.text();
    cache[url] = { data, time: now };
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const s = match[1];
    const extractTag = (tag) => {
      const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i');
      const plainRe  = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
      const cm = cdataRe.exec(s) || plainRe.exec(s);
      return cm ? cm[1].trim() : '';
    };
    const title = extractTag('title');
    if (!title) continue;
    items.push({
      title,
      link: extractTag('link') || extractTag('guid'),
      description: extractTag('description').replace(/<[^>]+>/g, '').substring(0, 250),
      pubDate: extractTag('pubDate'),
    });
  }
  return items.slice(0, 12);
}

// Noticias de reserva cuando el RSS falla
const NOTICIAS_ESTATICAS = [
  { title: 'Portal ARCA — Novedades fiscales', link: 'https://www.argentina.gob.ar/arca', description: 'Accedé a las últimas novedades de la Agencia de Recaudación y Control Aduanero.', pubDate: '' },
  { title: 'Facturación electrónica — Guía completa', link: 'https://www.afip.gob.ar/fe/documentos/AFIP_Manual_de_conceptos_basicos_del_sistema_de_facturacion_electronica.pdf', description: 'Manual oficial de AFIP sobre el sistema de facturación electrónica.', pubDate: '' },
  { title: 'Monotributo — Categorías y cuotas vigentes', link: 'https://www.afip.gob.ar/monotributo/categorias.asp', description: 'Consultá las categorías, parámetros y montos vigentes del Régimen Simplificado.', pubDate: '' },
  { title: 'SIRADIG — Formulario 572 online', link: 'https://siradig.afip.gob.ar/', description: 'Los empleados en relación de dependencia declaran sus deducciones para el cálculo de Ganancias 4ª categoría.', pubDate: '' },
  { title: 'F.931 SICOSS — Declaración jurada SIPA', link: 'https://www.afip.gob.ar/sicoss/', description: 'Sistema de Cálculo de Obligaciones de la Seguridad Social. Presentación mensual de aportes y contribuciones.', pubDate: '' },
  { title: 'Consulta de CUIT y constancias', link: 'https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do', description: 'Verificá la constancia de inscripción y el estado de cualquier CUIT del padrón de AFIP/ARCA.', pubDate: '' },
];

// GET /api/externo/dolar
router.get('/dolar', auth, async (req, res, next) => {
  try {
    // dolarapi.com — API pública gratuita con cotizaciones en tiempo real
    const data = await fetchJSON('https://dolarapi.com/v1/dolares', 180);
    res.json({ ok: true, cotizaciones: data, fuente: 'dolarapi.com', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'No se pudo obtener cotización en este momento', cotizaciones: [] });
  }
});

// GET /api/externo/noticias-afip
router.get('/noticias-afip', auth, async (req, res, next) => {
  try {
    const xml = await fetchText('https://www.afip.gob.ar/rss/ultimasNovedades.xml', 1800);
    const items = parseRSS(xml);
    if (items.length > 0) return res.json({ ok: true, items, fuente: 'ARCA/AFIP RSS' });
    throw new Error('RSS sin items');
  } catch {
    // RSS no disponible — devolver noticias estáticas curadas
    res.json({ ok: true, items: NOTICIAS_ESTATICAS, fuente: 'curado' });
  }
});

module.exports = router;
