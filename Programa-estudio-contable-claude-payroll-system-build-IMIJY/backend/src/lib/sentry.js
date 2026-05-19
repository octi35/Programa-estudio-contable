// Wrapper de Sentry — opt-in. Si SENTRY_DSN no está configurado, todas las
// funciones son no-op y no rompe nada.

let Sentry = null;
let enabled = false;

function init(app) {
  if (!process.env.SENTRY_DSN) return;
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      // No enviar PII por default (CUITs, emails, etc.)
      sendDefaultPii: false,
      beforeSend(event, hint) {
        // Filtrar errores conocidos que no aportan valor en producción
        const message = event.exception?.values?.[0]?.value || '';
        if (message.includes('ECONNRESET') || message.includes('aborted')) return null;
        return event;
      },
    });
    // Sentry v8+ instala los handlers automáticamente al hacer init
    enabled = true;
    // Si la versión es v7 o anterior, requiere setup explícito de handlers
    if (app && Sentry.Handlers?.requestHandler) {
      app.use(Sentry.Handlers.requestHandler());
    }
  } catch (err) {
    console.warn('[Sentry] no se pudo inicializar:', err.message);
  }
}

function setupErrorHandler(app) {
  if (!enabled || !app) return;
  // v8+: setupExpressErrorHandler. v7 y anteriores: Sentry.Handlers.errorHandler
  if (typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
  } else if (Sentry.Handlers?.errorHandler) {
    app.use(Sentry.Handlers.errorHandler());
  }
}

function captureException(err, context = {}) {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(err);
    });
  } catch (_) { /* no-op si Sentry falla */ }
}

function captureMessage(msg, level = 'info') {
  if (!enabled) return;
  try { Sentry.captureMessage(msg, level); } catch (_) {}
}

function setUserContext(user) {
  if (!enabled || !user) return;
  try {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      rol: user.rol,
      estudioId: user.estudioId,
    });
  } catch (_) {}
}

function clearUserContext() {
  if (!enabled) return;
  try { Sentry.setUser(null); } catch (_) {}
}

module.exports = {
  init,
  setupErrorHandler,
  captureException,
  captureMessage,
  setUserContext,
  clearUserContext,
  get enabled() { return enabled; },
};
