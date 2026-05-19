// Tests del middleware de autenticación con cookie / header / query.
jest.mock('../../src/lib/prisma', () => ({
  usuario: { findUnique: jest.fn() },
}));

const jwt = require('jsonwebtoken');
const prisma = require('../../src/lib/prisma');
const { auth, requireRol } = require('../../src/middleware/auth');

const USUARIO_DEMO = {
  id: 'u-1', email: 'a@b.com', nombre: 'Admin', rol: 'ADMIN', activo: true, estudioId: 'est-1',
};

function makeReq({ headers = {}, cookies = {}, query = {} } = {}) {
  return { headers, cookies, query };
}
function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.usuario.findUnique.mockResolvedValue(USUARIO_DEMO);
});

describe('auth middleware', () => {
  test('rechaza request sin token', async () => {
    const res = makeRes();
    await auth(makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('acepta token via header Authorization Bearer', async () => {
    const token = jwt.sign({ id: USUARIO_DEMO.id }, process.env.JWT_SECRET);
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();
    await auth(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.usuario).toEqual(USUARIO_DEMO);
  });

  test('acepta token via cookie auth_token (precedencia sobre header)', async () => {
    const tokenCookie = jwt.sign({ id: USUARIO_DEMO.id }, process.env.JWT_SECRET);
    const tokenHeader = jwt.sign({ id: 'otro' }, process.env.JWT_SECRET);
    const req = makeReq({
      cookies: { auth_token: tokenCookie },
      headers: { authorization: `Bearer ${tokenHeader}` },
    });
    const next = jest.fn();
    await auth(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
    // Verifica que se usó la cookie (debería buscar por USUARIO_DEMO.id)
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USUARIO_DEMO.id } }),
    );
  });

  test('acepta token via query ?token=', async () => {
    const token = jwt.sign({ id: USUARIO_DEMO.id }, process.env.JWT_SECRET);
    const req = makeReq({ query: { token } });
    const next = jest.fn();
    await auth(req, makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('rechaza usuario inactivo', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ ...USUARIO_DEMO, activo: false });
    const token = jwt.sign({ id: USUARIO_DEMO.id }, process.env.JWT_SECRET);
    const res = makeRes();
    await auth(makeReq({ headers: { authorization: `Bearer ${token}` } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rechaza token expirado', async () => {
    const token = jwt.sign({ id: USUARIO_DEMO.id }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();
    await auth(req, makeRes(), next);
    // next() se llama con el error JWT
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('requireRol', () => {
  test('permite si el rol coincide', () => {
    const next = jest.fn();
    const res = makeRes();
    requireRol('ADMIN', 'CONTADOR')({ usuario: { rol: 'ADMIN' } }, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rechaza si el rol no está en la lista', () => {
    const res = makeRes();
    requireRol('ADMIN')({ usuario: { rol: 'OPERADOR' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
