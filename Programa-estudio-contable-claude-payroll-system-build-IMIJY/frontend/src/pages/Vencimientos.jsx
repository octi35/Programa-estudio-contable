import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { formatDate, MESES } from '../utils/format';
import toast from 'react-hot-toast';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';

const TIPO_COLORS = {
  IVA: 'bg-blue-100 text-blue-800',
  F931: 'bg-purple-100 text-purple-800',
  IIBB: 'bg-orange-100 text-orange-800',
  MONOTRIBUTO: 'bg-yellow-100 text-yellow-800',
  GANANCIAS: 'bg-green-100 text-green-800',
};

function estadoBadge(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - hoy) / 86400000);

  if (diff < 0) return { label: 'VENCIDO', cls: 'bg-red-100 text-red-700 border border-red-200' };
  if (diff === 0) return { label: 'HOY', cls: 'bg-red-500 text-white' };
  if (diff <= 5) return { label: `${diff}d`, cls: 'bg-orange-100 text-orange-700 border border-orange-200' };
  if (diff <= 30) return { label: 'PROXIMO', cls: 'bg-yellow-100 text-yellow-700' };
  return { label: 'OK', cls: 'bg-gray-100 text-gray-500' };
}

function cardBorderColor(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - hoy) / 86400000);
  if (diff < 0) return 'border-l-4 border-l-red-500';
  if (diff === 0) return 'border-l-4 border-l-red-600';
  if (diff <= 5) return 'border-l-4 border-l-orange-400';
  return 'border-l-4 border-l-gray-200';
}

export default function Vencimientos() {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [vencimientos, setVencimientos] = useState([]);
  const [proximos, setProximos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [todasEmpresas, setTodasEmpresas] = useState(false);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setEmpresaId(data.data[0].id);
    }).catch(() => {});
  }, []);

  const fetchVencimientos = useCallback(async () => {
    setLoading(true);
    try {
      const params = { anio, mes };
      if (!todasEmpresas && empresaId) params.empresaId = empresaId;
      const { data } = await api.get('/vencimientos', { params });
      setVencimientos(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Error al cargar vencimientos');
    } finally {
      setLoading(false);
    }
  }, [empresaId, anio, mes, todasEmpresas]);

  const fetchProximos = useCallback(async () => {
    try {
      const hoy = new Date();
      const en30 = new Date(hoy);
      en30.setDate(en30.getDate() + 30);
      const params = { desde: hoy.toISOString().split('T')[0], hasta: en30.toISOString().split('T')[0] };
      if (!todasEmpresas && empresaId) params.empresaId = empresaId;
      const { data } = await api.get('/vencimientos/proximos', { params });
      setProximos(Array.isArray(data) ? data : []);
    } catch {}
  }, [empresaId, todasEmpresas]);

  useEffect(() => { fetchVencimientos(); }, [fetchVencimientos]);
  useEffect(() => { fetchProximos(); }, [fetchProximos]);

  const vencimientosOrdenados = [...vencimientos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Vencimientos Fiscales</h1>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={todasEmpresas}
            onChange={e => setTodasEmpresas(e.target.checked)}
            className="w-4 h-4"
          />
          Todas las empresas
        </label>
        {!todasEmpresas && (
          <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
            <option value="">Seleccionar empresa...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        )}
        <select value={mes} onChange={e => setMes(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" value={anio} onChange={e => setAnio(parseInt(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm w-24" placeholder="Año" />
      </div>

      <div className="flex gap-4">
        {/* Main content */}
        <div className="flex-1 space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-500">Cargando...</div>
          ) : vencimientosOrdenados.length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
              <CalendarDaysIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Sin vencimientos en este periodo</p>
            </div>
          ) : (
            vencimientosOrdenados.map(v => {
              const badge = estadoBadge(v.fecha);
              return (
                <div key={v.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between ${cardBorderColor(v.fecha)}`}>
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[48px]">
                      <p className="text-2xl font-bold text-gray-800">{new Date(v.fecha).getUTCDate()}</p>
                      <p className="text-xs text-gray-400">{MESES[(new Date(v.fecha).getUTCMonth())]?.substring(0, 3)}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIPO_COLORS[v.tipo] || 'bg-gray-100 text-gray-600'}`}>
                          {v.tipo}
                        </span>
                        {v.empresa && (
                          <span className="text-xs text-gray-500">{v.empresa.razonSocial}</span>
                        )}
                      </div>
                      <p className="font-medium text-gray-800 mt-0.5">{v.descripcion}</p>
                      {v.detalle && <p className="text-xs text-gray-500">{v.detalle}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar proximos 30 dias */}
        <div className="w-72 shrink-0">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-sm text-gray-700">Proximos 30 dias</h3>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {proximos.length === 0 ? (
                <p className="p-4 text-sm text-gray-400 text-center">Sin proximos vencimientos</p>
              ) : (
                proximos.map(v => {
                  const badge = estadoBadge(v.fecha);
                  return (
                    <div key={v.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                      <div>
                        <p className="text-xs font-semibold text-gray-700">{v.tipo}</p>
                        <p className="text-xs text-gray-600 truncate max-w-[150px]">{v.descripcion}</p>
                        <p className="text-xs text-gray-400">{formatDate(v.fecha)}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
