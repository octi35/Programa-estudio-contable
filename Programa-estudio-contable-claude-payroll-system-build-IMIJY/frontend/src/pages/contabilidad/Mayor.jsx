import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { formatCurrency, formatDate } from '../../utils/format';
import toast from 'react-hot-toast';

export default function Mayor() {
  const [datos, setDatos] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [ejercicios, setEjercicios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ empresaId: '', cuentaId: '', ejercicioId: '' });

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setFilters(f => ({ ...f, empresaId: data.data[0].id }));
    });
  }, []);

  useEffect(() => {
    if (!filters.empresaId) return;
    Promise.all([
      api.get('/contabilidad/cuentas', { params: { empresaId: filters.empresaId } }),
      api.get('/contabilidad/ejercicios', { params: { empresaId: filters.empresaId } }),
    ]).then(([{ data: c }, { data: e }]) => {
      setCuentas(c || []);
      setEjercicios(e || []);
    });
  }, [filters.empresaId]);

  const fetchMayor = async () => {
    if (!filters.empresaId || !filters.cuentaId) {
      toast.error('Seleccioná empresa y cuenta');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/contabilidad/mayor', { params: filters });
      setDatos(data);
    } catch { toast.error('Error al cargar el mayor'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Mayor por Cuenta</h1>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
          <select value={filters.empresaId} onChange={e => setFilters(f => ({ ...f, empresaId: e.target.value, cuentaId: '' }))}
            className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta *</label>
          <select value={filters.cuentaId} onChange={e => setFilters(f => ({ ...f, cuentaId: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm min-w-[250px]">
            <option value="">Seleccionar cuenta...</option>
            {cuentas.filter(c => c.permiteMovimientos).map(c => (
              <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ejercicio</label>
          <select value={filters.ejercicioId} onChange={e => setFilters(f => ({ ...f, ejercicioId: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Todos</option>
            {ejercicios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <button onClick={fetchMayor} disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Cargando...' : 'Ver Mayor'}
        </button>
      </div>

      {datos && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-6 text-sm">
            <div><p className="text-gray-500">Total Debe</p><p className="text-xl font-bold text-gray-800">{formatCurrency(datos.totalDebe)}</p></div>
            <div><p className="text-gray-500">Total Haber</p><p className="text-xl font-bold text-gray-800">{formatCurrency(datos.totalHaber)}</p></div>
            <div className="border-l pl-6">
              <p className="text-gray-500">Saldo Final</p>
              <p className={`text-xl font-bold ${datos.saldoFinal >= 0 ? 'text-blue-700' : 'text-green-700'}`}>
                {formatCurrency(Math.abs(datos.saldoFinal))}
                <span className="text-xs font-normal ml-1">{datos.saldoFinal >= 0 ? 'Deudor' : 'Acreedor'}</span>
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">N° Asiento</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Descripción</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Debe</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Haber</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {datos.movimientos.map((m, i) => (
                  <tr key={m.id || i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(m.asiento.fecha)}</td>
                    <td className="px-4 py-3 font-mono text-gray-500">{m.asiento.numero || '—'}</td>
                    <td className="px-4 py-3 text-gray-800">{m.asiento.descripcion}{m.descripcion ? ` — ${m.descripcion}` : ''}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{parseFloat(m.debe) > 0 ? formatCurrency(m.debe) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm">{parseFloat(m.haber) > 0 ? formatCurrency(m.haber) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-mono text-sm font-semibold ${m.saldo >= 0 ? 'text-blue-700' : 'text-green-700'}`}>
                      {formatCurrency(Math.abs(m.saldo))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {datos.movimientos.length === 0 && <div className="p-8 text-center text-gray-400">Sin movimientos en este mayor</div>}
          </div>
        </>
      )}
    </div>
  );
}
