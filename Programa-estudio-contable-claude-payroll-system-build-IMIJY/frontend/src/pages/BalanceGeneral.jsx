import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { formatMoney } from '../utils/format';

function SeccionBalance({ titulo, cuentas, total, color }) {
  return (
    <div>
      <h3 className={`font-semibold text-sm mb-2 flex justify-between ${color}`}>
        <span>{titulo}</span>
        <span>{formatMoney(total)}</span>
      </h3>
      {cuentas.length === 0 ? (
        <p className="text-gray-400 text-xs pl-4 mb-3">Sin movimientos</p>
      ) : (
        <table className="w-full text-sm mb-3">
          <tbody>
            {cuentas.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="py-1 pl-4 text-gray-400 text-xs w-20">{c.codigo}</td>
                <td className="py-1 text-gray-700">{c.nombre}</td>
                <td className="py-1 text-right font-medium text-gray-900">{formatMoney(c.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function BalanceGeneral() {
  const [empresas, setEmpresas] = useState([]);
  const [ejercicios, setEjercicios] = useState([]);
  const [form, setForm] = useState({ empresaId: '', ejercicioId: '', fechaHasta: '' });
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
      if (form.fechaHasta) params.append('fechaHasta', form.fechaHasta);
      const r = await api.get(`/contabilidad/balance-general?${params}`);
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Balance General</h1>

      <form onSubmit={consultar} className="card p-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
            <label className="label">Al cierre de fecha</label>
            <input type="date" className="input" value={form.fechaHasta} onChange={e => setForm(f => ({ ...f, fechaHasta: e.target.value }))} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" className="btn-primary" disabled={loading || !form.empresaId}>
            {loading ? 'Calculando...' : 'Generar balance general'}
          </button>
        </div>
      </form>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Activo */}
          <div className="card p-6">
            <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900">ACTIVO</h2>
              <span className="text-lg font-bold text-blue-700">{formatMoney(data.totalActivo)}</span>
            </div>
            <SeccionBalance
              titulo="Activo corriente / no corriente"
              cuentas={data.activos}
              total={data.totalActivo}
              color="text-blue-800"
            />
          </div>

          {/* Pasivo + Patrimonio Neto */}
          <div className="card p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-200 pb-3">
              <h2 className="text-lg font-bold text-gray-900">PASIVO + PATRIMONIO NETO</h2>
              <span className="text-lg font-bold text-purple-700">{formatMoney(data.totalPasivoMasPatrimonio)}</span>
            </div>
            <SeccionBalance titulo="PASIVO" cuentas={data.pasivos} total={data.totalPasivo} color="text-red-700" />
            <div className="border-t border-gray-100 pt-3">
              <SeccionBalance titulo="PATRIMONIO NETO" cuentas={data.patrimonioNeto} total={data.totalPatrimonio} color="text-green-700" />
            </div>
          </div>

          {/* Comprobación */}
          <div className={`md:col-span-2 card p-4 flex items-center justify-between ${data.balanceado ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <span className={`font-semibold ${data.balanceado ? 'text-green-800' : 'text-red-800'}`}>
              {data.balanceado ? '✓ Balance cuadrado correctamente' : '✗ Balance no cuadra — revisar asientos'}
            </span>
            <div className="text-sm text-gray-600 space-x-4">
              <span>Activo: <strong>{formatMoney(data.totalActivo)}</strong></span>
              <span>Pas. + PN: <strong>{formatMoney(data.totalPasivoMasPatrimonio)}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
