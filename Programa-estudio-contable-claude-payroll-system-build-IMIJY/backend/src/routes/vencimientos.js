const prisma = require('../lib/prisma');
const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const { auth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const dayjs = require('dayjs');


// Días hábiles tentativas de vencimiento por terminación CUIT
const VENC_POR_CUIT = {
  '0': 12, '1': 12,
  '2': 13, '3': 13,
  '4': 14, '5': 14,
  '6': 15, '7': 15,
  '8': 16, '9': 16,
};

function ultimoDigitoCuit(cuit) {
  if (!cuit) return '0';
  const limpio = cuit.replace(/[-\s]/g, '');
  return limpio[limpio.length - 1] || '0';
}

function agregarDiasHabiles(fecha, dias) {
  let d = dayjs(fecha);
  let restantes = dias;
  while (restantes > 0) {
    d = d.add(1, 'day');
    if (d.day() !== 0 && d.day() !== 6) restantes--;
  }
  return d;
}

function calcularVencimientos(empresa, anio, mes) {
  const digito = ultimoDigitoCuit(empresa.cuit);
  const diaBase = VENC_POR_CUIT[digito] || 15;
  const mesRef = dayjs(`${anio}-${String(mes).padStart(2, '0')}-01`);
  const mesSig = mesRef.add(1, 'month');
  const hoy = dayjs();

  const vencimientos = [];

  // IVA mensual (RI) — mes siguiente, día según CUIT
  const fechaIVA = mesSig.date(diaBase);
  vencimientos.push({
    tipo: 'IVA',
    descripcion: `IVA ${mesRef.format('MM/YYYY')} — Presentación DJ`,
    fecha: fechaIVA.toISOString(),
    vencido: fechaIVA.isBefore(hoy),
    diasRestantes: fechaIVA.diff(hoy, 'day'),
  });

  // F931 sueldos — mismo día que IVA, mes siguiente
  const fechaF931 = mesSig.date(diaBase);
  vencimientos.push({
    tipo: 'F931',
    descripcion: `F.931 Sueldos ${mesRef.format('MM/YYYY')}`,
    fecha: fechaF931.toISOString(),
    vencido: fechaF931.isBefore(hoy),
    diasRestantes: fechaF931.diff(hoy, 'day'),
  });

  // IIBB — día 15 del mes siguiente
  const fechaIIBB = mesSig.date(15);
  vencimientos.push({
    tipo: 'IIBB',
    descripcion: `IIBB ${mesRef.format('MM/YYYY')}`,
    fecha: fechaIIBB.toISOString(),
    vencido: fechaIIBB.isBefore(hoy),
    diasRestantes: fechaIIBB.diff(hoy, 'day'),
  });

  // Monotributo — día 20 del mes siguiente
  const fechaMono = mesSig.date(20);
  vencimientos.push({
    tipo: 'MONOTRIBUTO',
    descripcion: `Cuota Monotributo ${mesSig.format('MM/YYYY')}`,
    fecha: fechaMono.toISOString(),
    vencido: fechaMono.isBefore(hoy),
    diasRestantes: fechaMono.diff(hoy, 'day'),
  });

  // Ganancias sociedades — bimestral, día 13 del bimestre siguiente
  if (mes % 2 === 0) {
    const fechaGanancias = mesSig.date(13);
    vencimientos.push({
      tipo: 'GANANCIAS',
      descripcion: `Anticipo Ganancias Bimestre ${Math.ceil(mes / 2)}`,
      fecha: fechaGanancias.toISOString(),
      vencido: fechaGanancias.isBefore(hoy),
      diasRestantes: fechaGanancias.diff(hoy, 'day'),
    });
  }

  // Sueldos — pago de haberes antes del día 4 del mes siguiente
  const fechaSueldos = mesSig.date(4);
  vencimientos.push({
    tipo: 'SUELDOS',
    descripcion: `Pago haberes nómina ${mesRef.format('MM/YYYY')}`,
    fecha: fechaSueldos.toISOString(),
    vencido: fechaSueldos.isBefore(hoy),
    diasRestantes: fechaSueldos.diff(hoy, 'day'),
  });

  return vencimientos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

function flattenForEmpresa(empresa, items) {
  const empresaInfo = { id: empresa.id, razonSocial: empresa.razonSocial, cuit: empresa.cuit };
  return items.map((v, idx) => ({
    id: `${empresa.id}-${v.tipo}-${v.fecha}-${idx}`,
    ...v,
    empresa: empresaInfo,
    empresaId: empresa.id,
  }));
}

// GET /api/vencimientos?empresaId&anio&mes  -> array plano
router.get('/', auth, [
  query('anio').isInt({ min: 2000, max: 2099 }),
  query('mes').isInt({ min: 1, max: 12 }),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, anio, mes } = req.query;

    if (empresaId) {
      const empresa = await prisma.empresa.findFirst({
        where: { id: empresaId, estudioId: req.usuario.estudioId },
      });
      if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

      const items = calcularVencimientos(empresa, Number(anio), Number(mes));
      return res.json(flattenForEmpresa(empresa, items));
    }

    const empresas = await prisma.empresa.findMany({
      where: { estudioId: req.usuario.estudioId, activa: true },
      orderBy: { razonSocial: 'asc' },
    });

    const resultado = empresas.flatMap(e =>
      flattenForEmpresa(e, calcularVencimientos(e, Number(anio), Number(mes)))
    );

    res.json(resultado);
  } catch (err) { next(err); }
});

// GET /api/vencimientos/proximos?empresaId&desde&hasta -> array plano
router.get('/proximos', auth, [
  query('desde').isISO8601(),
  query('hasta').isISO8601(),
  validate,
], async (req, res, next) => {
  try {
    const { empresaId, desde, hasta } = req.query;
    const desdeD = dayjs(desde).startOf('day');
    const hastaD = dayjs(hasta).endOf('day');

    const where = { estudioId: req.usuario.estudioId, activa: true };
    if (empresaId) where.id = empresaId;

    const empresas = await prisma.empresa.findMany({ where, orderBy: { razonSocial: 'asc' } });

    // Generamos vencimientos de los meses tocados por el rango (mes actual + siguiente cubre 30 días)
    const meses = new Set();
    let cur = desdeD.startOf('month');
    const fin = hastaD.startOf('month');
    while (cur.isBefore(fin) || cur.isSame(fin)) {
      meses.add(`${cur.year()}-${cur.month() + 1}`);
      cur = cur.add(1, 'month');
    }
    // Tambien el mes anterior por las dudas (vencimientos del mes pasado que caen ahora)
    meses.add(`${desdeD.subtract(1, 'month').year()}-${desdeD.subtract(1, 'month').month() + 1}`);

    const resultado = [];
    for (const e of empresas) {
      for (const key of meses) {
        const [a, m] = key.split('-').map(Number);
        const items = calcularVencimientos(e, a, m);
        for (const v of flattenForEmpresa(e, items)) {
          const f = dayjs(v.fecha);
          if ((f.isAfter(desdeD) || f.isSame(desdeD)) && (f.isBefore(hastaD) || f.isSame(hastaD))) {
            resultado.push(v);
          }
        }
      }
    }

    resultado.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    res.json(resultado);
  } catch (err) { next(err); }
});

// Exporta helpers para que el cron de alertas y otros consumidores los reusen.
module.exports = router;
module.exports.calcularVencimientos = calcularVencimientos;
module.exports.flattenForEmpresa = flattenForEmpresa;
