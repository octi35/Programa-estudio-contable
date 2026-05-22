import axios from 'axios';
import toast from 'react-hot-toast';

// En producción (Vercel) el backend vive en otro dominio (Railway). Se define
// VITE_API_URL = https://tu-backend.up.railway.app y todas las llamadas usan ese
// origen. En desarrollo queda vacío y se usa el proxy de Vite (/api → :3001).
const API_ORIGIN = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  timeout: 30000,
  withCredentials: true, // envía cookie httpOnly auth_token automáticamente
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function extractMessage(err) {
  const data = err.response?.data;
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (data.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
  if (data.message) return data.message;
  if (Array.isArray(data.details)) {
    return data.details.map(d => d.message || d.path?.join('.') || String(d)).filter(Boolean).join(' • ');
  }
  if (Array.isArray(data.errors)) {
    return data.errors.map(e => e.message || String(e)).filter(Boolean).join(' • ');
  }
  return null;
}

function showError(msg) {
  if (!msg) return;
  // id por mensaje → react-hot-toast deduplica
  toast.error(msg, { id: `err:${msg}` });
}

api.interceptors.response.use(
  res => res,
  err => {
    // Permite a la página silenciar el toast del interceptor:
    //   api.get('/x', { silent: true })
    const silent = err.config?.silent === true;
    const status = err.response?.status;
    const msg = extractMessage(err);

    if (silent) return Promise.reject(err);

    // Error de red / timeout / servidor caído
    if (!err.response) {
      if (err.code === 'ECONNABORTED') {
        showError('El servidor tardó demasiado en responder. Reintentá.');
      } else if (err.message === 'Network Error') {
        showError('Sin conexión con el servidor.');
      } else {
        showError(err.message || 'Error de red');
      }
      return Promise.reject(err);
    }

    if (status === 401) {
      // No mostramos toast — redirigimos al login
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    } else if (status === 403) {
      showError(msg || 'No tenés permisos para esta acción');
    } else if (status === 404) {
      // No-op: cada página decide cómo manejar 404
    } else if (status === 409) {
      showError(msg || 'Conflicto con el estado actual del recurso');
    } else if (status === 422 || status === 400) {
      showError(msg || 'Datos inválidos. Revisá el formulario.');
    } else if (status === 429) {
      showError(msg || 'Demasiadas solicitudes. Esperá un momento.');
    } else if (status >= 500) {
      showError(msg || 'Error del servidor. Intente nuevamente.');
    } else {
      showError(msg || `Error ${status}`);
    }
    return Promise.reject(err);
  }
);

export default api;
