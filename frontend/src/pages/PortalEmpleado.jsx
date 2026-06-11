import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import {
  DocumentArrowDownIcon, CheckBadgeIcon, BuildingOfficeIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { formatMoney, mesNombre } from '../utils/format';

// Cliente propio: el portal es público (token por URL) y no debe
// redirigir a /login del estudio ante un 401.
const portalApi = axios.create({ baseURL: '/api/portal', timeout: 30000 });

const TIPO_LABEL = {
  MENSUAL: 'Mensual', SAC_JUNIO: 'SAC 1° sem.', SAC_DICIEMBRE: 'SAC 2° sem.',
  VACACIONES: 'Vacaciones', LIQUIDACION_FINAL: 'Liq. final', COMPLEMENTO: 'Complemento', RETROACTIVO: 'Retroactivo',
};

export default function PortalEmpleado() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [firmando, setFirmando] = useState(null);

  const cargar = async () => {
    try {
      const r = await portalApi.get('/mis-datos', { params: { token } });
      setDatos(r.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo acceder al portal');
    }
  };

  useEffect(() => {
    if (!token) setError('Falta el link de acceso. Pedile al estudio que te genere uno nuevo.');
    else cargar();
  }, []);

  const descargar = (recibo) => {
    window.open(`/api/portal/recibo/${recibo.id}?token=${token}`, '_blank');
  };

  const firmar = async (recibo) => {
    setFirmando(recibo.id);
    try {
      await portalApi.post(`/recibo/${recibo.id}/conformidad`, { token });
      toast.success('Recibo firmado en conformidad');
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo firmar');
    } finally { setFirmando(null); }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-center" />
      <header className="bg-blue-900 text-white px-6 py-4">
        <h1 className="text-lg font-bold">Portal del Empleado</h1>
        <p className="text-blue-200 text-xs">Recibos de sueldo · firma de conformidad</p>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        {error ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <ExclamationTriangleIcon className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">{error}</p>
          </div>
        ) : !datos ? (
          <div className="bg-white rounded-xl shadow p-10 text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <>
            {/* Identidad */}
            <div className="bg-white rounded-xl shadow p-5 flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-xl font-bold text-gray-900">{datos.empleado.apellido}, {datos.empleado.nombre}</p>
                <p className="text-sm text-gray-500 font-mono">CUIL {datos.empleado.cuil}
                  {datos.empleado.legajoNumero && ` · Legajo ${datos.empleado.legajoNumero}`}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1 justify-end">
                  <BuildingOfficeIcon className="w-4 h-4 text-gray-400" /> {datos.empleado.empresa.razonSocial}
                </p>
                <p className="text-xs text-gray-400 font-mono">CUIT {datos.empleado.empresa.cuit}</p>
              </div>
            </div>

            {/* Recibos */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50">
                <h2 className="font-semibold text-gray-700 text-sm">Mis recibos ({datos.recibos.length})</h2>
              </div>
              {datos.recibos.length === 0 ? (
                <p className="p-8 text-center text-gray-400 text-sm">Todavía no hay recibos confirmados.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {datos.recibos.map(r => (
                    <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium text-gray-900">
                          {mesNombre(r.mes)} {r.anio}
                          <span className="ml-2 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                            {TIPO_LABEL[r.tipo] || r.tipo}
                          </span>
                        </p>
                        <p className="text-sm text-gray-500">Neto: <span className="font-semibold text-gray-800">{formatMoney(r.totalNeto)}</span></p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.conformidadFecha ? (
                          <span className="flex items-center gap-1 text-green-700 text-xs font-medium bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-lg">
                            <CheckBadgeIcon className="w-4 h-4" />
                            Firmado {new Date(r.conformidadFecha).toLocaleDateString('es-AR')}
                          </span>
                        ) : (
                          <button onClick={() => firmar(r)} disabled={firmando === r.id}
                            className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                            {firmando === r.id ? 'Firmando...' : 'Firmar conformidad'}
                          </button>
                        )}
                        <button onClick={() => descargar(r)}
                          className="flex items-center gap-1 text-xs font-medium border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg">
                          <DocumentArrowDownIcon className="w-4 h-4" /> PDF
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-center text-xs text-gray-400">
              La firma de conformidad registra fecha, hora e IP. Si un recibo no coincide con lo percibido, contactá al estudio antes de firmar.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
