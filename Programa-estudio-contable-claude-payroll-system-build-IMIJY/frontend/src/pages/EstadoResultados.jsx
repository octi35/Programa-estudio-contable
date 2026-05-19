import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { formatMoney } from '../utils/format';

export default function EstadoResultados() {
  const [empresas, setEmpresas] = useState([]);
  const [ejercicios, setEjercicios] = useState([]);
  const [form, setForm] = useState({ empresaId: '', ejercicioId: '', fechaDesde: '', fechaHasta: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/empresas').then(r => setEmpresas(r.data?.data || r.data));
  }, []);

  useEffect(() => {
    if (form.empresaId) {
      api.get(`/contabilidad/ejercicios?empresaId=${form.empresaId}`).then(r => setEjercicios(r.data));
    }
  }, [form.empresaId]);

  const consultar = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const params = new URLSearchParams({ empresaId: form.empresaId });
      if (form.ejercicioId) params.append('ejercicioId', form.ejercicioId);
      if (form.fechaDesde) params.append('fechaDesde', form.fechaDesde);
      if (form.fechaHasta) params.append('fechaHasta', form.fechaHasta);
      const r = await api.get(`/contabilidad/estado-resultados?${params}`);
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Estado de Resultados</h1>

      <form onSubmit={consultar} className="card p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Empresa *</label>
            <select className="input" value={form.empresaId} onChange={e => setForm(f => ({ ...f, empresaId: e.target.value }))} required>
              <option value="">Seleccionar...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ejercicio</label>
            <select className="input" value={form.ejercicioId} onChange={e => setForm(f => ({ ...f, ejercicioId: e.target.value }))}>
              <option value="">Todos</option>
              {ejercicios.map(ej => <option key={ej.id} value={ej.id}>{ej.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha desde</label>
            <input type="date" className="input" value={form.fechaDesde} onChange={e => setForm(f => ({ ...f, fechaDesde: e.target.value }))} />
          </div>
          <div>
            <label className="label">Fecha hasta</label>
            <input type="date" className="input" value={form.fechaHasta} onChange={e => setForm(f => ({ ...f, fechaHasta: e.target.value }))} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" className="btn-primary" disabled={loading || !form.empresaId}>
            {loading ? 'Calculando...' : 'Generar estado de resultados'}
          </button>
        </div>
      </form>

      {data && (
        <div className="card p-0 overflow-hidden">
          <div className="bg-blue-900 text-white px-6 py-4">
            <h2 className="text-lg font-bold">Estado de Resultados</h2>
            <p className="text-blue-200 text-sm">{empresas.find(e => e.id === form.empresaId)?.razonSocial}</p>
          </div>

          <div className="divide-y divide-gray-100">
            {/* Ingresos */}
            <div className="p-6">
              <h3 className="font-semibold text-green-800 mb-3 flex justify-between">
                <span>INGRESOS</span>
                <span>{formatMoney(data.totalIngresos)}</span>
              </h3>
              {data.ingresos.length === 0 ? (
                <p className="text-gray-400 text-sm pl-4">Sin movimientos</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.ingresos.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="py-1.5 pl-4 text-gray-500 text-xs w-20">{c.codigo}</td>
                        <td className="py-1.5 text-gray-700">{c.nombre}</td>
                        <td className="py-1.5 text-right font-medium text-green-700">{formatMoney(c.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Egresos */}
            <div className="p-6">
              <h3 className="font-semibold text-red-800 mb-3 flex justify-between">
                <span>EGRESOS</span>
                <span>{formatMoney(data.totalEgresos)}</span>
              </h3>
              {data.egresos.length === 0 ? (
                <p className="text-gray-400 text-sm pl-4">Sin movimientos</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.egresos.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="py-1.5 pl-4 text-gray-500 text-xs w-20">{c.codigo}</td>
                        <td className="py-1.5 text-gray-700">{c.nombre}</td>
                        <td className="py-1.5 text-right font-medium text-red-600">{formatMoney(c.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Resultado */}
            <div className={`p-6 ${data.tipo === 'GANANCIA' ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex justify-between items-center">
                <span className={`text-lg font-bold ${data.tipo === 'GANANCIA' ? 'text-green-800' : 'text-red-800'}`}>
                  {data.tipo === 'GANANCIA' ? 'RESULTADO DEL EJERCICIO — GANANCIA' : 'RESULTADO DEL EJERCICIO — PÉRDIDA'}
                </span>
                <span className={`text-2xl font-bold ${data.tipo === 'GANANCIA' ? 'text-green-700' : 'text-red-700'}`}>
                  {formatMoney(Math.abs(data.resultado))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
