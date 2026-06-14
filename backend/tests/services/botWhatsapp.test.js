// Tests de la máquina de estados del bot de WhatsApp.
// Prisma se mockea con un store en memoria para `sesiones_whatsapp`, de modo que
// el estado conversacional persista entre llamadas a procesar() (como en prod).

jest.mock('../../src/lib/prisma', () => {
  const sesiones = new Map();
  const key = (e, t) => `${e}|${t}`;
  return {
    __sesiones: sesiones,
    sesionWhatsapp: {
      findUnique: jest.fn(async ({ where }) => {
        const w = where.estudioId_telefono;
        return sesiones.get(key(w.estudioId, w.telefono)) || null;
      }),
      create: jest.fn(async ({ data }) => {
        const s = { id: 's1', rol: 'DESCONOCIDO', estado: 'INICIO', contexto: {}, empleadoId: null, pushName: null, ...data };
        sesiones.set(key(data.estudioId, data.telefono), s);
        return s;
      }),
      update: jest.fn(async ({ where, data }) => {
        let found;
        for (const s of sesiones.values()) if (s.id === where.id) found = s;
        Object.assign(found, data);
        return found;
      }),
    },
    empleado: { findMany: jest.fn(async () => []), findUnique: jest.fn() },
    empresa: { findFirst: jest.fn() },
    estudio: { findFirst: jest.fn() },
    liquidacion: { findFirst: jest.fn() },
    comprobanteElectronico: { findUnique: jest.fn(async () => null) },
  };
});

jest.mock('../../src/services/afip/afipFacturacionService', () => ({
  facturarMasivo: jest.fn(),
}));
jest.mock('../../src/services/pdfService', () => ({
  generarRecibo: jest.fn(async () => Buffer.from('PDF')),
  generarComprobanteElectronico: jest.fn(async () => Buffer.from('PDF')),
}));

const prisma = require('../../src/lib/prisma');
const { facturarMasivo } = require('../../src/services/afip/afipFacturacionService');
const bot = require('../../src/services/whatsapp/botService');

const estudio = { id: 'est-1', telefono: null, waOperadores: '5493513453579', afipAmbiente: 'SIMULADO' };

beforeEach(() => {
  prisma.__sesiones.clear();
  jest.clearAllMocks();
  prisma.empleado.findMany.mockResolvedValue([]);
});

describe('diasVacaciones (LCT art. 150)', () => {
  const haceAnios = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setMonth(0, 15); return d; };
  test('menos de 5 años → 14 días', () => expect(bot.diasVacaciones(haceAnios(3)).dias).toBe(14));
  test('5 a 10 años → 21 días', () => expect(bot.diasVacaciones(haceAnios(7)).dias).toBe(21));
  test('10 a 20 años → 28 días', () => expect(bot.diasVacaciones(haceAnios(15)).dias).toBe(28));
  test('más de 20 años → 35 días', () => expect(bot.diasVacaciones(haceAnios(25)).dias).toBe(35));
  test('menos de 6 meses → proporcional', () => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    const v = bot.diasVacaciones(d);
    expect(v.proporcional).toBe(true);
  });
});

describe('mismoNumero', () => {
  test('matchea por últimos 10 dígitos (ignora +54 y 9)', () => {
    expect(bot.mismoNumero('+54 9 3513 45-3579', '5493513453579')).toBe(true);
    expect(bot.mismoNumero('3513453579', '543513453579')).toBe(true);
    expect(bot.mismoNumero('3513453579', '3513453570')).toBe(false);
  });
});

describe('remitente desconocido', () => {
  test('responde que el número no está registrado', async () => {
    const { replies } = await bot.procesar({ estudio, telefono: '5491111111111', texto: 'hola' });
    expect(replies).toHaveLength(1);
    expect(replies[0].texto).toMatch(/no figura/i);
  });
});

describe('empleado', () => {
  // Estudio sin operadores: así el número se identifica como empleado.
  const estudioEmp = { id: 'est-1', telefono: null, waOperadores: '', afipAmbiente: 'SIMULADO' };
  const telEmp = '5493514440001';

  beforeEach(() => {
    prisma.empleado.findMany.mockResolvedValue([{ id: 'emp-1', telefono: '351 444 0001' }]);
  });

  test('saluda con el menú de empleado', async () => {
    const { replies } = await bot.procesar({ estudio: estudioEmp, telefono: telEmp, texto: 'hola', pushName: 'Juan' });
    expect(replies[0].texto).toMatch(/Recibo/);
    expect(replies[0].texto).toMatch(/Vacaciones/);
  });

  test('opción vacaciones devuelve los días', async () => {
    const ingreso = new Date(); ingreso.setFullYear(ingreso.getFullYear() - 7);
    prisma.empleado.findUnique.mockResolvedValue({ id: 'emp-1', fechaIngreso: ingreso });
    await bot.procesar({ estudio: estudioEmp, telefono: telEmp, texto: 'hola' });
    const { replies } = await bot.procesar({ estudio: estudioEmp, telefono: telEmp, texto: 'vacaciones' });
    expect(replies[0].texto).toMatch(/21 días/);
  });

  test('opción recibo envía el PDF del último recibo', async () => {
    prisma.liquidacion.findFirst.mockResolvedValue({
      id: 'liq-1', totalNeto: 913000, periodo: { anio: 2026, mes: 5 },
      empleado: {}, detalles: [],
    });
    await bot.procesar({ estudio: estudioEmp, telefono: telEmp, texto: 'hola' });
    const { replies } = await bot.procesar({ estudio: estudioEmp, telefono: telEmp, texto: 'recibo' });
    expect(replies[0].tipo).toBe('media');
    expect(replies[0].fileName).toMatch(/recibo_2026_05\.pdf/);
  });
});

describe('operador — flujo de facturación', () => {
  const tel = '5493513453579';

  test('CUIT → monto → concepto → confirmación → emite', async () => {
    // arranque
    let r = await bot.procesar({ estudio, telefono: tel, texto: 'facturar' });
    expect(r.replies[0].texto).toMatch(/CUIT/);

    // CUIT de un cliente existente
    prisma.empresa.findFirst.mockResolvedValue({ id: 'cli-1', razonSocial: 'ACME SRL', cuit: '30-71234567-8' });
    r = await bot.procesar({ estudio, telefono: tel, texto: '30-71234567-8' });
    expect(r.replies[0].texto).toMatch(/ACME SRL/);
    expect(r.replies[0].texto).toMatch(/importe neto/i);

    // monto neto → calcula IVA 21%
    r = await bot.procesar({ estudio, telefono: tel, texto: '150000' });
    expect(r.replies[0].texto).toMatch(/IVA 21%/);
    expect(r.replies[0].texto).toMatch(/181\.500,00/); // total con IVA

    // concepto
    r = await bot.procesar({ estudio, telefono: tel, texto: 'Honorarios mayo 2026' });
    expect(r.replies[0].texto).toMatch(/Confirmá/);

    // confirmación → factura
    facturarMasivo.mockResolvedValue({
      exitosos: [{ comprobanteId: 'ce-1', cae: '7500000012345', nro: '00001-00000042', tipo: 'FACTURA_B', total: 181500 }],
      errores: [],
    });
    r = await bot.procesar({ estudio, telefono: tel, texto: 'sí' });
    expect(facturarMasivo).toHaveBeenCalledTimes(1);
    expect(r.replies[0].texto).toMatch(/Factura emitida/);
    expect(r.replies[0].texto).toMatch(/7500000012345/);
  });

  test('CUIT inexistente avisa y no avanza', async () => {
    await bot.procesar({ estudio, telefono: tel, texto: 'facturar' });
    prisma.empresa.findFirst.mockResolvedValue(null);
    const r = await bot.procesar({ estudio, telefono: tel, texto: '30-99999999-9' });
    expect(r.replies[0].texto).toMatch(/No encontré un cliente/);
  });

  test('cancelar resetea el flujo', async () => {
    await bot.procesar({ estudio, telefono: tel, texto: 'facturar' });
    const r = await bot.procesar({ estudio, telefono: tel, texto: 'cancelar' });
    expect(r.replies[0].texto).toMatch(/Facturar/);
  });
});
