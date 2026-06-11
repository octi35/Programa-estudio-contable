import React, { useEffect, useState } from 'react';
import { CalculatorIcon, UserIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import api from '../api/client';
import { formatMoney } from '../utils/format';

export default function SimuladorCosto() {
  const [convenios, setConvenios] = useState([]);
  const [form, setForm] = useState({ bruto: '', convenioId: '', incluirSindicato: false });
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/convenios').then(r => setConvenios(r.data || [])).catch(() => {});
  }, []);

  const simular = async (e) => {
    e?.preventDefault();
    const bruto = Number(form.bruto);
    if (!bruto || bruto <= 0) return;
    setLoading(true);
    try {
      const r = await api.post('/contribuciones/simulador', {
        bruto,
        convenioId: form.convenioId || undefined,
        incluirSindicato: form.incluirSindicato,
      });
      setResultado(r.data);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalculatorIcon className="w-7 h-7 text-blue-600" />
          Simulador de Costo Laboral
        </h1>
        <p className="text-gray-500 text-sm">
          "¿Cuánto cuesta de verdad contratar a alguien?" — bruto, bolsillo y costo empleador con provisión de SAC
        </p>
      </div>

      {/* Form */}
      <form onSubmit={simular} className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Sueldo bruto mensual *</label>
          <input type="number" min="1" step="0.01" className="input w-48" placeholder="1.500.000"
            value={form.bruto} onChange={e => setForm(f => ({ ...f, bruto: e.target.value }))} autoFocus />
        </div>
        <div>
          <label className="label">Convenio (opcional)</label>
          <select className="input w-64" value={form.convenioId}
            onChange={e => setForm(f => ({ ...f, convenioId: e.target.value }))}>
            <option value="">— Alícuotas generales —</option>
            {convenios.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 pb-2 cursor-pointer">
          <input type="checkbox" checked={form.incluirSindicato}
            onChange={e => setForm(f => ({ ...f, incluirSindicato: e.target.checked }))} />
          Incluir cuota sindical (2%)
        </label>
        <button type="submit" disabled={loading || !form.bruto} className="btn-primary">
          {loading ? 'Calculando...' : 'Simular'}
        </button>
      </form>

      {resultado && (
        <>
          {/* Resumen en 3 números */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Sueldo bruto</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatMoney(resultado.bruto)}</p>
            </div>
            <div className="card p-5 text-center bg-green-50 border-green-200">
              <p className="text-xs text-green-700 uppercase tracking-wide font-semibold">Bolsillo del empleado</p>
              <p className="text-3xl font-bold text-green-800 mt-1">{formatMoney(resultado.empleado.netoBolsillo)}</p>
              <p className="text-xs text-green-600 mt-1">− {formatMoney(resultado.empleado.totalAportes)} de aportes</p>
            </div>
            <div className="card p-5 text-center bg-blue-50 border-blue-200">
              <p className="text-xs text-blue-700 uppercase tracking-wide font-semibold">Costo total empleador</p>
              <p className="text-3xl font-bold text-blue-900 mt-1">{formatMoney(resultado.empleador.costoMensualConProvisiones)}</p>
              <p className="text-xs text-blue-600 mt-1">incluye provisión SAC mensual</p>
            </div>
          </div>

          {/* Indicador clave */}
          <div className="card p-4 bg-gray-900 text-white flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Por cada <span className="font-bold">$1</span> que llega al bolsillo del empleado,
              el empleador paga <span className="font-bold text-yellow-300">${resultado.indicadores.costoPorPesoNeto.toLocaleString('es-AR')}</span>
            </p>
            <p className="text-sm text-gray-300">
              Carga total: <span className="font-bold text-white">{resultado.indicadores.cargaTotalPorcentaje.toLocaleString('es-AR')}%</span> sobre el neto
              · Costo anual: <span className="font-bold text-white">{formatMoney(resultado.empleador.costoAnual)}</span>
            </p>
          </div>

          {/* Desgloses lado a lado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-gray-500" />
                <h2 className="font-semibold text-gray-700 text-sm">Retenciones al empleado</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {resultado.empleado.aportes.map(a => (
                    <tr key={a.codigo}>
                      <td className="px-5 py-2 text-gray-700">{a.nombre}</td>
                      <td className="px-5 py-2 text-right text-xs text-gray-400">{(a.alicuota * 100).toFixed(2)}%</td>
                      <td className="px-5 py-2 text-right font-medium text-red-600">− {formatMoney(a.importe)}</td>
                    </tr>
                  ))}
                  <tr className="bg-green-50 font-bold">
                    <td className="px-5 py-2.5 text-green-900" colSpan={2}>NETO DE BOLSILLO</td>
                    <td className="px-5 py-2.5 text-right text-green-900">{formatMoney(resultado.empleado.netoBolsillo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
                <BuildingOfficeIcon className="w-4 h-4 text-gray-500" />
                <h2 className="font-semibold text-gray-700 text-sm">
                  Contribuciones del empleador
                  <span className="ml-2 text-[10px] font-normal text-gray-400">({resultado.fuenteAlicuotas})</span>
                </h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {resultado.empleador.contribuciones.map(c => (
                    <tr key={c.codigo}>
                      <td className="px-5 py-2 text-gray-700">{c.nombre}</td>
                      <td className="px-5 py-2 text-right text-xs text-gray-400">{(c.alicuota * 100).toFixed(2)}%</td>
                      <td className="px-5 py-2 text-right font-medium text-orange-700">+ {formatMoney(c.importe)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-5 py-2 text-gray-700">Provisión SAC (1/12 + contribuciones)</td>
                    <td className="px-5 py-2 text-right text-xs text-gray-400">8.33%</td>
                    <td className="px-5 py-2 text-right font-medium text-orange-700">
                      + {formatMoney(resultado.empleador.provisionSAC + resultado.empleador.provisionSACContrib)}
                    </td>
                  </tr>
                  <tr className="bg-blue-50 font-bold">
                    <td className="px-5 py-2.5 text-blue-900" colSpan={2}>COSTO MENSUAL TOTAL</td>
                    <td className="px-5 py-2.5 text-right text-blue-900">{formatMoney(resultado.empleador.costoMensualConProvisiones)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
