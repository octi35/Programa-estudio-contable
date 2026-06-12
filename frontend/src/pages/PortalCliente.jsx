import React, { useEffect, useState } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import {
  PlusIcon, TrashIcon, PaperAirplaneIcon, BuildingOfficeIcon,
  ExclamationTriangleIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import { formatMoney } from '../utils/format';

// Cliente propio: portal público con token por URL, sin redirect a /login.
const portalApi = axios.create({ baseURL: '/api/portal-cliente', timeout: 30000 });

const TIPO_LABEL = {
  HORA_EXTRA: 'Horas extra',
  LICENCIA: 'Licencia / ausencia',
  VACACIONES: 'Vacaciones',
  SUSPENSION: 'Suspensión',
  ADELANTO_SUELDO: 'Adelanto de sueldo',
  DIAS_TRABAJADOS: 'Días trabajados',
  PERSONALIZADA: 'Otra novedad',
};

const CON_VALOR = ['HORA_EXTRA', 'ADELANTO_SUELDO', 'DIAS_TRABAJADOS', 'PERSONALIZADA'];

const filaVacia = () => ({
  empleadoId: '', tipo: 'HORA_EXTRA',
  fechaDesde: new Date().toISOString().slice(0, 10),
  fechaHasta: '', valor: '', descripcion: '',
});

export default function PortalCliente() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [filas, setFilas] = useState([filaVacia()]);
  const [enviando, setEnviando] = useState(false);

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

  const setFila = (i, campo, valor) =>
    setFilas(fs => fs.map((f, idx) => idx === i ? { ...f, [campo]: valor } : f));

  const enviar = async () => {
    const validas = filas.filter(f => f.empleadoId && f.tipo && f.fechaDesde);
    if (validas.length === 0) {
      toast.error('Completá al menos una fila (empleado, tipo y fecha)');
      return;
    }
    setEnviando(true);
    try {
      const r = await portalApi.post('/novedades', {
        token,
        novedades: validas.map(f => ({
          empleadoId: f.empleadoId,
          tipo: f.tipo,
          fechaDesde: f.fechaDesde,
          fechaHasta: f.fechaHasta || undefined,
          valor: f.valor !== '' ? Number(f.valor) : undefined,
          descripcion: f.descripcion || undefined,
        })),
      });
      toast.success(`${r.data.creadas} novedad(es) enviada(s) al estudio`);
      setFilas([filaVacia()]);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudieron enviar las novedades');
    } finally { setEnviando(false); }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-center" />
      <header className="bg-emerald-900 text-white px-6 py-4">
        <h1 className="text-lg font-bold">Portal del Cliente</h1>
        <p className="text-emerald-200 text-xs">Carga de novedades del mes para liquidación de sueldos</p>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        {error ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <ExclamationTriangleIcon className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">{error}</p>
          </div>
        ) : !datos ? (
          <div className="bg-white rounded-xl shadow p-10 text-center">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow p-5 flex items-center gap-3">
              <BuildingOfficeIcon className="w-8 h-8 text-emerald-700" />
              <div>
                <p className="text-xl font-bold text-gray-900">{datos.empresa.razonSocial}</p>
                <p className="text-sm text-gray-500 font-mono">CUIT {datos.empresa.cuit} · {datos.empleados.length} empleados activos</p>
              </div>
            </div>

            {/* Grilla de carga */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="font-semibold text-gray-700 text-sm">Novedades a informar</h2>
                <button onClick={() => setFilas(fs => [...fs, filaVacia()])}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900">
                  <PlusIcon className="w-4 h-4" /> Agregar fila
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left min-w-[180px]">Empleado</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Desde</th>
                      <th className="px-3 py-2 text-left">Hasta</th>
                      <th className="px-3 py-2 text-left">Cantidad / Importe</th>
                      <th className="px-3 py-2 text-left min-w-[160px]">Comentario</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filas.map((f, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={f.empleadoId}
                            onChange={e => setFila(i, 'empleadoId', e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {datos.empleados.map(e => (
                              <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}{e.legajoNumero ? ` (Leg. ${e.legajoNumero})` : ''}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={f.tipo}
                            onChange={e => setFila(i, 'tipo', e.target.value)}>
                            {datos.tiposPermitidos.map(t => <option key={t} value={t}>{TIPO_LABEL[t] || t}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="date" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={f.fechaDesde}
                            onChange={e => setFila(i, 'fechaDesde', e.target.value)} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="date" className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={f.fechaHasta}
                            onChange={e => setFila(i, 'fechaHasta', e.target.value)} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" step="0.5" placeholder={CON_VALOR.includes(f.tipo) ? 'hs / $' : '—'}
                            disabled={!CON_VALOR.includes(f.tipo)}
                            className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50"
                            value={f.valor} onChange={e => setFila(i, 'valor', e.target.value)} />
                        </td>
                        <td className="px-3 py-2">
                          <input className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="Opcional"
                            value={f.descripcion} onChange={e => setFila(i, 'descripcion', e.target.value)} />
                        </td>
                        <td className="px-2">
                          {filas.length > 1 && (
                            <button onClick={() => setFilas(fs => fs.filter((_, idx) => idx !== i))}
                              className="text-red-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t bg-gray-50 flex justify-end">
                <button onClick={enviar} disabled={enviando}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                  <PaperAirplaneIcon className="w-4 h-4" />
                  {enviando ? 'Enviando...' : 'Enviar al estudio'}
                </button>
              </div>
            </div>

            {/* Historial */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-700 text-sm">Enviadas recientemente ({datos.novedades.length})</h2>
              </div>
              {datos.novedades.length === 0 ? (
                <p className="p-6 text-center text-gray-400 text-sm">Todavía no enviaste novedades por el portal.</p>
              ) : (
                <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {datos.novedades.map(n => (
                    <li key={n.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-800">
                          {n.empleado.apellido}, {n.empleado.nombre}
                          <span className="ml-2 text-[10px] uppercase tracking-wide bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                            {TIPO_LABEL[n.tipo] || n.tipo}
                          </span>
                        </p>
                        <p className="text-xs text-gray-400">{n.descripcion.replace('[Portal cliente] ', '')}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>{new Date(n.fechaDesde).toLocaleDateString('es-AR')}{n.fechaHasta && ` → ${new Date(n.fechaHasta).toLocaleDateString('es-AR')}`}</p>
                        {n.valor != null && <p className="font-semibold text-gray-700">{Number(n.valor) >= 1000 ? formatMoney(n.valor) : Number(n.valor)}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-center text-xs text-gray-400">
              Las novedades llegan directo al estudio y se consideran en la próxima liquidación. Ante dudas, contactá a tu contador.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
