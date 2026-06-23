// Regresión de aislamiento multi-tenant (IDOR cross-tenant).
// Verifica que los listados que aceptan ?empresaId / ?empleadoId SIEMPRE
// anclan el scope del estudio del usuario autenticado, aunque el id pedido
// sea de otro estudio.

const express = require('express');
const request = require('supertest');

// Mock de prisma: capturamos el `where` que recibe cada findMany.
jest.mock('../../src/lib/prisma', () => ({
  empleado: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  ausentismo: { findMany: jest.fn().mockResolvedValue([]) },
}));

// Mock del middleware de auth: inyecta un usuario del estudio "EST-PROPIO".
jest.mock('../../src/middleware/auth', () => ({
  auth: (req, _res, next) => {
    req.usuario = { id: 'u-1', rol: 'ADMIN', estudioId: 'EST-PROPIO' };
    next();
  },
  requireRol: () => (_req, _res, next) => next(),
}));

const prisma = require('../../src/lib/prisma');
const empleadosRouter = require('../../src/routes/empleados');
const ausentismosRouter = require('../../src/routes/ausentismos');

function appCon(path, router) {
  const app = express();
  app.use(express.json());
  app.use(path, router);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('Aislamiento multi-tenant en listados', () => {
  test('GET /empleados?empresaId=ajena mantiene el scope de estudio', async () => {
    const app = appCon('/empleados', empleadosRouter);
    await request(app).get('/empleados?empresaId=EMPRESA-DE-OTRO-ESTUDIO').expect(200);

    expect(prisma.empleado.findMany).toHaveBeenCalledTimes(1);
    const { where } = prisma.empleado.findMany.mock.calls[0][0];
    expect(where.empresa).toEqual({ estudioId: 'EST-PROPIO' });
    expect(where.empresaId).toBe('EMPRESA-DE-OTRO-ESTUDIO');
  });

  test('GET /empleados sin empresaId scopea por estudio', async () => {
    const app = appCon('/empleados', empleadosRouter);
    await request(app).get('/empleados').expect(200);

    const { where } = prisma.empleado.findMany.mock.calls[0][0];
    expect(where.empresa).toEqual({ estudioId: 'EST-PROPIO' });
  });

  test('GET /ausentismos?empleadoId=ajeno mantiene el scope de estudio', async () => {
    const app = appCon('/ausentismos', ausentismosRouter);
    await request(app).get('/ausentismos?empleadoId=EMP-DE-OTRO-ESTUDIO').expect(200);

    const { where } = prisma.ausentismo.findMany.mock.calls[0][0];
    expect(where.empleado).toEqual({ empresa: { estudioId: 'EST-PROPIO' } });
    expect(where.empleadoId).toBe('EMP-DE-OTRO-ESTUDIO');
  });

  test('GET /ausentismos?empresaId=ajena mantiene el scope de estudio', async () => {
    const app = appCon('/ausentismos', ausentismosRouter);
    await request(app).get('/ausentismos?empresaId=EMPRESA-DE-OTRO-ESTUDIO').expect(200);

    const { where } = prisma.ausentismo.findMany.mock.calls[0][0];
    expect(where.empleado).toEqual({ empresa: { estudioId: 'EST-PROPIO' }, empresaId: 'EMPRESA-DE-OTRO-ESTUDIO' });
  });
});
