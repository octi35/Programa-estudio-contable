import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

const badgeTipo = (tipo) => {
  const map = {
    ACTIVO: 'text-blue-700', PASIVO: 'text-red-700', PATRIMONIO_NETO: 'text-green-700',
    RESULTADO_POSITIVO: 'text-emerald-700', RESULTADO_NEGATIVO: 'text-orange-700',
  };
  return map[tipo] || 'text-gray-600';
};

export default function BalanceSumas() {
  const [datos, setDatos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [ejercicios, setEjercicios] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [ejercicioId, setEjercicioId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setEmpresaId(data.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    api.get('/contabilidad/ejercicios', { params: { empresaId } }).then(({ data }) => {
      setEjercicios(data || []);
      if (data?.length > 0) setEjercicioId(data[0].id);
    });
  }, [empresaId]);

  const fetchBalance = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const { data } = await api.get('/contabilidad/balance-sumas-saldos', { params: { empresaId, ejercicioId } });
      setDatos(data || []);
    } catch { toast.error('Error al cargar el balance'); }
    finally { setLoading(false); }
  };

  const totalDebe = datos.reduce((s, c) => s + c.sumaDebe, 0);
  const totalHaber = datos.reduce((s, c) => s + c.sumaHaber, 0);
  const totalSaldoD = datos.reduce((s, c) => s + c.saldoDeudor, 0);
  const totalSaldoA = datos.reduce((s, c) => s + c.saldoAcreedor, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Balance de Sumas y Saldos</h1>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
          <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ejercicio</label>
          <select value={ejercicioId} onChange={e => setEjercicioId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
            <option value="">Todos</option>
            {ejercicios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <button onClick={fetchBalance} disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Calculando...' : 'Generar Balance'}
        </button>
      </div>

      {datos.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cuenta</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Suma Debe</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Suma Haber</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo Deudor</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo Acreedor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {datos.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-600">{c.codigo}</td>
                  <td className="px-4 py-3 text-gray-800">{c.nombre}</td>
                  <td className={`px-4 py-3 text-xs font-medium ${badgeTipo(c.tipo)}`}>
                    {c.tipo?.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{formatCurrency(c.sumaDebe)}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{formatCurrency(c.sumaHaber)}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-blue-700">
                    {c.saldoDeudor > 0 ? formatCurrency(c.saldoDeudor) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-green-700">
                    {c.saldoAcreedor > 0 ? formatCurrency(c.saldoAcreedor) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-gray-50 font-bold">
              <tr>
                <td colSpan="3" className="px-4 py-3 text-right text-sm">TOTALES</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalDebe)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalHaber)}</td>
                <td className="px-4 py-3 text-right font-mono text-blue-700">{formatCurrency(totalSaldoD)}</td>
                <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalSaldoA)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
