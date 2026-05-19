import React, { useEffect, useState } from 'react';
import api from '../api/client';
import { ArrowPathIcon, FunnelIcon } from '@heroicons/react/24/outline';

const TIPO_BADGE = {
  CREAR: 'badge-green',
  EDITAR: 'badge-yellow',
  ELIMINAR: 'badge-red',
  CONFIRMAR: 'badge-blue',
  AUTH: 'badge-gray',
};

function tipoDe(accion = '') {
  const a = accion.toUpperCase();
  if (a.startsWith('CREAR')) return 'CREAR';
  if (a.startsWith('ACTUALIZAR') || a.startsWith('EDITAR') || a.startsWith('MODIFICAR')) return 'EDITAR';
  if (a.startsWith('ELIMINAR') || a.startsWith('ANULAR') || a.startsWith('BORRAR')) return 'ELIMINAR';
  if (a.startsWith('CONFIRMAR') || a.startsWith('CERRAR')) return 'CONFIRMAR';
  if (a === 'LOGIN' || a === 'LOGOUT' || a.startsWith('LOGIN_')) return 'AUTH';
  return 'OTRO';
}

const MODULO_LABEL = {
  SUELDOS: 'Sueldos',
  IVA: 'IVA',
  CONTABILIDAD: 'Contabilidad',
  IMPUESTOS: 'Impuestos',
  GESTION: 'Gestión',
  FINANZAS: 'Finanzas',
};

const TIPO_LABEL = {
  CREAR: 'Crear',
  EDITAR: 'Editar / Actualizar',
  ELIMINAR: 'Eliminar / Anular',
  CONFIRMAR: 'Confirmar / Cerrar',
  AUTH: 'Login / Logout',
};

export default function LogAcciones() {
  const [logs, setLogs] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [tiposAccion, setTiposAccion] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const [filtros, setFiltros] = useState({
    modulo: '', tipoAccion: '', entidad: '', usuarioId: '',
    desde: '', hasta: '', q: '',
  });

  const cargar = (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: p, limit: 50 });
    Object.entries(filtros).forEach(([k, v]) => { if (v) params.append(k, v); });
    api.get(`/reportes/log-acciones?${params}`)
      .then(r => {
        setLogs(r.data.data);
        setPagination(r.data.pagination);
        setPage(p);
        if (r.data.usuarios) setUsuarios(r.data.usuarios);
        if (r.data.modulos) setModulos(r.data.modulos);
        if (r.data.tiposAccion) setTiposAccion(r.data.tiposAccion);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(1); /* eslint-disable-next-line */ }, [JSON.stringify(filtros)]);

  const limpiar = () => setFiltros({ modulo: '', tipoAccion: '', entidad: '', usuarioId: '', desde: '', hasta: '', q: '' });

  const fmt = (dt) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('es-AR') + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Log de Acciones</h1>
          <p className="text-gray-500 text-sm">Auditoría de operaciones del sistema</p>
        </div>
        {hayFiltros && (
          <button onClick={limpiar} className="btn-secondary text-sm">
            <ArrowPathIcon className="w-4 h-4" /> Limpiar filtros
          </button>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide font-medium">
          <FunnelIcon className="w-4 h-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select className="input" value={filtros.modulo} onChange={e => setFiltros(f => ({ ...f, modulo: e.target.value, entidad: '' }))}>
            <option value="">Todos los módulos</option>
            {modulos.map(m => <option key={m} value={m}>{MODULO_LABEL[m] || m}</option>)}
          </select>

          <select className="input" value={filtros.tipoAccion} onChange={e => setFiltros(f => ({ ...f, tipoAccion: e.target.value }))}>
            <option value="">Todo tipo de acción</option>
            {tiposAccion.map(t => <option key={t} value={t}>{TIPO_LABEL[t] || t}</option>)}
          </select>

          <select className="input" value={filtros.entidad} onChange={e => setFiltros(f => ({ ...f, entidad: e.target.value }))}>
            <option value="">Cualquier entidad</option>
            {['Liquidacion','Empleado','ComprobanteIVA','Asiento','Empresa','Usuario','EjercicioContable','CuentaContable','Concepto','Familiar','Ausentismo','PeriodoLiquidacion'].map(e => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>

          <select className="input" value={filtros.usuarioId} onChange={e => setFiltros(f => ({ ...f, usuarioId: e.target.value }))}>
            <option value="">Todos los usuarios</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>

          <input type="date" className="input" placeholder="Desde"
            value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input type="date" className="input" placeholder="Hasta"
            value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
          <input type="text" className="input lg:col-span-2" placeholder="Buscar en acción / entidad / id..."
            value={filtros.q} onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))} />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="p-10 text-center">
            <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Fecha y hora</th>
                <th className="px-5 py-3 text-left">Tipo</th>
                <th className="px-5 py-3 text-left">Acción</th>
                <th className="px-5 py-3 text-left">Entidad</th>
                <th className="px-5 py-3 text-left">Detalle</th>
                <th className="px-5 py-3 text-left">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => {
                const tipo = tipoDe(log.accion);
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(log.createdAt)}</td>
                    <td className="px-5 py-3">
                      <span className={TIPO_BADGE[tipo] || 'badge-gray'}>{tipo}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-700 text-xs">{log.accion?.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 text-gray-700 text-xs">{log.entidad || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate" title={log.detalle ? JSON.stringify(log.detalle) : ''}>
                      {log.detalle ? JSON.stringify(log.detalle) : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs font-mono">{log.ip || '—'}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Sin registros para los filtros seleccionados</td></tr>
              )}
            </tbody>
          </table>
        )}
        {pagination.pages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>{pagination.total} registros</span>
            <div className="flex gap-2">
              <button onClick={() => cargar(page - 1)} disabled={page <= 1} className="btn-secondary text-xs py-1">Anterior</button>
              <span className="px-2 py-1">Pág. {page} / {pagination.pages}</span>
              <button onClick={() => cargar(page + 1)} disabled={page >= pagination.pages} className="btn-secondary text-xs py-1">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
