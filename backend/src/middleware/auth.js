const prisma = require('../lib/prisma');
const jwt = require('jsonwebtoken');


async function auth(req, res, next) {
  // Prioridad de lectura del token:
  //   1) cookie httpOnly `auth_token` (seguro: no expuesto a JS / XSS)
  //   2) header Authorization: Bearer ... (clientes API / compat)
  //   3) query ?token=... (legacy fallback para window.open() de descargas;
  //      ahora preferentemente reemplazado por la cookie, que viaja sola)
  let token = null;

  if (req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = String(req.query.token);
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, nombre: true, rol: true, activo: true, estudioId: true },
    });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario no autorizado' });
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: 'Sin permisos para esta acción' });
    }
    next();
  };
}

module.exports = { auth, requireRol };
