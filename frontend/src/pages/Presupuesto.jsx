import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { formatMoney, MESES } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, CheckIcon } from '@heroicons/react/24/outline';

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

function desvColor(desv) {
  if (desv === null || desv === undefined) return '';
  if (desv > 10) return 'text-red-600 font-semibold';
  if (desv > 0) return 'text-orange-500';
  return 'text-green-600';
}

export default function Presupuesto() {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [presupuesto, setPresupuesto] = useState(null);
  const [items, setItems] = useState([]);
  const [comparativo, setComparativo] = useState([]);
  const [tab, setTab] = useState('edicion');
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setEmpresaId(data.data[0].id);
    }).catch(() => {});
  }, []);

  const fetchPresupuesto = useCallback(async () => {
    if (!empresaId || !anio) return;
    setLoading(true);
    try {
      const { data } = await api.get('/presupuesto', { params: { empresaId, anio } });
      setPresupuesto(data || null);
      setItems(data?.items || []);
    } catch {
      setPresupuesto(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId, anio]);

  const fetchComparativo = useCallback(async () => {
    if (!presupuesto?.id) return;
    try {
      const { data } = await api.get(`/presupuesto/${presupuesto.id}/comparativo`);
      setComparativo(data || []);
    } catch {}
  }, [presupuesto?.id]);

  useEffect(() => { fetchPresupuesto(); }, [fetchPresupuesto]);
  useEffect(() => { if (tab === 'comparativo') fetchComparativo(); }, [tab, fetchComparativo]);

  const handleCrear = async () => {
    setCreando(true);
    try {
      const { data } = await api.post('/presupuesto', { empresaId, anio });
      setPresupuesto(data);
      setItems(data.items || []);
      toast.success('Presupuesto creado');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al crear presupuesto');
    } finally {
      setCreando(false);
    }
  };

  const handleCeldaChange = (itemIdx, mes, valor) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== itemIdx) return item;
      const valores = [...(item.valores || Array(12).fill(0))];
      valores[mes - 1] = parseFloat(valor) || 0;
      return { ...item, valores };
    }));
  };

  const handleGuardar = async () => {
    if (!presupuesto?.id) return;
    setGuardando(true);
    try {
      await api.put(`/presupuesto/${presupuesto.id}/items`, { items });
      toast.success('Presupuesto guardado');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const totalesPorMes = (mes) =>
    items.reduce((s, item) => s + (parseFloat(item.valores?.[mes - 1]) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Presupuesto Contable</h1>
        {presupuesto && tab === 'edicion' && (
          <button onClick={handleGuardar} disabled={guardando}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            <CheckIcon className="w-4 h-4" />
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <input type="number" value={anio} onChange={e => setAnio(parseInt(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm w-24" placeholder="Año" />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">Cargando...</div>
      ) : !presupuesto ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <p className="text-gray-500 mb-4">No hay presupuesto para {empresas.find(e => e.id === empresaId)?.razonSocial} en {anio}</p>
          <button onClick={handleCrear} disabled={creando || !empresaId}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 mx-auto">
            <PlusIcon className="w-5 h-5" />
            {creando ? 'Creando...' : `Crear presupuesto ${anio}`}
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b">
            {[{ key: 'edicion', label: 'Edicion' }, { key: 'comparativo', label: 'Comparativo Real vs Presupuesto' }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'edicion' && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 min-w-[180px] sticky left-0 bg-gray-50">Cuenta</th>
                      {MESES.map((m, i) => (
                        <th key={i} className="px-2 py-3 text-right font-medium text-gray-600 min-w-[100px]">{m.substring(0, 3)}</th>
                      ))}
                      <th className="px-4 py-3 text-right font-medium text-gray-600 min-w-[110px]">Total anual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const totalAnual = (item.valores || []).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                      return (
                        <tr key={item.id || idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-800 sticky left-0 bg-white">{item.cuenta || item.descripcion}</td>
                          {MESES.map((_, i) => (
                            <td key={i} className="px-1 py-1">
                              <input
                                type="number"
                                step="0.01"
                                value={item.valores?.[i] ?? 0}
                                onChange={e => handleCeldaChange(idx, i + 1, e.target.value)}
                                className="w-full border rounded px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                          ))}
                          <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatMoney(totalAnual)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot className="bg-gray-50 border-t font-semibold text-xs">
                      <tr>
                        <td className="px-4 py-3 sticky left-0 bg-gray-50">Totales</td>
                        {MESES.map((_, i) => (
                          <td key={i} className="px-2 py-3 text-right">{formatMoney(totalesPorMes(i + 1))}</td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          {formatMoney(items.reduce((s, item) => s + (item.valores || []).reduce((a, v) => a + (parseFloat(v) || 0), 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
                {items.length === 0 && (
                  <div className="p-8 text-center text-gray-400">Sin cuentas en el presupuesto</div>
                )}
              </div>
            </div>
          )}

          {tab === 'comparativo' && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 min-w-[180px] sticky left-0 bg-gray-50">Cuenta</th>
                      {MESES.map((m, i) => (
                        <th key={i} colSpan={3} className="px-2 py-3 text-center font-medium text-gray-600 border-l">
                          {m.substring(0, 3)}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className="px-4 py-2 sticky left-0 bg-gray-50" />
                      {MESES.map((_, i) => (
                        <React.Fragment key={i}>
                          <th className="px-1 py-2 text-right text-gray-500 border-l">Presup.</th>
                          <th className="px-1 py-2 text-right text-gray-500">Real</th>
                          <th className="px-1 py-2 text-right text-gray-500">Desv.%</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {comparativo.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800 sticky left-0 bg-white">{item.cuenta}</td>
                        {MESES.map((_, i) => {
                          const presup = item.presupuesto?.[i] || 0;
                          const real = item.real?.[i] || 0;
                          const desv = presup > 0 ? ((real - presup) / presup * 100) : null;
                          return (
                            <React.Fragment key={i}>
                              <td className="px-1 py-2 text-right text-gray-600 border-l">{formatMoney(presup)}</td>
                              <td className="px-1 py-2 text-right text-gray-800">{formatMoney(real)}</td>
                              <td className={`px-1 py-2 text-right ${desvColor(desv)}`}>
                                {desv !== null ? `${desv > 0 ? '+' : ''}${desv.toFixed(1)}%` : '—'}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {comparativo.length === 0 && (
                  <div className="p-8 text-center text-gray-400">Sin datos comparativos disponibles</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
