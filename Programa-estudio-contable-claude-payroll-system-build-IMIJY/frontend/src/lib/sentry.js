// Wrapper de Sentry para frontend. Opt-in: si VITE_SENTRY_DSN no está,
// todas las funciones son no-op (no se hace siquiera el setup).

import * as Sentry from '@sentry/react';

let enabled = false;

export function init() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // Ignorar errores conocidos sin valor
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'NetworkError',
      ],
      // Limpiar URLs / data sensible antes de enviar
      beforeSend(event) {
        if (event.request?.url) {
          event.request.url = event.request.url.replace(/([?&])token=[^&]+/g, '$1token=REDACTED');
        }
        return event;
      },
    });
    enabled = true;
  } catch (err) {
    console.warn('[Sentry] no se pudo inicializar:', err.message);
  }
}

export function captureException(err, context = {}) {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(err);
    });
  } catch (_) {}
}

export function setUser(user) {
  if (!enabled || !user) return;
  try {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      rol: user.rol,
      estudioId: user.estudio?.id,
    });
  } catch (_) {}
}

export function clearUser() {
  if (!enabled) return;
  try { Sentry.setUser(null); } catch (_) {}
}

export const isEnabled = () => enabled;
