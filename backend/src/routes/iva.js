const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');
const JSZip = require('jszip');
const { body, param, query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { calcularPosicionIVA, generarArchivoAFIP, generarArchivoAlicuotasAFIP, agruparPorAlicuota, CODIGOS_COMPROBANTE_AFIP } = require('../services/ivaService');
const { crearAsientoIVA } = require('../services/asientosAutoService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Lector helper: Excel → array de objetos {header_normalizado: valor}
function parseExcelToObjects(buffer, callback) {
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.load(buffer).then(() => {
    const sheet = workbook.worksheets[0];
    const headers = [];
    const filas = [];
    let isFirst = true;
    sheet.eachRow((row) => {
      if (isFirst) {
        row.eachCell(c => headers.push(String(c.value || '').toLowerCase().trim().replace(/\s+/g, '_')));
        isFirst = false;
        return;
      }
      const obj = {};
      let alguno = false;
      row.eachCell((cell, col) => {
        const key = headers[col - 1];
        if (!key) return;
        obj[key] = cell.value;
        if (cell.value !== null && cell.value !== '') alguno = true;
      });
      if (alguno) filas.push(obj);
    });
    return callback(filas);
  });
}

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'object' && 'result' in v) return Number(v.result) || 0;
  return Number(String(v).replace(/,/g, '.')) || 0;
}

function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v.result) return new Date(v.result);
  // Soporta "DD/MM/YYYY"
  const s = String(v);
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (ddmm) return new Date(`${ddmm[3].length === 2 ? '20' + ddmm[3] : ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`);
  return new Date(s);
}

const TIPOS_COMP_VALIDOS = [
  'FACTURA_A','FACTURA_B','FACTURA_C',
  'NOTA_CREDITO_A','NOTA_CREDITO_B','NOTA_CREDITO_C',
  'NOTA_DEBITO_A','NOTA_DEBITO_B','NOTA_DEBITO_C',
  'RECIBO_A','RECIBO_B','RECIBO_C',
  'LIQUIDACION_A','LIQUIDACION_B',
];

const CODIGOS_COMPROBANTE_INV = Object.entries(CODIGOS_COMPROBANTE_AFIP)
  .reduce((acc, [k, v]) => { acc[v] = k; return acc; }, {});

const HEADER_ALIASES = {
  fecha: ['fecha', 'fecha_comprobante', 'fecha_emision', 'fecha_emisión'],
  tipo_comprobante: ['tipo_comprobante', 'tipo', 'tipo_de_comprobante', 'codigo_tipo_comprobante', 'cód_tipo_comprobante'],
  tipo_movimiento: ['tipo_movimiento', 'tipo_mov', 'movimiento', 'compra_venta', 'compra/venta', 'tipo_operacion'],
  pto_venta: ['pto_venta', 'punto_venta', 'punto_de_venta', 'pto_vta', 'pto.venta', 'pv'],
  numero: ['numero', 'nro', 'nro_comprobante', 'nro_comprobante_desde', 'nro_desde', 'numero_desde'],
  numero_hasta: ['numero_hasta', 'nro_hasta'],
  cuit: ['cuit', 'nro_doc', 'nro_doc_emisor', 'nro_doc_receptor', 'nro_doc_emisor/receptor', 'doc_nro'],
  razon_social: ['razon_social', 'razon', 'denominacion', 'denominacion_emisor', 'denominacion_receptor', 'nombre_razon_social'],
  neto_gravado: ['neto_gravado', 'importe_neto_gravado', 'imp_neto_gravado'],
  neto_21: ['neto_21', 'neto_gravado_21', 'importe_neto_21'],
  neto_105: ['neto_105', 'neto_gravado_105', 'neto_gravado_10_5', 'importe_neto_105'],
  neto_27: ['neto_27', 'neto_gravado_27', 'importe_neto_27'],
  iva: ['iva', 'importe_iva', 'imp_iva'],
  iva_21: ['iva_21', 'importe_iva_21'],
  iva_105: ['iva_105', 'iva_10_5', 'importe_iva_105'],
  iva_27: ['iva_27', 'importe_iva_27'],
  no_gravado: ['no_gravado', 'neto_no_gravado', 'imp_no_gravado', 'imp_tot_conc_no_gravados'],
  exento: ['exento', 'imp_exento', 'imp_op_exentas'],
  percep_iva: ['percep_iva', 'percepcion_iva', 'perc_iva'],
  percep_iibb: ['percep_iibb', 'percepcion_iibb', 'perc_iibb', 'percep_ingresos_brutos'],
  retencion: ['retencion', 'retenciones', 'ret_ganancias', 'ret_iibb'],
  total: ['total', 'importe_total', 'imp_total'],
  alicuota: ['alicuota', 'alicuota_iva', 'tasa_iva'],
};

const ALIAS_LOOKUP = Object.entries(HEADER_ALIASES).reduce((acc, [key, aliases]) => {
  aliases.forEach(a => { acc[a] = key; });
  return acc;
}, {});

function normalizarHeader(h) {
  return String(h || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function mapHeader(h) {
  const n = normalizarHeader(h);
  return ALIAS_LOOKUP[n] || n;
}

function parseAfipFile(buffer, filename = '') {
  let fileBuffer = buffer;
  const lower = filename.toLowerCase();

  if (lower.endsWith('.zip')) {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find(e => !e.isDirectory && (e.entryName.endsWith('.xlsx') || e.entryName.endsWith('.xls') || e.entryName.endsWith('.csv') || e.entryName.endsWith('.txt')));
    if (!entry) return [];
    fileBuffer = entry.getData();
  }

  const wb = XLSX.read(fileBuffer, { type: 'buffer', raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows || rows.length === 0) return [];

  const headers = rows[0].map(mapHeader);
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    let alguno = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const value = row[c];
      if (!key) continue;
      obj[key] = value;
      if (value !== null && value !== '') alguno = true;
    }
    if (alguno) data.push(obj);
  }
  return data;
}

function resolverTipoComprobante(raw) {
  if (!raw) return null;
  const val = String(raw).trim().toUpperCase();

  if (/^\d+$/.test(val)) {
    const code = val.padStart(3, '0');
    return CODIGOS_COMPROBANTE_INV[code] || null;
  }

  const norm = val
    .replace(/\s+/g, ' ')
    .replace(/-/g, ' ')
    .trim();

  if (norm.includes('FACTURA')) {
    if (norm.includes(' A')) return 'FACTURA_A';
    if (norm.includes(' B')) return 'FACTURA_B';
    if (norm.includes(' C')) return 'FACTURA_C';
  }
  if (norm.includes('NOTA DE CREDITO') || norm.startsWith('NC')) {
    if (norm.includes(' A')) return 'NOTA_CREDITO_A';
    if (norm.includes(' B')) return 'NOTA_CREDITO_B';
    if (norm.includes(' C')) return 'NOTA_CREDITO_C';
  }
  if (norm.includes('NOTA DE DEBITO') || norm.startsWith('ND')) {
    if (norm.includes(' A')) return 'NOTA_DEBITO_A';
    if (norm.includes(' B')) return 'NOTA_DEBITO_B';
    if (norm.includes(' C')) return 'NOTA_DEBITO_C';
  }
  if (norm.includes('RECIBO')) {
    if (norm.includes(' A')) return 'RECIBO_A';
    if (norm.includes(' B')) return 'RECIBO_B';
    if (norm.includes(' C')) return 'RECIBO_C';
  }
  if (norm.includes('LIQUIDACION')) {
    if (norm.includes(' A')) return 'LIQUIDACION_A';
    if (norm.includes(' B')) return 'LIQUIDACION_B';
  }

  return null;
}

function resolverTipoMovimiento(row, fallback = 'COMPRA') {
  const raw = String(row.tipo_movimiento || row.movimiento || row.tipo_operacion || '').toUpperCase();
  if (raw.includes('VENTA') || raw === 'V') return 'VENTA';
  if (raw.includes('COMPRA') || raw === 'C') return 'COMPRA';
  return fallback;
}

function parseAlicuota(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).replace('%', '').replace(',', '.');
  const n = Number(s);
  if (isNaN(n)) return null;
  if (n > 1) return n;
  return n * 100;
}


// ─── PROVEEDORES / CLIENTES ───────────────────────────────────────────────────

router.get('/proveedores', auth, async (req, res, next) => {
  try {
    const { empresaId, tipo, buscar } = req.query;
    const where = { empresa: { estudioId: req.usuario.estudioId } };
    if (empresaId) where.empresaId = empresaId;
    if (tipo) where.tipo = tipo;
    if (buscar) {
      where.OR = [
        { razonSocial: { contains: buscar, mode: 'insensitive' } },
        { cuit: { contains: buscar } },
      ];
    }

    const lista = await prisma.proveedorCliente.findMany({
      where,
      orderBy: { razonSocial: 'asc' },
    });
    res.json(lista);
  } catch (err) { next(err); }
});

router.post('/proveedores', auth, [
  body('empresaId').isUUID(),
  body('razonSocial').notEmpty(),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({ where: { id: req.body.empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const item = await prisma.proveedorCliente.create({ data: req.body });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

// POST /api/iva/proveedores/importar — importación masiva desde Excel
// Columnas esperadas: razon_social, cuit, tipo (PROVEEDOR/CLIENTE/AMBOS), condicion_iva, email, telefono, domicilio
router.post('/proveedores/importar', auth, upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const { empresaId } = req.body;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const errores = [];
    const creados = [];

    await parseExcelToObjects(req.file.buffer, async (filas) => {
      for (let i = 0; i < filas.length; i++) {
        const r = filas[i];
        const fila = i + 2;
        try {
          const razon = String(r.razon_social || r.razonsocial || r.razon || '').trim();
          if (!razon) { errores.push({ fila, error: 'razon_social vacía' }); continue; }
          creados.push({
            empresaId,
            razonSocial: razon,
            cuit: r.cuit ? String(r.cuit).replace(/[-\s]/g, '') : null,
            tipo: ['PROVEEDOR','CLIENTE','AMBOS'].includes(String(r.tipo || '').toUpperCase()) ? String(r.tipo).toUpperCase() : 'PROVEEDOR',
            condicionIVA: ['RESPONSABLE_INSCRIPTO','MONOTRIBUTISTA','EXENTO','CONSUMIDOR_FINAL','NO_RESPONSABLE'].includes(String(r.condicion_iva || '').toUpperCase().replace(/\s/g, '_'))
              ? String(r.condicion_iva).toUpperCase().replace(/\s/g, '_')
              : 'RESPONSABLE_INSCRIPTO',
            email: r.email ? String(r.email) : null,
            telefono: r.telefono ? String(r.telefono) : null,
            domicilio: r.domicilio ? String(r.domicilio) : null,
          });
        } catch (e) { errores.push({ fila, error: e.message }); }
      }
    });

    let exitosos = 0;
    for (const data of creados) {
      try {
        await prisma.proveedorCliente.create({ data });
        exitosos++;
      } catch (e) {
        errores.push({ razonSocial: data.razonSocial, cuit: data.cuit, error: e.message });
      }
    }

    res.json({ total: creados.length, exitosos, fallidos: errores.length, errores });
  } catch (err) { next(err); }
});

router.put('/proveedores/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.proveedorCliente.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'No encontrado' });

    const { empresaId, ...data } = req.body;
    const updated = await prisma.proveedorCliente.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── COMPROBANTES IVA ─────────────────────────────────────────────────────────

router.get('/comprobantes', auth, async (req, res, next) => {
  try {
    const { empresaId, tipoMovimiento, anio, mes, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { empresa: { estudioId: req.usuario.estudioId } };
    if (empresaId) where.empresaId = empresaId;
    if (tipoMovimiento) where.tipoMovimiento = tipoMovimiento;
    if (anio) where.periodoFiscalAnio = parseInt(anio);
    if (mes) where.periodoFiscalMes = parseInt(mes);

    const [data, total] = await Promise.all([
      prisma.comprobanteIVA.findMany({
        where, skip, take: Number(limit),
        include: {
          proveedorCliente: { select: { id: true, razonSocial: true, cuit: true, condicionIVA: true } },
          empresa: { select: { id: true, razonSocial: true } },
        },
        orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
      }),
      prisma.comprobanteIVA.count({ where }),
    ]);

    res.json({ data, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
  } catch (err) { next(err); }
});

router.get('/comprobantes/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const comp = await prisma.comprobanteIVA.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: {
        proveedorCliente: true,
        items: { include: { cuentaContable: { select: { id: true, codigo: true, nombre: true } } }, orderBy: { orden: 'asc' } },
      },
    });
    if (!comp) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.json(comp);
  } catch (err) { next(err); }
});

// POST /api/iva/comprobantes/importar — importación masiva desde Excel
// Columnas: fecha, tipo_movimiento (COMPRA/VENTA), tipo_comprobante (FACTURA_A/B/C...),
// pto_venta, numero, cuit_proveedor, razon_social, neto_21, neto_105, neto_27,
// iva_21, iva_105, iva_27, exento, no_gravado, percep_iva, percep_iibb, retencion, total
// POST /api/iva/comprobantes/ocr — extrae datos de un PDF/imagen subido.
// Devuelve campos sugeridos para pre-llenar el formulario. NO persiste nada.
router.post('/comprobantes/ocr', auth, upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const { extraerDatosComprobante, PROVIDER } = require('../services/ocrService');
    const resultado = await extraerDatosComprobante(req.file.buffer, {
      mimeType: req.file.mimetype,
      filename: req.file.originalname,
    });
    res.json({ provider: PROVIDER, ...resultado });
  } catch (err) { next(err); }
});

router.post('/comprobantes/importar', auth, upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const { empresaId } = req.body;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const errores = [];
    const aCrear = [];

    await parseExcelToObjects(req.file.buffer, (filas) => {
      filas.forEach((r, i) => {
        const fila = i + 2;
        try {
          const fecha = parseFecha(r.fecha);
          if (!fecha || isNaN(fecha.getTime())) { errores.push({ fila, error: 'fecha inválida' }); return; }

          const tipoMov = String(r.tipo_movimiento || r.tipo_mov || r.movimiento || '').toUpperCase();
          if (!['COMPRA','VENTA'].includes(tipoMov)) { errores.push({ fila, error: 'tipo_movimiento debe ser COMPRA o VENTA' }); return; }

          const tipoComp = String(r.tipo_comprobante || r.tipo || 'FACTURA_B').toUpperCase().replace(/\s/g, '_');
          if (!TIPOS_COMP_VALIDOS.includes(tipoComp)) { errores.push({ fila, error: `tipo_comprobante "${tipoComp}" no válido` }); return; }

          const pto = Number(r.pto_venta || r.puntoventa || r.pto || 1);
          const numero = Number(r.numero || r.nro || 0);
          if (!numero) { errores.push({ fila, error: 'numero requerido' }); return; }

          const neto21 = num(r.neto_21 || r.neto21);
          const neto105 = num(r.neto_105 || r.neto105);
          const neto27 = num(r.neto_27 || r.neto27);
          const iva21 = num(r.iva_21 || r.iva21) || (neto21 * 0.21);
          const iva105 = num(r.iva_105 || r.iva105) || (neto105 * 0.105);
          const iva27 = num(r.iva_27 || r.iva27) || (neto27 * 0.27);
          const exento = num(r.exento);
          const noGravado = num(r.no_gravado || r.nogravado);
          const percepIVA = num(r.percep_iva || r.percepcioniva);
          const percepIIBB = num(r.percep_iibb || r.percepcioniibb);
          const retencion = num(r.retencion);
          const total = num(r.total) || (neto21 + neto105 + neto27 + iva21 + iva105 + iva27 + exento + noGravado + percepIVA + percepIIBB - retencion);

          aCrear.push({
            _fila: fila,
            _cuitProveedor: r.cuit_proveedor ? String(r.cuit_proveedor).replace(/[-\s]/g, '') : null,
            _razonProveedor: r.razon_social ? String(r.razon_social).trim() : null,
            data: {
              empresaId,
              tipoMovimiento: tipoMov,
              tipoComprobante: tipoComp,
              puntoVenta: pto,
              numero,
              fecha,
              periodoFiscalAnio: fecha.getFullYear(),
              periodoFiscalMes: fecha.getMonth() + 1,
              netoGravado21: neto21,
              netoGravado105: neto105,
              netoGravado27: neto27,
              netoNoGravado: noGravado,
              exento,
              iva21,
              iva105,
              iva27,
              percepcionIVA: percepIVA,
              percepcionIIBB: percepIIBB,
              retencion,
              total,
            },
          });
        } catch (e) { errores.push({ fila, error: e.message }); }
      });
    });

    // Resolver proveedores: crear los que no existen (matching por cuit, si no por razon_social)
    const cuitsUnicos = [...new Set(aCrear.map(x => x._cuitProveedor).filter(Boolean))];
    const proveedoresEx = await prisma.proveedorCliente.findMany({
      where: { empresaId, cuit: { in: cuitsUnicos } },
      select: { id: true, cuit: true },
    });
    const cuitToId = {};
    proveedoresEx.forEach(p => { if (p.cuit) cuitToId[p.cuit] = p.id; });

    let exitosos = 0;
    for (const item of aCrear) {
      try {
        if (item._cuitProveedor && !cuitToId[item._cuitProveedor]) {
          const nuevo = await prisma.proveedorCliente.create({
            data: {
              empresaId,
              razonSocial: item._razonProveedor || `Proveedor ${item._cuitProveedor}`,
              cuit: item._cuitProveedor,
              tipo: item.data.tipoMovimiento === 'COMPRA' ? 'PROVEEDOR' : 'CLIENTE',
            },
          });
          cuitToId[item._cuitProveedor] = nuevo.id;
        }
        if (item._cuitProveedor) item.data.proveedorClienteId = cuitToId[item._cuitProveedor];

        await prisma.comprobanteIVA.create({ data: item.data });
        exitosos++;
      } catch (e) {
        errores.push({ fila: item._fila, numero: item.data.numero, error: e.message });
      }
    }

    res.json({ total: aCrear.length, exitosos, fallidos: errores.length, errores: errores.slice(0, 100) });
  } catch (err) { next(err); }
});

// POST /api/iva/comprobantes/importar-afip — importación AFIP Mis Comprobantes (Excel/ZIP)
router.post('/comprobantes/importar-afip', auth, upload.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
    const { empresaId, tipoMovimiento: tipoMovDefault } = req.body;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const filas = parseAfipFile(req.file.buffer, req.file.originalname || 'afip');
    if (!filas.length) return res.status(400).json({ error: 'No se pudieron leer filas del archivo' });

    const errores = [];
    const agrupados = new Map();

    filas.forEach((r, i) => {
      const fila = i + 2;
      try {
        const fecha = parseFecha(r.fecha);
        if (!fecha || isNaN(fecha.getTime())) { errores.push({ fila, error: 'fecha inválida' }); return; }

        const tipoMov = resolverTipoMovimiento(r, String(tipoMovDefault || 'COMPRA').toUpperCase());
        if (!['COMPRA', 'VENTA'].includes(tipoMov)) { errores.push({ fila, error: 'tipo_movimiento debe ser COMPRA o VENTA' }); return; }

        const tipoComp = resolverTipoComprobante(r.tipo_comprobante || r.tipo);
        if (!tipoComp || !TIPOS_COMP_VALIDOS.includes(tipoComp)) { errores.push({ fila, error: 'tipo_comprobante inválido' }); return; }

        const pto = Number(r.pto_venta || r.punto_venta || 1);
        const numero = Number(r.numero || r.numero_desde || r.nro || 0);
        if (!numero) { errores.push({ fila, error: 'numero requerido' }); return; }

        const numeroHasta = Number(r.numero_hasta || r.nro_hasta || numero);
        const cuit = r.cuit ? String(r.cuit).replace(/[-\s]/g, '') : null;
        const razon = r.razon_social ? String(r.razon_social).trim() : null;

        let neto21 = num(r.neto_21);
        let neto105 = num(r.neto_105);
        let neto27 = num(r.neto_27);
        let iva21 = num(r.iva_21);
        let iva105 = num(r.iva_105);
        let iva27 = num(r.iva_27);

        const netoGravado = num(r.neto_gravado);
        const iva = num(r.iva);
        const alicuota = parseAlicuota(r.alicuota) || 21;

        const exento = num(r.exento);
        const noGravado = num(r.no_gravado);
        const percepIVA = num(r.percep_iva);
        const percepIIBB = num(r.percep_iibb);
        const retencion = num(r.retencion);
        const total = num(r.total);

        if (!neto21 && !neto105 && !neto27 && netoGravado) {
          if (alicuota === 10.5) { neto105 = netoGravado; iva105 = iva || netoGravado * 0.105; }
          else if (alicuota === 27) { neto27 = netoGravado; iva27 = iva || netoGravado * 0.27; }
          else { neto21 = netoGravado; iva21 = iva || netoGravado * 0.21; }
        }

        if (!neto21 && !neto105 && !neto27 && total) {
          const base = total - iva - exento - noGravado - percepIVA - percepIIBB + retencion;
          if (alicuota === 10.5) { neto105 = base; iva105 = iva || base * 0.105; }
          else if (alicuota === 27) { neto27 = base; iva27 = iva || base * 0.27; }
          else { neto21 = base; iva21 = iva || base * 0.21; }
        }

        const key = `${tipoMov}|${tipoComp}|${pto}|${numero}|${fecha.toISOString().slice(0, 10)}|${cuit || razon || 'CF'}`;
        if (!agrupados.has(key)) {
          agrupados.set(key, {
            _fila: fila,
            _cuit: cuit,
            _razon: razon,
            data: {
              empresaId,
              tipoMovimiento: tipoMov,
              tipoComprobante: tipoComp,
              puntoVenta: pto,
              numero,
              numeroHasta,
              fecha,
              periodoFiscalAnio: fecha.getFullYear(),
              periodoFiscalMes: fecha.getMonth() + 1,
              netoGravado21: 0,
              netoGravado105: 0,
              netoGravado27: 0,
              netoNoGravado: 0,
              exento: 0,
              iva21: 0,
              iva105: 0,
              iva27: 0,
              percepcionIVA: 0,
              percepcionIIBB: 0,
              retencion: 0,
              total: 0,
            },
          });
        }

        const item = agrupados.get(key);
        item.data.netoGravado21 += neto21;
        item.data.netoGravado105 += neto105;
        item.data.netoGravado27 += neto27;
        item.data.iva21 += iva21;
        item.data.iva105 += iva105;
        item.data.iva27 += iva27;
        item.data.netoNoGravado += noGravado;
        item.data.exento += exento;
        item.data.percepcionIVA += percepIVA;
        item.data.percepcionIIBB += percepIIBB;
        item.data.retencion += retencion;
        item.data.total += total;
      } catch (e) {
        errores.push({ fila, error: e.message });
      }
    });

    const aCrear = Array.from(agrupados.values()).map(item => {
      const netoTotal = item.data.netoGravado21 + item.data.netoGravado105 + item.data.netoGravado27;
      const ivaTotal = item.data.iva21 + item.data.iva105 + item.data.iva27;
      const totalCalc = netoTotal + ivaTotal + item.data.netoNoGravado + item.data.exento + item.data.percepcionIVA + item.data.percepcionIIBB - item.data.retencion;
      return {
        _fila: item._fila,
        _cuit: item._cuit,
        _razon: item._razon,
        data: {
          ...item.data,
          total: item.data.total || totalCalc,
        },
      };
    });

    const cuitsUnicos = [...new Set(aCrear.map(x => x._cuit).filter(Boolean))];
    const proveedoresEx = await prisma.proveedorCliente.findMany({
      where: { empresaId, cuit: { in: cuitsUnicos } },
      select: { id: true, cuit: true },
    });
    const cuitToId = {};
    proveedoresEx.forEach(p => { if (p.cuit) cuitToId[p.cuit] = p.id; });

    let exitosos = 0;
    for (const item of aCrear) {
      try {
        if (item._cuit && !cuitToId[item._cuit]) {
          const nuevo = await prisma.proveedorCliente.create({
            data: {
              empresaId,
              razonSocial: item._razon || `Proveedor ${item._cuit}`,
              cuit: item._cuit,
              tipo: item.data.tipoMovimiento === 'COMPRA' ? 'PROVEEDOR' : 'CLIENTE',
            },
          });
          cuitToId[item._cuit] = nuevo.id;
        }
        if (item._cuit) item.data.proveedorClienteId = cuitToId[item._cuit];

        await prisma.comprobanteIVA.create({ data: item.data });
        exitosos++;
      } catch (e) {
        errores.push({ fila: item._fila, numero: item.data.numero, error: e.message });
      }
    }

    res.json({ total: aCrear.length, exitosos, fallidos: errores.length, errores: errores.slice(0, 100) });
  } catch (err) { next(err); }
});

router.post('/comprobantes', auth, [
  body('empresaId').isUUID(),
  body('tipoMovimiento').isIn(['COMPRA', 'VENTA']),
  body('tipoComprobante').notEmpty(),
  body('puntoVenta').isInt({ min: 1 }),
  body('numero').isInt({ min: 1 }),
  body('fecha').isISO8601(),
  body('periodoFiscalAnio').isInt(),
  body('periodoFiscalMes').isInt({ min: 1, max: 12 }),
  validate,
], async (req, res, next) => {
  try {
    const empresa = await prisma.empresa.findFirst({ where: { id: req.body.empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { items, ...compData } = req.body;
    compData.fecha = new Date(compData.fecha);
    compData.puntoVenta = Number(compData.puntoVenta);
    compData.numero = Number(compData.numero);
    if (compData.numeroHasta) compData.numeroHasta = Number(compData.numeroHasta);
    compData.periodoFiscalAnio = Number(compData.periodoFiscalAnio);
    compData.periodoFiscalMes = Number(compData.periodoFiscalMes);

    // Calcula IVA automáticamente desde los ítems si se proveen
    if (items && items.length > 0) {
      let neto21 = 0, neto105 = 0, neto27 = 0, iva21 = 0, iva105 = 0, iva27 = 0;
      for (const item of items) {
        const base = parseFloat(item.importe);
        const ali = parseFloat(item.alicuotaIVA);
        if (ali === 21) { neto21 += base; iva21 += base * 0.21; }
        else if (ali === 10.5) { neto105 += base; iva105 += base * 0.105; }
        else if (ali === 27) { neto27 += base; iva27 += base * 0.27; }
      }
      compData.netoGravado21 = neto21;
      compData.netoGravado105 = neto105;
      compData.netoGravado27 = neto27;
      compData.iva21 = iva21;
      compData.iva105 = iva105;
      compData.iva27 = iva27;
    }

    // Calcula total
    const base = parseFloat(compData.netoGravado21 || 0) + parseFloat(compData.netoGravado105 || 0) + parseFloat(compData.netoGravado27 || 0);
    const ivaSum = parseFloat(compData.iva21 || 0) + parseFloat(compData.iva105 || 0) + parseFloat(compData.iva27 || 0);
    compData.total = compData.total ||
      base + ivaSum +
      parseFloat(compData.netoNoGravado || 0) +
      parseFloat(compData.exento || 0) +
      parseFloat(compData.percepcionIVA || 0) +
      parseFloat(compData.percepcionIIBB || 0) -
      parseFloat(compData.retencion || 0);

    const comprobante = await prisma.comprobanteIVA.create({
      data: {
        ...compData,
        items: items ? { create: items.map((item, i) => ({ ...item, orden: i })) } : undefined,
      },
      include: { proveedorCliente: true, items: true },
    });

    // Auto-asiento contable (silencioso si falla)
    const asiento = await crearAsientoIVA(comprobante, compData.empresaId);

    res.status(201).json({ ...comprobante, asientoId: asiento?.id });
  } catch (err) { next(err); }
});

router.put('/comprobantes/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.comprobanteIVA.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Comprobante no encontrado' });

    const { items, empresaId, ...data } = req.body;
    if (data.fecha) data.fecha = new Date(data.fecha);
    if (data.puntoVenta !== undefined) data.puntoVenta = Number(data.puntoVenta);
    if (data.numero !== undefined) data.numero = Number(data.numero);
    if (data.numeroHasta !== undefined) data.numeroHasta = Number(data.numeroHasta);
    if (data.periodoFiscalAnio !== undefined) data.periodoFiscalAnio = Number(data.periodoFiscalAnio);
    if (data.periodoFiscalMes !== undefined) data.periodoFiscalMes = Number(data.periodoFiscalMes);

    const updated = await prisma.comprobanteIVA.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(items ? {
          items: {
            deleteMany: {},
            create: items.map((item, i) => ({ ...item, orden: i })),
          },
        } : {}),
      },
      include: { proveedorCliente: true, items: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE (anulación lógica)
router.delete('/comprobantes/:id', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const existing = await prisma.comprobanteIVA.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
    });
    if (!existing) return res.status(404).json({ error: 'Comprobante no encontrado' });

    await prisma.comprobanteIVA.update({ where: { id: req.params.id }, data: { anulado: true } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── LIBRO IVA ────────────────────────────────────────────────────────────────

router.get('/libro', auth, async (req, res, next) => {
  try {
    const { empresaId, tipoMovimiento, anio, mes } = req.query;
    if (!empresaId || !tipoMovimiento || !anio || !mes) {
      return res.status(400).json({ error: 'empresaId, tipoMovimiento, anio y mes son requeridos' });
    }

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const comprobantes = await prisma.comprobanteIVA.findMany({
      where: {
        empresaId,
        tipoMovimiento,
        periodoFiscalAnio: parseInt(anio),
        periodoFiscalMes: parseInt(mes),
      },
      include: { proveedorCliente: { select: { razonSocial: true, cuit: true, condicionIVA: true } } },
      orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
    });

    const totales = agruparPorAlicuota(comprobantes);
    const posicionIVA = calcularPosicionIVA(comprobantes);

    res.json({ empresa, comprobantes, totales, posicionIVA, anio: parseInt(anio), mes: parseInt(mes) });
  } catch (err) { next(err); }
});

// ─── POSICIÓN IVA ─────────────────────────────────────────────────────────────

router.get('/posicion', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.query;
    if (!empresaId || !anio || !mes) return res.status(400).json({ error: 'Parámetros requeridos' });

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const comprobantes = await prisma.comprobanteIVA.findMany({
      where: { empresaId, periodoFiscalAnio: parseInt(anio), periodoFiscalMes: parseInt(mes) },
    });

    const posicion = calcularPosicionIVA(comprobantes);
    res.json({ ...posicion, empresa: { id: empresa.id, razonSocial: empresa.razonSocial }, anio: parseInt(anio), mes: parseInt(mes) });
  } catch (err) { next(err); }
});

// ─── EXPORTACIÓN AFIP ─────────────────────────────────────────────────────────

router.get('/exportar-afip', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipoMovimiento } = req.query;
    if (!empresaId || !anio || !mes || !tipoMovimiento) {
      return res.status(400).json({ error: 'Parámetros requeridos' });
    }

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const comprobantes = await prisma.comprobanteIVA.findMany({
      where: {
        empresaId,
        tipoMovimiento,
        periodoFiscalAnio: parseInt(anio),
        periodoFiscalMes: parseInt(mes),
      },
      include: { proveedorCliente: true },
      orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
    });

    const contenido = generarArchivoAFIP(comprobantes, empresa.cuit, anio, mes, tipoMovimiento);
    const tipo = tipoMovimiento === 'COMPRA' ? 'compras' : 'ventas';
    const filename = `iva_${tipo}_${empresa.cuit.replace(/-/g, '')}_${anio}${String(mes).padStart(2, '0')}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(contenido);
  } catch (err) { next(err); }
});

// ─── EXPORTACIÓN AFIP ZIP (Comprobantes + Alícuotas) ────────────────────────
router.get('/exportar-afip-zip', auth, async (req, res, next) => {
  try {
    const { empresaId, anio, mes, tipoMovimiento } = req.query;
    if (!empresaId || !anio || !mes || !tipoMovimiento) {
      return res.status(400).json({ error: 'Parámetros requeridos' });
    }

    const empresa = await prisma.empresa.findFirst({ where: { id: empresaId, estudioId: req.usuario.estudioId } });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const comprobantes = await prisma.comprobanteIVA.findMany({
      where: {
        empresaId,
        tipoMovimiento,
        periodoFiscalAnio: parseInt(anio),
        periodoFiscalMes: parseInt(mes),
      },
      include: { proveedorCliente: true },
      orderBy: [{ fecha: 'asc' }, { numero: 'asc' }],
    });

    const contenidoComp = generarArchivoAFIP(comprobantes, empresa.cuit, anio, mes, tipoMovimiento);
    const contenidoAlic = generarArchivoAlicuotasAFIP(comprobantes, tipoMovimiento);

    const tipo = tipoMovimiento === 'COMPRA' ? 'compras' : 'ventas';
    const periodo = `${anio}${String(mes).padStart(2, '0')}`;
    const cuit = empresa.cuit.replace(/-/g, '');
    const zip = new JSZip();
    zip.file(`REGINFO_CV_${tipo.toUpperCase()}_${cuit}_${periodo}.txt`, contenidoComp || '');
    zip.file(`REGINFO_CV_${tipo.toUpperCase()}_ALICUOTAS_${cuit}_${periodo}.txt`, contenidoAlic || '');
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="iva_${tipo}_${cuit}_${periodo}.zip"`);
    res.send(zipBuffer);
  } catch (err) { next(err); }
});

// ─── PAGOS DE COMPROBANTES (CUENTAS CORRIENTES) ───────────────────────────────

router.get('/comprobantes/:id/pagos', auth, [param('id').isUUID(), validate], async (req, res, next) => {
  try {
    const comp = await prisma.comprobanteIVA.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: { pagos: { orderBy: { fecha: 'asc' } } },
    });
    if (!comp) return res.status(404).json({ error: 'Comprobante no encontrado' });

    const totalPagado = comp.pagos.reduce((s, p) => s + Number(p.importe), 0);
    const saldo = Number(comp.total) - totalPagado;
    res.json({ pagos: comp.pagos, totalPagado, saldo, total: Number(comp.total) });
  } catch (err) { next(err); }
});

router.post('/comprobantes/:id/pago', auth, [
  param('id').isUUID(),
  body('fecha').isISO8601(),
  body('importe').isFloat({ min: 0.01 }),
  validate,
], async (req, res, next) => {
  try {
    const comp = await prisma.comprobanteIVA.findFirst({
      where: { id: req.params.id, empresa: { estudioId: req.usuario.estudioId } },
      include: { pagos: true },
    });
    if (!comp) return res.status(404).json({ error: 'Comprobante no encontrado' });

    const totalPagado = comp.pagos.reduce((s, p) => s + Number(p.importe), 0);
    const saldo = Number(comp.total) - totalPagado;
    if (Number(req.body.importe) > saldo + 0.01) {
      return res.status(400).json({ error: `El importe supera el saldo pendiente de $ ${saldo.toFixed(2)}` });
    }

    const pago = await prisma.pagoComprobante.create({
      data: { comprobanteId: req.params.id, ...req.body },
    });
    res.status(201).json(pago);
  } catch (err) { next(err); }
});

// ─── RESUMEN CUENTAS CORRIENTES ───────────────────────────────────────────────

router.get('/cuentas-corrientes', auth, async (req, res, next) => {
  try {
    const { empresaId, tipo } = req.query;
    if (!empresaId) return res.status(400).json({ error: 'empresaId requerido' });

    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, estudioId: req.usuario.estudioId },
    });
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

    const tipoFiltro = tipo === 'CLIENTE' ? 'CLIENTE' : 'PROVEEDOR';
    const tipoMov = tipoFiltro === 'CLIENTE' ? 'VENTA' : 'COMPRA';

    const proveedores = await prisma.proveedorCliente.findMany({
      where: { empresaId, tipo: { in: [tipoFiltro, 'AMBOS'] } },
      include: {
        comprobantes: {
          where: { anulado: false, tipoMovimiento: tipoMov },
          include: { pagos: true },
        },
      },
    });

    const hoy = new Date();
    const resultado = proveedores.map(p => {
      const facturasAbiertas = p.comprobantes.filter(c => {
        const pagado = c.pagos.reduce((s, pg) => s + Number(pg.importe), 0);
        return Number(c.total) - pagado > 0.01;
      });

      const saldoTotal = facturasAbiertas.reduce((s, c) => {
        const pagado = c.pagos.reduce((sp, pg) => sp + Number(pg.importe), 0);
        return s + (Number(c.total) - pagado);
      }, 0);

      // Aging
      const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
      for (const c of facturasAbiertas) {
        const pagado = c.pagos.reduce((s, pg) => s + Number(pg.importe), 0);
        const saldoComp = Number(c.total) - pagado;
        const dias = Math.floor((hoy - new Date(c.fecha)) / 86400000);
        if (dias <= 30) aging.d0_30 += saldoComp;
        else if (dias <= 60) aging.d31_60 += saldoComp;
        else if (dias <= 90) aging.d61_90 += saldoComp;
        else aging.d90plus += saldoComp;
      }

      return {
        id: p.id,
        razonSocial: p.razonSocial,
        cuit: p.cuit,
        saldoTotal,
        facturasAbiertas: facturasAbiertas.length,
        aging,
      };
    }).filter(p => p.saldoTotal > 0.01);

    res.json(resultado);
  } catch (err) { next(err); }
});

module.exports = router;
