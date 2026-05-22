// Helpers para abrir/descargar archivos del backend autenticando con el JWT
// almacenado en localStorage. Se usa para PDFs y planillas Excel servidas por
// endpoints que requieren `auth` middleware.
import toast from 'react-hot-toast';

// Mismo origen configurable que el cliente axios. En prod apunta al backend
// (Railway); en dev queda vacío y el proxy de Vite resuelve /api y /uploads.
const API_ORIGIN = import.meta.env.VITE_API_URL || '';

// Prefija el origen del backend a rutas absolutas del servidor (/api, /uploads).
function withApiOrigin(url) {
  if (!API_ORIGIN) return url;
  return url.startsWith('/') ? `${API_ORIGIN}${url}` : url;
}

function appendToken(url) {
  url = withApiOrigin(url);
  const token = localStorage.getItem('token');
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

// Abre el archivo en una nueva pestaña (ideal para PDFs inline).
export function openAuthed(url) {
  window.open(appendToken(url), '_blank', 'noopener');
}

// Fuerza la descarga con un nombre de archivo concreto.
export function downloadAuthed(url, filename) {
  const a = document.createElement('a');
  a.href = appendToken(url);
  if (filename) a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Descarga vía fetch con toast de progreso. Útil para generaciones largas
 * (recibos masivos, F.931, exports grandes) — el usuario ve feedback inmediato
 * y un %/MB en vivo si el servidor envía Content-Length.
 *
 * @param {string} url       URL absoluta o relativa del recurso
 * @param {object} opts
 * @param {string} opts.filename       Nombre del archivo a guardar (opcional)
 * @param {string} opts.loadingLabel   Texto del toast mientras carga
 * @param {string} opts.successLabel   Texto al terminar
 */
export async function downloadWithProgress(url, { filename, loadingLabel = 'Generando archivo...', successLabel = 'Descarga lista' } = {}) {
  const token = localStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const toastId = toast.loading(loadingLabel);
  try {
    const resp = await fetch(withApiOrigin(url), { headers });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(txt || `Error ${resp.status}`);
    }

    const total = Number(resp.headers.get('Content-Length') || 0);

    if (total && resp.body && typeof ReadableStream !== 'undefined') {
      // Leer en stream para mostrar progreso
      const reader = resp.body.getReader();
      const chunks = [];
      let recibido = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        recibido += value.length;
        const pct = Math.round((recibido / total) * 100);
        toast.loading(`${loadingLabel} (${pct}%)`, { id: toastId });
      }
      const blob = new Blob(chunks, { type: resp.headers.get('Content-Type') || 'application/octet-stream' });
      triggerBlobDownload(blob, filename || extractFilename(resp) || 'descarga');
    } else {
      // Sin progreso — descarga completa
      const blob = await resp.blob();
      triggerBlobDownload(blob, filename || extractFilename(resp) || 'descarga');
    }
    toast.success(successLabel, { id: toastId });
  } catch (e) {
    toast.error(`Error en la descarga: ${e.message}`, { id: toastId });
    throw e;
  }
}

function extractFilename(resp) {
  const cd = resp.headers.get('Content-Disposition');
  if (!cd) return null;
  const m = cd.match(/filename="?([^";]+)"?/i);
  return m ? m[1] : null;
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
