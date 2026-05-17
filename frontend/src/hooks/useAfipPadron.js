import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';

/**
 * Hook reusable para autocompletar formularios desde el padrón AFIP A13.
 *
 * Uso:
 *   const { consultar, loading } = useAfipPadron();
 *   ...
 *   <input onBlur={e => consultar(e.target.value).then(d => {
 *     if (d) setValue('razonSocial', d.razonSocial);
 *   })} />
 */
export function useAfipPadron() {
  const [loading, setLoading] = useState(false);
  const ultimoCuit = useRef(null);
  const cache = useRef({}); // CUIT → datos (evita re-consulta)

  const consultar = async (cuitRaw, { silent = false } = {}) => {
    const cuit = String(cuitRaw || '').replace(/[-\s]/g, '');
    if (!/^\d{11}$/.test(cuit)) return null;
    if (ultimoCuit.current === cuit && cache.current[cuit]) return cache.current[cuit];

    setLoading(true);
    ultimoCuit.current = cuit;
    const toastId = silent ? null : toast.loading('Consultando padrón AFIP...');
    try {
      const r = await api.get(`/afip/padron/${cuit}`, { silent: true });
      const datos = r.data?.datos;
      if (datos) {
        cache.current[cuit] = datos;
        if (toastId) toast.success(`✓ ${datos.razonSocial}`, { id: toastId, duration: 2500 });
        return datos;
      }
      if (toastId) toast.dismiss(toastId);
      return null;
    } catch (e) {
      const msg = e.response?.data?.error || 'No se pudo consultar el padrón AFIP';
      if (toastId) toast.error(msg, { id: toastId, duration: 3500 });
      return null;
    } finally { setLoading(false); }
  };

  return { consultar, loading };
}
