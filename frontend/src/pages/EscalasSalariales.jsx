import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowTrendingUpIcon, ArrowUpTrayIcon, BoltIcon, BanknotesIcon,
  CheckCircleIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import api from '../api/client';
import Modal from '../components/Modal';
import { confirm } from '../components/confirm';
import { formatMoney, MESES, aniosRecientes, mesNombre } from '../utils/format';

const anioActual = new Date().getFullYear();
const mesActual = new Date().getMonth() + 1;

export default function EscalasSalariales() {
  const [convenios, setConvenios] = useState([]);
  const [convenioId, setConvenioId] = useState('');
  const [escala, setEscala] = useState([]);
  const [loading, setLoading] = useState(false);

  // Importación
  const [archivo, setArchivo] = useState(null);
  const [vigenciaDesde, setVigenciaDesde] = useState(new Date().toISOString().slice(0, 10));
  const [importando, setImportando] = useState(false);

  // Aplicar a empleados
  const [preview, setPreview] = useState(null);
  const [aplicando, setAplicando] = useState(false);

  // Retroactivo
  const [retro, setRetro] = useState({ anioDesde: anioActual, mesDesde: Math.max(1, mesActual - 1), anioHasta: anioActual, mesHasta: Math.max(1, mesActual - 1) });
  const [retroResultado, setRetroResultado] = useState(null);
  const [calculandoRetro, setCalculandoRetro] = useState(false);

  useEffect(() => {
    api.get('/convenios').then(r => {
      setConvenios(r.data || []);
      if (r.data?.length) setConvenioId(r.data[0].id);
    });
  }, []);

  const cargarEscala = async () => {
    if (!convenioId) return;
    setLoading(true);
    setPreview(null);
    setRetroResultado(null);
    try {
      const r = await api.get(`/convenios/${convenioId}/tabla-sueldo`, { params: { vigente: 'true' } });
      setEscala(r.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { cargarEscala(); }, [convenioId]);

  const importar = async () => {
    if (!archivo) { toast.error('Seleccioná el archivo de la escala'); return; }
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('vigenciaDesde', vigenciaDesde);
      const r = await api.post(`/convenios/${convenioId}/escalas/importar`, fd);
      toast.success(`Escala importada: ${r.data.creadas} categorías nuevas, ${r.data.actualizadas} actualizadas`);
      setArchivo(null);
      cargarEscala();
    } catch (_) { /* interceptor */ }
    finally { setImportando(false); }
  };

  const previsualizarAplicar = async () => {
    setAplicando(true);
    try {
      const r = await api.post(`/convenios/${convenioId}/escalas/aplicar`, { dryRun: true });
      setPreview(r.data);
      if (r.data.cambios.length === 0) toast('Ningún empleado requiere actualización', { icon: 'ℹ️' });
    } catch (_) {}
    finally { setAplicando(false); }
  };

  const aplicar = async () => {
    if (!await confirm({
      title: 'Aplicar escala a los empleados',
      message: `Se actualizará el básico de ${preview.cambios.length} empleado(s) según la escala vigente y se registrará la novedad de modificación salarial en cada legajo.`,
      details: 'Las liquidaciones ya generadas no se modifican. Usá la sección Retroactivo si hay meses liquidados con el básico viejo.',
      confirmText: `Actualizar ${preview.cambios.length} básicos`,
    })) return;
    setAplicando(true);
    try {
      const r = await api.post(`/convenios/${convenioId}/escalas/aplicar`, { dryRun: false });
      toast.success(`${r.data.cambios.length} básicos actualizados`);
      setPreview(null);
    } catch (_) {}
    finally { setAplicando(false); }
  };

  const calcularRetro = async (crear) => {
    if (crear && !await confirm({
      title: 'Crear novedades de retroactivo',
      message: `Se creará una novedad por empleado con la diferencia total del rango ${retro.mesDesde}/${retro.anioDesde} → ${retro.mesHasta}/${retro.anioHasta}, lista para incluir como haber en la próxima liquidación.`,
      confirmText: 'Crear novedades',
    })) return;
    setCalculandoRetro(true);
    try {
      const r = await api.post(`/convenios/${convenioId}/escalas/retroactivo`, { ...retro, crear });
      setRetroResultado(r.data);
      if (crear) toast.success(`${r.data.novedadesCreadas} novedades de retroactivo creadas`);
    } catch (_) {}
    finally { setCalculandoRetro(false); }
  };

  const convenio = convenios.find(c => c.id === convenioId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowTrendingUpIcon className="w-7 h-7 text-blue-600" />
          Escalas Salariales (Paritarias)
        </h1>
        <p className="text-gray-500 text-sm">
          Importá la escala nueva, aplicala a toda la nómina del convenio y calculá el retroactivo en minutos
        </p>
      </div>

      {/* Selector de convenio */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <select className="input w-80" value={convenioId} onChange={e => setConvenioId(e.target.value)}>
          {convenios.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
        </select>
        {convenio && (
          <span className="text-xs text-gray-500">
            {convenio._count?.empleados ?? 0} empleados en este convenio
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Escala vigente */}
        <div className="card">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <BanknotesIcon className="w-4 h-4 text-gray-400" /> Escala vigente hoy ({escala.length} categorías)
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : escala.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-sm">Sin escala cargada. Importá la primera con el formulario de la derecha.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-2 text-left">Categoría</th>
                  <th className="px-5 py-2 text-right">Básico</th>
                  <th className="px-5 py-2 text-left">Vigencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {escala.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2 font-medium text-gray-900">{f.categoria}</td>
                    <td className="px-5 py-2 text-right font-bold text-green-700">{formatMoney(f.basicoMensual)}</td>
                    <td className="px-5 py-2 text-xs text-gray-500">desde {new Date(f.vigenciaDesde).toLocaleDateString('es-AR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Importar + aplicar */}
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <ArrowUpTrayIcon className="w-4 h-4 text-gray-400" /> Importar escala nueva
            </h2>
            <p className="text-xs text-gray-500">
              Excel o CSV con columnas: <span className="font-mono bg-gray-100 px-1 rounded">categoria | basico | descripcion</span> (primera fila = encabezado)
            </p>
            <input type="file" accept=".xlsx,.csv" className="text-sm w-full"
              onChange={e => setArchivo(e.target.files?.[0] || null)} />
            <div className="flex items-end gap-3">
              <div>
                <label className="label">Vigencia desde</label>
                <input type="date" className="input" value={vigenciaDesde} onChange={e => setVigenciaDesde(e.target.value)} />
              </div>
              <button onClick={importar} disabled={importando || !archivo} className="btn-primary text-sm">
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <BoltIcon className="w-4 h-4 text-gray-400" /> Aplicar a la nómina
            </h2>
            <p className="text-xs text-gray-500">
              Actualiza el básico de todos los empleados activos del convenio cuya categoría coincida con la escala vigente.
            </p>
            <button onClick={previsualizarAplicar} disabled={aplicando || escala.length === 0} className="btn-secondary text-sm">
              {aplicando && !preview ? 'Analizando...' : 'Previsualizar cambios'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview de aplicación */}
      {preview && preview.cambios.length > 0 && (
        <div className="card">
          <div className="px-5 py-3 border-b bg-blue-50 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-blue-900 text-sm">
              {preview.cambios.length} empleado(s) a actualizar
              {preview.sinCategoria.length > 0 && <span className="ml-2 text-amber-700 font-normal">· {preview.sinCategoria.length} sin categoría coincidente</span>}
              {preview.sinCambio > 0 && <span className="ml-2 text-gray-500 font-normal">· {preview.sinCambio} ya al día</span>}
            </h2>
            <button onClick={aplicar} disabled={aplicando} className="btn-primary text-sm">
              <CheckCircleIcon className="w-4 h-4" /> Confirmar y aplicar
            </button>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="px-5 py-2 text-left">Empleado</th>
                  <th className="px-5 py-2 text-left">Empresa</th>
                  <th className="px-5 py-2 text-left">Categoría</th>
                  <th className="px-5 py-2 text-right">Básico actual</th>
                  <th className="px-5 py-2 text-right">Básico nuevo</th>
                  <th className="px-5 py-2 text-right">Variación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.cambios.map(c => (
                  <tr key={c.empleadoId} className="hover:bg-gray-50">
                    <td className="px-5 py-2 font-medium text-gray-900">{c.empleado}</td>
                    <td className="px-5 py-2 text-xs text-gray-500">{c.empresa}</td>
                    <td className="px-5 py-2 text-xs">{c.categoria}</td>
                    <td className="px-5 py-2 text-right text-gray-500">{formatMoney(c.basicoAnterior)}</td>
                    <td className="px-5 py-2 text-right font-bold text-green-700">{formatMoney(c.basicoNuevo)}</td>
                    <td className="px-5 py-2 text-right text-xs font-semibold text-blue-700">
                      {c.variacion != null ? `${c.variacion > 0 ? '+' : ''}${c.variacion}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Retroactivo */}
      <div className="card">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-700 text-sm">Retroactivo de paritaria</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            Compara los meses ya liquidados con el básico viejo contra la escala vigente y calcula la diferencia.
            Podés crear las novedades para incluirlas como haber en la próxima liquidación.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Desde</label>
              <div className="flex gap-2">
                <select className="input w-32" value={retro.mesDesde} onChange={e => setRetro(r => ({ ...r, mesDesde: +e.target.value }))}>
                  {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select className="input w-24" value={retro.anioDesde} onChange={e => setRetro(r => ({ ...r, anioDesde: +e.target.value }))}>
                  {aniosRecientes(3, 0).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Hasta</label>
              <div className="flex gap-2">
                <select className="input w-32" value={retro.mesHasta} onChange={e => setRetro(r => ({ ...r, mesHasta: +e.target.value }))}>
                  {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
                <select className="input w-24" value={retro.anioHasta} onChange={e => setRetro(r => ({ ...r, anioHasta: +e.target.value }))}>
                  {aniosRecientes(3, 0).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => calcularRetro(false)} disabled={calculandoRetro} className="btn-secondary text-sm">
              {calculandoRetro ? 'Calculando...' : 'Calcular'}
            </button>
            {retroResultado && retroResultado.detalle.length > 0 && (
              <button onClick={() => calcularRetro(true)} disabled={calculandoRetro} className="btn-primary text-sm">
                Crear novedades ({formatMoney(retroResultado.totalGeneral)})
              </button>
            )}
          </div>

          {retroResultado && (
            retroResultado.detalle.length === 0 ? (
              <p className="text-sm text-gray-400">Sin diferencias: los períodos del rango ya fueron liquidados con la escala vigente.</p>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">Empleado</th>
                      <th className="px-4 py-2 text-left">Empresa</th>
                      <th className="px-4 py-2 text-center">Meses</th>
                      <th className="px-4 py-2 text-right">Retroactivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {retroResultado.detalle.map(e => (
                      <tr key={e.empleadoId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{e.empleado}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{e.empresa}</td>
                        <td className="px-4 py-2 text-center text-xs">
                          {e.meses.map(m => `${mesNombre(m.mes).slice(0, 3)}/${String(m.anio).slice(2)}`).join(', ')}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-green-700">{formatMoney(e.total)}</td>
                      </tr>
                    ))}
                    <tr className="bg-green-50 font-bold">
                      <td className="px-4 py-2.5 text-green-900" colSpan={3}>TOTAL RETROACTIVO ({retroResultado.empleadosConRetro} empleados)</td>
                      <td className="px-4 py-2.5 text-right text-green-900">{formatMoney(retroResultado.totalGeneral)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
