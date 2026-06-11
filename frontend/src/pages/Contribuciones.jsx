import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  PlusIcon, ArrowDownTrayIcon, PencilIcon, TrashIcon, BoltIcon,
  BanknotesIcon, ChartBarIcon, Cog6ToothIcon, UsersIcon,
} from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import api from '../api/client';
import Modal from '../components/Modal';
import { confirm } from '../components/confirm';
import { downloadWithProgress } from '../utils/download';
import { formatMoney, mesNombre, MESES, aniosRecientes } from '../utils/format';

const anioActualN = new Date().getFullYear();
const mesActualN = new Date().getMonth() + 1;

const TIPOS_BASE = ['REMUNERATIVO', 'BRUTO', 'PRESTACION_DINERARIA', 'FIJO'];
const CODIGOS_SUGERIDOS = ['JUB_PATRONAL','OS_PATRONAL','PAMI','ART','FNE','SEGURO_VIDA','ASIG_FAMILIARES','OTRO'];

// ── Form de tipo de contribución ──────────────────────────────────────────
function TipoForm({ inicial, empresas, convenios, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: inicial ? {
      ...inicial,
      vigenciaDesde: inicial.vigenciaDesde?.slice(0, 10),
      vigenciaHasta: inicial.vigenciaHasta?.slice(0, 10) || '',
      alicuota: Number(inicial.alicuota),
    } : {
      base: 'REMUNERATIVO',
      vigenciaDesde: new Date().toISOString().slice(0, 10),
      activo: true,
    },
  });

  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      const payload = { ...data, alicuota: Number(data.alicuota) };
      if (!payload.empresaId) delete payload.empresaId;
      if (!payload.convenioId) delete payload.convenioId;
      if (!payload.vigenciaHasta) payload.vigenciaHasta = null;
      if (inicial?.id) await api.put(`/contribuciones/tipos/${inicial.id}`, payload);
      else await api.post('/contribuciones/tipos', payload);
      toast.success('Tipo guardado');
      onSave();
    } catch (_) { /* interceptor */ }
    finally { setGuardando(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Código *</label>
          <input className="input" list="codigos-sugeridos" {...register('codigo', { required: 'Requerido' })} />
          <datalist id="codigos-sugeridos">
            {CODIGOS_SUGERIDOS.map(c => <option key={c} value={c} />)}
          </datalist>
          {errors.codigo && <p className="text-red-500 text-xs mt-1">{errors.codigo.message}</p>}
        </div>
        <div>
          <label className="label">Alícuota (decimal) *</label>
          <input type="number" step="0.0001" min="0" max="1" className="input"
            placeholder="0.1600 = 16%"
            {...register('alicuota', { required: 'Requerido' })} />
        </div>
        <div className="col-span-2">
          <label className="label">Nombre *</label>
          <input className="input" {...register('nombre', { required: 'Requerido' })} />
        </div>
        <div>
          <label className="label">Base de cálculo *</label>
          <select className="input" {...register('base')}>
            {TIPOS_BASE.map(b => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Vigencia desde *</label>
          <input type="date" className="input" {...register('vigenciaDesde', { required: 'Requerido' })} />
        </div>
        <div>
          <label className="label">Vigencia hasta (opcional)</label>
          <input type="date" className="input" {...register('vigenciaHasta')} />
        </div>
        <div>
          <label className="label">Empresa (vacío = todas)</label>
          <select className="input" {...register('empresaId')}>
            <option value="">— Todas del estudio —</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Convenio (vacío = todos)</label>
          <select className="input" {...register('convenioId')}>
            <option value="">— Todos los convenios —</option>
            {convenios.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Observaciones</label>
          <input className="input" {...register('observaciones')} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={guardando} className="btn-primary">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

export default function Contribuciones() {
  const [tab, setTab] = useState('resumen');
  const [empresas, setEmpresas] = useState([]);
  const [convenios, setConvenios] = useState([]);
  const [filtros, setFiltros] = useState({ empresaId: '', anio: anioActualN, mes: mesActualN });

  const [resumen, setResumen] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [historialTipos, setHistorialTipos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(r => {
      setEmpresas(r.data.data || []);
      if (r.data.data?.length && !filtros.empresaId) setFiltros(f => ({ ...f, empresaId: r.data.data[0].id }));
    });
    api.get('/convenios').then(r => setConvenios(r.data || [])).catch(() => {});
  }, []);

  const cargarResumen = async () => {
    if (!filtros.empresaId) return;
    setLoading(true);
    try {
      const r = await api.get('/contribuciones/resumen', { params: { ...filtros, comparar: true } });
      setResumen(r.data);
    } finally { setLoading(false); }
  };

  const cargarTipos = async () => {
    const [vigentes, todos] = await Promise.all([
      api.get('/contribuciones/tipos', { params: { empresaId: filtros.empresaId || undefined } }),
      api.get('/contribuciones/tipos', { params: { todos: true } }),
    ]);
    setTipos(vigentes.data);
    setHistorialTipos(todos.data);
  };

  useEffect(() => {
    if (tab === 'resumen' && filtros.empresaId) cargarResumen();
    if (tab === 'alicuotas' || tab === 'detalle') cargarTipos();
    if (tab === 'detalle' && filtros.empresaId) cargarResumen();
  }, [tab, filtros.empresaId, filtros.anio, filtros.mes]);

  const cargarFallback = async () => {
    if (!await confirm({
      title: 'Cargar alícuotas legales 2026',
      message: 'Se importarán las 7 contribuciones patronales según la legislación AR (Decreto 814/2001 PyME): Jubilación 16%, OS 6%, PAMI 1.5%, ART 2.5%, FNE 0.89%, Seguro Vida 0.03%, Asignaciones Familiares 5.4%.',
      details: 'La vigencia se aplica desde el 1° de enero del año actual. Si ya existen, se omiten (no se sobreescriben).',
      confirmText: 'Cargar tabla 2026',
    })) return;

    try {
      const r = await api.post('/contribuciones/tipos/cargar-fallback', {
        vigenciaDesde: `${anioActualN}-01-01`,
      });
      toast.success(`${r.data.creadas} alícuotas cargadas`);
      cargarTipos();
    } catch (_) {}
  };

  const eliminarTipo = async (t) => {
    if (!await confirm({
      title: `Eliminar ${t.codigo}`,
      message: 'Se elimina esta fila de la tabla de contribuciones. Los cálculos posteriores usarán otra vigencia (o el fallback legal).',
      confirmText: 'Eliminar',
      danger: true,
    })) return;
    try {
      await api.delete(`/contribuciones/tipos/${t.id}`);
      toast.success('Eliminado');
      cargarTipos();
    } catch (_) {}
  };

  const exportar = () => downloadWithProgress(
    `/api/contribuciones/exportar?empresaId=${filtros.empresaId}&anio=${filtros.anio}&mes=${filtros.mes}`,
    {
      filename: `contribuciones_${filtros.anio}${String(filtros.mes).padStart(2,'0')}.xlsx`,
      loadingLabel: 'Generando Excel de contribuciones...',
    },
  );

  const periodoLabel = `${mesNombre(filtros.mes)} ${filtros.anio}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contribuciones Patronales</h1>
          <p className="text-gray-500 text-sm">Cargas sociales por empresa y período · {periodoLabel}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tab === 'resumen' && filtros.empresaId && (
            <button onClick={exportar} className="btn-secondary text-sm">
              <ArrowDownTrayIcon className="w-4 h-4" /> Excel detallado
            </button>
          )}
        </div>
      </div>

      {/* Filtros globales */}
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

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'resumen',   label: 'Resumen del período', icon: ChartBarIcon },
          { key: 'detalle',   label: 'Detalle por empleado', icon: UsersIcon },
          { key: 'alicuotas', label: 'Alícuotas configurables', icon: Cog6ToothIcon },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB: RESUMEN */}
      {tab === 'resumen' && (
        <>
          {!filtros.empresaId ? (
            <div className="card p-10 text-center text-gray-400 text-sm">
              <BanknotesIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              Seleccioná una empresa para ver el resumen del período
            </div>
          ) : loading ? (
            <div className="card p-10 text-center">
              <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : !resumen?.actual ? (
            <div className="card p-10 text-center text-gray-400 text-sm">Sin datos para el período</div>
          ) : (
            <div className="space-y-4">
              {/* Stats grandes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Empleados liquidados</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{resumen.actual.cantidadEmpleados}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Remunerativo total</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{formatMoney(resumen.actual.totalRemunerativo)}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total contribuciones</p>
                  <p className="text-2xl font-bold text-orange-700 mt-1">{formatMoney(resumen.actual.totalGeneral)}</p>
                  {resumen.variacion !== null && (
                    <p className={`text-xs mt-1 ${resumen.variacion > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {resumen.variacion > 0 ? '▲' : '▼'} {Math.abs(resumen.variacion)}% vs mes anterior
                    </p>
                  )}
                </div>
                <div className="card p-4 border-blue-200 bg-blue-50">
                  <p className="text-xs text-blue-700 uppercase tracking-wide font-semibold">Costo laboral total</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{formatMoney(resumen.actual.costoTotal)}</p>
                  <p className="text-xs text-blue-700 mt-1">Bruto + contribuciones</p>
                </div>
              </div>

              {/* Desglose por tipo */}
              <div className="card">
                <div className="px-5 py-3 border-b bg-gray-50">
                  <h2 className="font-semibold text-gray-700 text-sm">Desglose por concepto</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-2 text-left">Concepto</th>
                      <th className="px-5 py-2 text-right">Alícuota</th>
                      <th className="px-5 py-2 text-right">Base aplicada</th>
                      <th className="px-5 py-2 text-right">Importe</th>
                      <th className="px-5 py-2 text-right">% del total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resumen.actual.tiposAplicados.map(t => {
                      const importe = resumen.actual.totales[t.codigo] || 0;
                      const pct = resumen.actual.totalGeneral > 0 ? (importe / resumen.actual.totalGeneral) * 100 : 0;
                      return (
                        <tr key={t.codigo} className="hover:bg-gray-50">
                          <td className="px-5 py-2.5">
                            <p className="font-medium text-gray-900">{t.nombre}</p>
                            <p className="text-xs text-gray-400 font-mono">{t.codigo}{t._source === 'fallback' && <span className="ml-2 text-orange-600">(legal default)</span>}</p>
                          </td>
                          <td className="px-5 py-2.5 text-right font-semibold">{(Number(t.alicuota) * 100).toFixed(2)}%</td>
                          <td className="px-5 py-2.5 text-right text-xs text-gray-500">{t.base.replace(/_/g, ' ')}</td>
                          <td className="px-5 py-2.5 text-right font-bold text-orange-700">{formatMoney(importe)}</td>
                          <td className="px-5 py-2.5 text-right text-xs text-gray-500">{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-orange-50 border-t-2 border-orange-300">
                      <td className="px-5 py-3 font-bold text-orange-900" colSpan={3}>TOTAL CONTRIBUCIONES</td>
                      <td className="px-5 py-3 text-right font-bold text-orange-900 text-base">{formatMoney(resumen.actual.totalGeneral)}</td>
                      <td className="px-5 py-3 text-right font-bold text-orange-900">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB: DETALLE POR EMPLEADO */}
      {tab === 'detalle' && (
        <div className="card overflow-x-auto">
          {!resumen?.actual ? (
            <div className="p-10 text-center text-gray-400 text-sm">Seleccioná una empresa y período</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Empleado</th>
                  <th className="px-3 py-2 text-right">Remun.</th>
                  {resumen.actual.tiposAplicados.map(t => (
                    <th key={t.codigo} className="px-3 py-2 text-right" title={t.nombre}>
                      {t.codigo.replace('_', ' ').slice(0, 12)}
                      <br/><span className="text-[10px] normal-case text-gray-400">{(Number(t.alicuota) * 100).toFixed(2)}%</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right bg-orange-50">Total Contrib.</th>
                  <th className="px-3 py-2 text-right bg-blue-50">Costo Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resumen.actual.detallePorEmpleado.map(e => (
                  <tr key={e.empleadoId} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{e.empleado}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{e.cuil}</p>
                    </td>
                    <td className="px-3 py-2 text-right">{formatMoney(e.remunerativo)}</td>
                    {resumen.actual.tiposAplicados.map(t => (
                      <td key={t.codigo} className="px-3 py-2 text-right text-gray-700">
                        {formatMoney(e.contribuciones[t.codigo] || 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold text-orange-700 bg-orange-50/30">{formatMoney(e.totalContribuciones)}</td>
                    <td className="px-3 py-2 text-right font-bold text-blue-700 bg-blue-50/30">{formatMoney(e.costoTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: ALÍCUOTAS CONFIGURABLES */}
      {tab === 'alicuotas' && (
        <div className="space-y-4">
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div className="text-sm text-gray-600 max-w-2xl">
              Configurá tus propias alícuotas por estudio, empresa o convenio (con vigencias).
              Si no hay tipos cargados, el sistema usa los valores legales por defecto (Decreto 814/2001 PyME).
            </div>
            <div className="flex gap-2">
              <button onClick={cargarFallback} className="btn-secondary text-sm">
                <ArrowDownTrayIcon className="w-4 h-4" /> Cargar tabla legal 2026
              </button>
              <button onClick={() => setModal({ modo: 'crear' })} className="btn-primary text-sm">
                <PlusIcon className="w-4 h-4" /> Nuevo tipo
              </button>
            </div>
          </div>

          {/* Vigentes ahora */}
          <div className="card p-4">
            <h2 className="font-semibold text-gray-700 text-sm mb-3">Vigentes hoy ({tipos.length})</h2>
            {tipos.length === 0 ? (
              <p className="text-xs text-gray-400">Sin configuración propia. Se usa la tabla legal por defecto.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {tipos.map(t => (
                  <div key={t.codigo} className="border rounded-lg p-2 text-xs bg-gray-50">
                    <p className="font-bold text-xs text-gray-900 truncate" title={t.nombre}>{t.codigo}</p>
                    <p className="text-2xl font-bold text-orange-700 mt-1">{(Number(t.alicuota) * 100).toFixed(2)}%</p>
                    <p className="text-gray-500 mt-1">{t.base.replace(/_/g, ' ')}</p>
                    {t._source === 'fallback' && <p className="text-[10px] text-orange-600 mt-1">⚠ Default legal</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historial */}
          <div className="card">
            <div className="px-5 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-700 text-sm">Historial completo ({historialTipos.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-2 text-left">Código</th>
                    <th className="px-5 py-2 text-left">Nombre</th>
                    <th className="px-5 py-2 text-right">Alícuota</th>
                    <th className="px-5 py-2 text-left">Base</th>
                    <th className="px-5 py-2 text-left">Vigencia</th>
                    <th className="px-5 py-2 text-left">Alcance</th>
                    <th className="px-5 py-2 text-center w-20">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historialTipos.map(t => {
                    const empresa = empresas.find(e => e.id === t.empresaId);
                    const convenio = convenios.find(c => c.id === t.convenioId);
                    return (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-5 py-2 font-mono text-xs">{t.codigo}</td>
                        <td className="px-5 py-2 text-gray-700">{t.nombre}</td>
                        <td className="px-5 py-2 text-right font-semibold text-orange-700">{(Number(t.alicuota) * 100).toFixed(2)}%</td>
                        <td className="px-5 py-2 text-xs text-gray-500">{t.base.replace(/_/g, ' ')}</td>
                        <td className="px-5 py-2 text-xs text-gray-500">
                          {new Date(t.vigenciaDesde).toLocaleDateString('es-AR')}
                          {t.vigenciaHasta && ` → ${new Date(t.vigenciaHasta).toLocaleDateString('es-AR')}`}
                        </td>
                        <td className="px-5 py-2 text-xs">
                          {empresa ? <span className="badge-blue">{empresa.razonSocial}</span>
                            : convenio ? <span className="badge-yellow">{convenio.codigo}</span>
                            : <span className="badge-gray">Todo el estudio</span>}
                        </td>
                        <td className="px-5 py-2 text-center">
                          <button onClick={() => setModal({ modo: 'editar', fila: t })} className="text-blue-500 hover:text-blue-700 mr-2">
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => eliminarTipo(t)} className="text-red-500 hover:text-red-700">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {historialTipos.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                      Sin tipos cargados. Usá "Cargar tabla legal 2026" para empezar.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <Modal open onClose={() => setModal(null)} title={modal.modo === 'editar' ? 'Editar tipo de contribución' : 'Nuevo tipo de contribución'} size="lg">
          <TipoForm
            inicial={modal.fila}
            empresas={empresas}
            convenios={convenios}
            onCancel={() => setModal(null)}
            onSave={() => { setModal(null); cargarTipos(); }}
          />
        </Modal>
      )}
    </div>
  );
}
