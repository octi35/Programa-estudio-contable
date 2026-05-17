require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting — global generoso para uso normal del panel
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intente más tarde' },
  // En desarrollo es común recargar mucho — no bloquear al usuario local.
  skip: (req) => process.env.NODE_ENV !== 'production',
});

// Rate limit específico (más estricto) sólo para login para mitigar brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espere unos minutos.' },
  skipSuccessfulRequests: true,
});

// Rate limit estricto para forgot-password (evita abuso de envío de emails)
const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de recuperación. Esperá una hora.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotLimiter);
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Mini parser de cookies (evita dependencia cookie-parser para una sola cookie)
app.use((req, _res, next) => {
  const header = req.headers.cookie;
  if (!header) { req.cookies = {}; return next(); }
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  req.cookies = out;
  next();
});

// Logging
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads')));

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 Servidor corriendo en puerto ${PORT}`);
  logger.info(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// ── Cron job: sincronización diaria de tipos de cambio ─────────────────────
// Corre cada 24h una vez arrancado el servidor, y una primera vez 30s después
// del boot para tener cotizaciones recientes en cada estudio.
const cambiosModule = require('./routes/cambios');
const DIA_MS = 24 * 60 * 60 * 1000;

async function ejecutarCronCambios(motivo = 'periódico') {
  try {
    if (typeof cambiosModule.ejecutarSyncCron !== 'function') return;
    const out = await cambiosModule.ejecutarSyncCron();
    const okCount = out.filter(o => o.ok).length;
    const cambios = out.filter(o => o.ok).reduce((s, o) => s + (o.cambios || 0), 0);
    logger.info(`[CronCambios:${motivo}] estudios=${out.length} ok=${okCount} actualizaciones=${cambios}`);
  } catch (err) {
    logger.error?.(`[CronCambios:${motivo}] error: ${err.message}`) ||
      console.error(`[CronCambios:${motivo}] error: ${err.message}`);
  }
}

if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => ejecutarCronCambios('inicio'), 30 * 1000);
  setInterval(() => ejecutarCronCambios('diario'), DIA_MS);
}

// ── Cron alertas de vencimientos ───────────────────────────────────────────
// Tickea cada hora; sólo dispara entre 8:00 y 8:59 horario del server.
// El propio cron es idempotente (1 vez por día por estudio via LogAccion).
const { ejecutarCronAlertas } = require('./services/cronAlertas');
const HORA_ALERTAS = parseInt(process.env.HORA_ALERTAS_VENCIMIENTOS || '8', 10);

async function tickAlertas() {
  try {
    const ahora = new Date();
    if (ahora.getHours() !== HORA_ALERTAS) return;
    const resumen = await ejecutarCronAlertas();
    const enviados = resumen.reduce((s, r) => s + (r.enviados || 0), 0);
    const vencs = resumen.reduce((s, r) => s + (r.vencimientos || 0), 0);
    logger.info(`[CronAlertas] estudios=${resumen.length} vencimientos=${vencs} emails=${enviados}`);
  } catch (err) {
    logger.error?.(`[CronAlertas] error: ${err.message}`) || console.error('[CronAlertas]', err.message);
  }
}

if (process.env.NODE_ENV !== 'test') {
  // Chequea inmediatamente por si arrancamos en la franja horaria
  setTimeout(tickAlertas, 60 * 1000);
  // Y después cada hora
  setInterval(tickAlertas, 60 * 60 * 1000);
}

// ── Cron cierre automático de períodos ─────────────────────────────────────
// Corre 1 vez al día a las 3am. Cierra períodos con 100% de liquidaciones
// CONFIRMADAS y >= N días desde su creación. Genera F.931 automáticamente.
const { ejecutarCierreAutomatico } = require('./services/cronCierreAutomatico');
const HORA_CIERRE_AUTO = parseInt(process.env.HORA_CIERRE_AUTOMATICO || '3', 10);
let cierreAutoYaCorrioHoy = false;

async function tickCierreAuto() {
  try {
    const ahora = new Date();
    if (ahora.getHours() !== HORA_CIERRE_AUTO) { cierreAutoYaCorrioHoy = false; return; }
    if (cierreAutoYaCorrioHoy) return;
    cierreAutoYaCorrioHoy = true;
    const resumen = await ejecutarCierreAutomatico();
    const cerrados = resumen.reduce((s, r) => s + (r.cerrados || 0), 0);
    logger.info(`[CronCierreAuto] estudios=${resumen.length} cerrados=${cerrados}`);
  } catch (err) {
    logger.error?.(`[CronCierreAuto] error: ${err.message}`) || console.error('[CronCierreAuto]', err.message);
  }
}

if (process.env.NODE_ENV !== 'test') {
  setTimeout(tickCierreAuto, 90 * 1000);
  setInterval(tickCierreAuto, 60 * 60 * 1000);
}

module.exports = app;
