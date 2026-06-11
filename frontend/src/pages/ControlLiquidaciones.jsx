import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheckIcon, ExclamationTriangleIcon, XCircleIcon,
  InformationCircleIcon, CheckCircleIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';
import api from '../api/client';
import { formatMoney, mesNombre, MESES, aniosRecientes } from '../utils/format';

const anioActual = new Date().getFullYear();
const mesActual = new Date().getMonth() + 1;

const SEVERIDADES = {
  CRITICO:     { label: 'Crítico',     icon: XCircleIcon,             chip: 'bg-red-100 text-red-700 border-red-200',       row: 'border-l-4 border-red-400' },
  ADVERTENCIA: { label: 'Advertencia', icon: ExclamationTriangleIcon, chip: 'bg-amber-100 text-amber-700 border-amber-200', row: 'border-l-4 border-amber-400' },
  INFO:        { label: 'Info',        icon: InformationCircleIcon,   chip: 'bg-blue-100 text-blue-700 border-blue-200',    row: 'border-l-4 border-blue-300' },
};

export default function ControlLiquidaciones() {
  const [empresas, setEmpresas] = useState([]);
  const [filtros, setFiltros] = useState({ empresaId: '', anio: anioActual, mes: mesActual });
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filtroSev, setFiltroSev] = useState('TODOS');

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(r => {
      setEmpresas(r.data.data || []);
      if (r.data.data?.length) setFiltros(f => ({ ...f, empresaId: f.empresaId || r.data.data[0].id }));
    });
  }, []);

  const ejecutarControl = async () => {
    if (!filtros.empresaId) return;
    setLoading(true);
    setResultado(null);
    try {
      const r = await api.get('/liquidaciones/control', { params: filtros });
      setResultado(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (filtros.empresaId) ejecutarControl(); }, [filtros.empresaId, filtros.anio, filtros.mes]);

  const hallazgosVisibles = resultado?.hallazgos.filter(
    h => filtroSev === 'TODOS' || h.severidad === filtroSev
  ) || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheckIcon className="w-7 h-7 text-blue-600" />
            Control de Liquidaciones
          </h1>
          <p className="text-gray-500 text-sm">
            Revisión automática pre-cierre: anomalías, variaciones y faltantes vs mes anterior
          </p>
        </div>
        <button onClick={ejecutarControl} disabled={loading || !filtros.empresaId} className="btn-secondary text-sm">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-ejecutar
        </button>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select className="input w-64" value={filtros.empresaId}
          onChange={e => setFiltros(f => ({ ...f, empresaId: e.target.value }))}>
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select className="input w-32" value={filtros.mes}
          onChange={e => setFiltros(f => ({ ...f, mes: Number(e.target.value) }))}>
          {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <select className="input w-24" value={filtros.anio}
          onChange={e => setFiltros(f => ({ ...f, anio: Number(e.target.value) }))}>
          {aniosRecientes(5, 1).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="card p-10 text-center">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm mt-3">Analizando liquidaciones...</p>
        </div>
      ) : !resultado ? (
        <div className="card p-10 text-center text-gray-400 text-sm">
          Seleccioná una empresa para ejecutar el control
        </div>
      ) : (
        <>
          {/* Semáforo de resultado */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`card p-4 ${resultado.resumen.apto ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2">
                {resultado.resumen.apto
                  ? <CheckCircleIcon className="w-8 h-8 text-green-600" />
                  : <XCircleIcon className="w-8 h-8 text-red-600" />}
                <div>
                  <p className={`font-bold ${resultado.resumen.apto ? 'text-green-800' : 'text-red-800'}`}>
                    {resultado.resumen.apto ? 'Apto para cierre' : 'Revisar antes de cerrar'}
                  </p>
                  <p className="text-xs text-gray-500">{mesNombre(filtros.mes)} {filtros.anio}</p>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Liquidaciones analizadas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{resultado.liquidacionesAnalizadas}</p>
              {resultado.comparadoContra && (
                <p className="text-xs text-gray-400 mt-1">
                  vs {resultado.comparadoContra.liquidaciones} de {mesNombre(resultado.comparadoContra.mes)}
                </p>
              )}
            </div>
            <div className="card p-4">
              <p className="text-xs text-red-600 uppercase tracking-wide font-semibold">Críticos</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{resultado.resumen.criticos}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-amber-600 uppercase tracking-wide font-semibold">Advertencias</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{resultado.resumen.advertencias}</p>
            </div>
          </div>

          {/* Filtro por severidad */}
          <div className="flex gap-2">
            {['TODOS', 'CRITICO', 'ADVERTENCIA', 'INFO'].map(s => (
              <button key={s} onClick={() => setFiltroSev(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filtroSev === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                {s === 'TODOS' ? `Todos (${resultado.hallazgos.length})` : `${SEVERIDADES[s].label}s`}
              </button>
            ))}
          </div>

          {/* Hallazgos */}
          {hallazgosVisibles.length === 0 ? (
            <div className="card p-10 text-center">
              <CheckCircleIcon className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {resultado.hallazgos.length === 0
                  ? 'Sin hallazgos. La liquidación pasó todos los controles automáticos.'
                  : 'Sin hallazgos con este filtro.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {hallazgosVisibles.map((h, i) => {
                const sev = SEVERIDADES[h.severidad];
                const Icon = sev.icon;
                return (
                  <div key={i} className={`card p-4 flex items-start gap-3 ${sev.row}`}>
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${h.severidad === 'CRITICO' ? 'text-red-500' : h.severidad === 'ADVERTENCIA' ? 'text-amber-500' : 'text-blue-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sev.chip}`}>{sev.label}</span>
                        <span className="text-[10px] font-mono text-gray-400">{h.codigo}</span>
                        {h.empleado && (
                          h.empleadoId
                            ? <Link to={`/empleados/${h.empleadoId}`} className="text-sm font-semibold text-blue-700 hover:underline">{h.empleado}</Link>
                            : <span className="text-sm font-semibold text-gray-800">{h.empleado}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{h.mensaje}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
