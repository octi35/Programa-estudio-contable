import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalculatorIcon, PlayIcon, DocumentTextIcon, ArrowDownTrayIcon, LockClosedIcon, BoltIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';
import { confirm } from '../components/confirm';
import { openAuthed, downloadWithProgress } from '../utils/download';
import { formatMoney, mesNombre, estadoLiquidacionLabel, tipoLiquidacionLabel, MESES } from '../utils/format';

const anioActual = new Date().getFullYear();
const mesActual = new Date().getMonth() + 1;

function LiquidarPeriodoForm({ empresas, onSuccess, onClose }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { anio: anioActual, mes: mesActual, tipo: 'MENSUAL' },
  });

  const [progreso, setProgreso] = useState(null);

  const onSubmit = async (data) => {
    try {
      setProgreso('Calculando liquidaciones...');
      const res = await api.post('/liquidaciones/periodo', data);
      const { procesados, errores } = res.data;
      toast.success(`Liquidación completada: ${procesados} procesados, ${errores} errores`);
      setProgreso(null);
      onSuccess();
    } catch (err) {
      setProgreso(null);
      toast.error(err.response?.data?.error || 'Error al liquidar');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Empresa *</label>
        <select className="input" {...register('empresaId', { required: 'Requerido' })}>
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        {errors.empresaId && <p className="text-red-500 text-xs mt-1">{errors.empresaId.message}</p>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Tipo *</label>
          <select className="input" {...register('tipo')}>
            <option value="MENSUAL">Sueldo Mensual</option>
            <option value="SAC_JUNIO">SAC 1° Semestre</option>
            <option value="SAC_DICIEMBRE">SAC 2° Semestre</option>
            <option value="VACACIONES">Vacaciones</option>
          </select>
        </div>
        <div>
          <label className="label">Mes *</label>
          <select className="input" {...register('mes', { valueAsNumber: true })}>
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Año *</label>
          <input type="number" className="input" min={2000} max={2099}
            {...register('anio', { required: 'Requerido', valueAsNumber: true })} />
        </div>
      </div>

      {progreso && (
        <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          {progreso}
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
        <strong>Nota:</strong> Esta acción calculará los sueldos de todos los empleados activos de la empresa seleccionada para el período indicado. Si ya existían liquidaciones para ese período, serán recalculadas.
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          <PlayIcon className="w-4 h-4" />
          {isSubmitting ? 'Procesando...' : 'Calcular liquidaciones'}
        </button>
      </div>
    </form>
  );
}

// ── Modal: Calcular batch para todos los empleados pendientes ────────────────
function BatchModal({ empresaId, empresa, anio, mes, onClose, onSuccess }) {
  const [stats, setStats] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    // Pre-cálculo de stats: cuántos están sin liquidar
    api.get('/empleados', { params: { empresaId, activo: true, limit: 500 } })
      .then(async r => {
        const total = r.data.data?.length || 0;
        const liqRes = await api.get('/liquidaciones', { params: { empresaId, anio, mes, limit: 500 } });
        const yaLiq = new Set((liqRes.data.data || []).map(l => l.empleado?.id || l.empleadoId));
        setStats({ total, yaLiquidados: yaLiq.size, pendientes: total - yaLiq.size });
      })
      .catch(() => setStats({ total: 0, yaLiquidados: 0, pendientes: 0 }))
      .finally(() => setLoadingStats(false));
  }, [empresaId, anio, mes]);

  const [progreso, setProgreso] = useState(0);

  const ejecutar = async () => {
    setRunning(true);
    setProgreso(30);
    // Simular progreso: 30% inmediato, +1% cada 200ms hasta 90%
    const interval = setInterval(() => {
      setProgreso(p => (p < 90 ? p + 1 : p));
    }, 200);
    try {
      const res = await api.post('/liquidaciones/calcular-batch', { empresaId, anio, mes });
      setProgreso(100);
      setResult(res.data);
      toast.success(`Batch completado: ${res.data.procesados} procesados, ${res.data.errores.length} errores`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al calcular batch');
    } finally {
      clearInterval(interval);
      setRunning(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
          <p className="font-semibold text-green-800 mb-1">Batch completado</p>
          <p className="text-green-700">Empleados procesados: <strong>{result.procesados}</strong></p>
          <p className="text-green-700">Ya liquidados (omitidos): <strong>{result.yaLiquidados}</strong></p>
          <p className="text-green-700">Errores: <strong>{result.errores.length}</strong></p>
        </div>
        {result.errores.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-48 overflow-y-auto">
            <p className="font-semibold text-red-800 mb-2 text-sm">Errores:</p>
            <ul className="text-xs text-red-700 space-y-1">
              {result.errores.map((e, i) => (
                <li key={i}><strong>{e.nombre}:</strong> {e.error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={() => { onSuccess(); onClose(); }} className="btn-primary">Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
        <p className="font-semibold text-blue-900 mb-1">Calcular liquidaciones para todos los empleados pendientes</p>
        <p className="text-blue-700">Empresa: <strong>{empresa?.razonSocial}</strong></p>
        <p className="text-blue-700">Período: <strong>{mesNombre(mes)} {anio}</strong></p>
      </div>

      {loadingStats ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">Empleados activos</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-green-700">{stats.yaLiquidados}</p>
            <p className="text-xs text-gray-500 mt-1">Ya liquidados</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-yellow-700">{stats.pendientes}</p>
            <p className="text-xs text-gray-500 mt-1">A procesar</p>
          </div>
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
        <strong>Importante:</strong> Esta acción solo calcula liquidaciones para los empleados que aún no tienen
        liquidación MENSUAL en este período. Los empleados ya liquidados no se recalculan.
      </div>

      {running && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Procesando liquidaciones...</span>
            <span>{progreso}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progreso}%` }} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} disabled={running} className="btn-secondary">Cancelar</button>
        <button type="button" onClick={ejecutar} disabled={running || (stats && stats.pendientes === 0)} className="btn-primary">
          <BoltIcon className="w-4 h-4" />
          {running ? 'Procesando...' : `Calcular ${stats?.pendientes || 0} liquidaciones`}
        </button>
      </div>
    </div>
  );
}

// ── Modal: Resumen y cierre de período ───────────────────────────────────────
function ResumenCierreModal({ empresaId, anio, mes, onClose, onSuccess }) {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    api.get('/liquidaciones/resumen-periodo', { params: { empresaId, anio, mes } })
      .then(r => setResumen(r.data))
      .catch(err => toast.error(err.response?.data?.error || 'Error al cargar resumen'))
      .finally(() => setLoading(false));
  }, [empresaId, anio, mes]);

  const confirmar = async () => {
    setCerrando(true);
    try {
      const res = await api.post('/liquidaciones/cerrar-periodo', { empresaId, anio, mes });
      toast.success(`Período cerrado · ${res.data.liquidacionesConfirmadas} liquidaciones confirmadas`);
      if (res.data.f931) toast.success('F.931 generado automáticamente');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cerrar período');
    } finally {
      setCerrando(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!resumen) return <p className="text-red-500 text-sm">No se pudo cargar el resumen</p>;

  const arrow = (v) => {
    if (v == null) return null;
    if (v > 0) return <span className="text-red-600 text-xs ml-1">▲ {v}%</span>;
    if (v < 0) return <span className="text-green-600 text-xs ml-1">▼ {Math.abs(v)}%</span>;
    return <span className="text-gray-400 text-xs ml-1">= 0%</span>;
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
        <p className="font-semibold text-blue-900">{resumen.empresa.razonSocial}</p>
        <p className="text-blue-700">Período: <strong>{mesNombre(mes)} {anio}</strong></p>
      </div>

      <div className="space-y-2 border border-gray-200 rounded-lg p-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Empleados liquidados</span>
          <span className="font-bold">{resumen.actual.cantidad}{arrow(resumen.variacion.cantidad)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total haberes brutos</span>
          <span className="font-bold text-green-700">{formatMoney(resumen.actual.totalHaberes)}{arrow(resumen.variacion.totalHaberes)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total descuentos</span>
          <span className="font-bold text-red-600">{formatMoney(resumen.actual.totalDescuentos)}{arrow(resumen.variacion.totalDescuentos)}</span>
        </div>
        <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
          <span className="text-gray-700 font-medium">Neto a pagar</span>
          <span className="font-bold text-lg">{formatMoney(resumen.actual.totalNeto)}{arrow(resumen.variacion.totalNeto)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Cargas sociales empleador</span>
          <span className="font-bold text-gray-700">{formatMoney(resumen.actual.totalContribuciones)}{arrow(resumen.variacion.totalContribuciones)}</span>
        </div>
      </div>

      {resumen.anterior.cantidad > 0 && (
        <p className="text-xs text-gray-500 text-center">
          Comparativa vs {mesNombre(resumen.anterior.mes)} {resumen.anterior.anio} ({resumen.anterior.cantidad} liquidaciones, {formatMoney(resumen.anterior.totalNeto)} neto)
        </p>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
        <strong>Atención:</strong> Al confirmar se cerrará el período, todas las liquidaciones CALCULADAS quedarán CONFIRMADAS
        y se generará el F.931 automáticamente como documento de la empresa.
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} disabled={cerrando} className="btn-secondary">Cancelar</button>
        <button type="button" onClick={confirmar} disabled={cerrando || resumen.actual.cantidad === 0} className="btn-primary">
          <LockClosedIcon className="w-4 h-4" />
          {cerrando ? 'Cerrando...' : 'Confirmar y cerrar período'}
        </button>
      </div>
    </div>
  );
}

export default function Liquidaciones() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const empresaIdFiltro = searchParams.get('empresaId');
  const empleadoIdFiltro = searchParams.get('empleadoId');

  const [liquidaciones, setLiquidaciones] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [resumenOpen, setResumenOpen] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const [filtros, setFiltros] = useState({
    empresaId: empresaIdFiltro || '',
    empleadoId: empleadoIdFiltro || '',
    anio: anioActual,
    mes: mesActual,
  });

  const cargar = async () => {
    setLoading(true);
    const params = { page: pagination.page, limit: pagination.limit };
    if (filtros.empresaId) params.empresaId = filtros.empresaId;
    if (filtros.empleadoId) params.empleadoId = filtros.empleadoId;
    if (filtros.anio) params.anio = filtros.anio;
    if (filtros.mes) params.mes = filtros.mes;

    const [liqRes, empRes] = await Promise.all([
      api.get('/liquidaciones', { params }),
      api.get('/empresas'),
    ]);
    setLiquidaciones(liqRes.data.data || liqRes.data);
    if (liqRes.data.pagination) {
      setPagination(prev => ({ ...prev, ...liqRes.data.pagination }));
    }
    setEmpresas(empRes.data.data);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [JSON.stringify(filtros), pagination.page, pagination.limit]);

  // Reset page when filters change
  useEffect(() => {
    setPagination(p => ({ ...p, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  const confirmarLiquidacion = async (e, id) => {
    e.stopPropagation();
    try {
      await api.post(`/liquidaciones/${id}/confirmar`);
      toast.success('Liquidación confirmada');
      cargar();
    } catch (err) {
      toast.error('Error al confirmar');
    }
  };

  const abrirRecibo = (e, id) => {
    e.stopPropagation();
    openAuthed(`/api/liquidaciones/${id}/recibo`);
  };

  const enviarRecibosBulk = async () => {
    if (!filtros.empresaId) return;
    const empresa = empresas.find(e => e.id === filtros.empresaId);
    const periodo = `${mesNombre(filtros.mes)} ${filtros.anio}`;
    if (!await confirm({
      title: 'Enviar recibos por email',
      message: `Se enviarán por email los recibos PDF de TODAS las liquidaciones CONFIRMADAS de ${empresa?.razonSocial} para el período ${periodo}.`,
      details: [
        'Solo se envían a empleados que tengan email registrado.',
        'Requiere SMTP configurado en el servidor.',
        'Puede tardar varios minutos según la cantidad de empleados.',
      ],
      confirmText: 'Enviar recibos',
    })) return;

    const toastId = toast.loading('Generando y enviando recibos...');
    try {
      const r = await api.post('/liquidaciones/enviar-recibos-bulk', {
        empresaId: filtros.empresaId,
        anio: Number(filtros.anio),
        mes: Number(filtros.mes),
      });
      const { total, enviados, sinEmail, errores } = r.data;
      toast.success(
        `Enviados: ${enviados}/${total}` +
        (sinEmail > 0 ? ` · Sin email: ${sinEmail}` : '') +
        (errores > 0 ? ` · Errores: ${errores}` : ''),
        { id: toastId, duration: 6000 }
      );
    } catch (_) {
      toast.dismiss(toastId);
      // interceptor mostró el error
    }
  };

  const totalNeto = liquidaciones.reduce((s, l) => s + Number(l.totalNeto), 0);
  const totalHaberes = liquidaciones.reduce((s, l) => s + Number(l.totalHaberes), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Liquidaciones</h1>
          <p className="text-gray-500 text-sm">Gestión de sueldos por período</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {filtros.empresaId && (
            <>
              <button
                onClick={() => downloadWithProgress(`/api/liquidaciones/nomina-excel?empresaId=${filtros.empresaId}&anio=${filtros.anio}&mes=${filtros.mes}`, {
                  filename: `nomina_${filtros.anio}${String(filtros.mes).padStart(2,'0')}.xlsx`,
                  loadingLabel: 'Generando nómina...',
                })}
                className="btn-secondary text-sm">
                <ArrowDownTrayIcon className="w-4 h-4" /> Nómina Excel
              </button>
              <button
                onClick={() => downloadWithProgress(`/api/reportes/f931?empresaId=${filtros.empresaId}&anio=${filtros.anio}&mes=${filtros.mes}`, {
                  filename: `f931_${filtros.anio}${String(filtros.mes).padStart(2,'0')}.xlsx`,
                  loadingLabel: 'Generando F.931...',
                })}
                className="btn-secondary text-sm">
                <ArrowDownTrayIcon className="w-4 h-4" /> F.931 Excel
              </button>
              <button
                onClick={() => downloadWithProgress(`/api/reportes/f931?empresaId=${filtros.empresaId}&anio=${filtros.anio}&mes=${filtros.mes}&formato=txt`, {
                  filename: `f931_sicoss_${filtros.anio}${String(filtros.mes).padStart(2,'0')}.txt`,
                  loadingLabel: 'Generando F.931 TXT...',
                })}
                className="btn-secondary text-sm">
                <ArrowDownTrayIcon className="w-4 h-4" /> F.931 TXT
              </button>
              <button
                onClick={() => downloadWithProgress(`/api/reportes/libro-sueldos?empresaId=${filtros.empresaId}&anio=${filtros.anio}&mes=${filtros.mes}`, {
                  filename: `libro_sueldos_${filtros.anio}${String(filtros.mes).padStart(2,'0')}.xlsx`,
                  loadingLabel: 'Generando Libro Sueldos...',
                })}
                className="btn-secondary text-sm">
                <ArrowDownTrayIcon className="w-4 h-4" /> Libro Sueldos
              </button>
              <button
                onClick={() => downloadWithProgress(`/api/reportes/recibos-bulk?empresaId=${filtros.empresaId}&anio=${filtros.anio}&mes=${filtros.mes}`, {
                  filename: `recibos_${filtros.anio}${String(filtros.mes).padStart(2,'0')}.pdf`,
                  loadingLabel: 'Generando recibos PDF (puede tardar)...',
                })}
                className="btn-secondary text-sm">
                <DocumentTextIcon className="w-4 h-4" /> Todos los Recibos PDF
              </button>
              <button onClick={enviarRecibosBulk} className="btn-secondary text-sm">
                <EnvelopeIcon className="w-4 h-4" /> Enviar recibos por email
              </button>
            </>
          )}
          {filtros.empresaId && (
            <button onClick={() => setBatchOpen(true)} className="btn-secondary text-sm">
              <BoltIcon className="w-4 h-4" /> Calcular Todos
            </button>
          )}
          {filtros.empresaId && (
            <button onClick={() => setResumenOpen(true)} className="btn-secondary text-sm">
              <LockClosedIcon className="w-4 h-4" /> Resumen / Cerrar
            </button>
          )}
          <button onClick={() => setModalOpen(true)} className="btn-primary">
            <CalculatorIcon className="w-4 h-4" /> Liquidar período
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select className="input w-52" value={filtros.empresaId}
          onChange={e => setFiltros(f => ({ ...f, empresaId: e.target.value }))}>
          <option value="">Todas las empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select className="input w-36" value={filtros.mes}
          onChange={e => setFiltros(f => ({ ...f, mes: Number(e.target.value) }))}>
          <option value="">Todos los meses</option>
          {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" className="input w-24" placeholder="Año"
          value={filtros.anio} onChange={e => setFiltros(f => ({ ...f, anio: e.target.value }))} />
        <button onClick={cargar} className="btn-secondary">Buscar</button>
      </div>

      {/* Totales */}
      {liquidaciones.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Liquidaciones', value: liquidaciones.length, color: 'text-blue-700' },
            { label: 'Total haberes', value: formatMoney(totalHaberes), color: 'text-green-700' },
            { label: 'Total neto', value: formatMoney(totalNeto), color: 'text-gray-900' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4 text-center">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="card">
        {loading ? (
          <div className="p-10 text-center">
            <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Empleado</th>
                <th className="px-5 py-3 text-left hidden md:table-cell">Empresa</th>
                <th className="px-5 py-3 text-center hidden sm:table-cell">Período</th>
                <th className="px-5 py-3 text-center hidden sm:table-cell">Tipo</th>
                <th className="px-5 py-3 text-right hidden sm:table-cell">Haberes</th>
                <th className="px-5 py-3 text-right hidden md:table-cell">Descuentos</th>
                <th className="px-5 py-3 text-right">Neto</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liquidaciones.map(liq => {
                const est = estadoLiquidacionLabel[liq.estado] || { label: liq.estado, cls: 'badge-gray' };
                return (
                  <tr key={liq.id} className="table-row-hover"
                    onClick={() => navigate(`/liquidaciones/${liq.id}`)}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">
                        {liq.empleado.apellido}, {liq.empleado.nombre}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">{liq.empleado.cuil}</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs hidden md:table-cell">
                      {liq.periodo?.empresa?.razonSocial || (liq.periodo?.empresaId ? empresas.find(e => e.id === liq.periodo?.empresaId)?.razonSocial : '—')}
                    </td>
                    <td className="px-5 py-3.5 text-center text-gray-700 font-medium hidden sm:table-cell">
                      {mesNombre(liq.mes)} {liq.anio}
                    </td>
                    <td className="px-5 py-3.5 text-center hidden sm:table-cell">
                      <span className="badge-gray text-xs">{tipoLiquidacionLabel[liq.tipo] || liq.tipo}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-green-700 font-medium hidden sm:table-cell">
                      {formatMoney(liq.totalHaberes)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-red-500 hidden md:table-cell">
                      {formatMoney(liq.totalDescuentos)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-gray-900">
                      {formatMoney(liq.totalNeto)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={est.cls}>{est.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {liq.estado === 'CALCULADO' && (
                          <button onClick={e => confirmarLiquidacion(e, liq.id)}
                            className="text-xs text-green-600 hover:text-green-800 font-medium">
                            Confirmar
                          </button>
                        )}
                        <button onClick={e => abrirRecibo(e, liq.id)}
                          title="Ver recibo PDF"
                          className="text-blue-500 hover:text-blue-700">
                          <DocumentTextIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {liquidaciones.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <CalculatorIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">No hay liquidaciones para los filtros seleccionados</p>
                    <button onClick={() => setModalOpen(true)} className="btn-primary mt-4 text-xs">
                      Calcular primera liquidación
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
            <p className="text-sm text-gray-700">
              Mostrando {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
            </p>
            <div className="flex gap-1">
              <button disabled={pagination.page === 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">← Ant</button>
              <span className="px-3 py-1 text-sm">{pagination.page}/{pagination.totalPages}</span>
              <button disabled={pagination.page === pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">Sig →</button>
            </div>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Liquidar período" size="md">
        <LiquidarPeriodoForm
          empresas={empresas}
          onSuccess={() => { setModalOpen(false); cargar(); }}
          onClose={() => setModalOpen(false)}
        />
      </Modal>

      {batchOpen && filtros.empresaId && (
        <Modal open={batchOpen} onClose={() => setBatchOpen(false)} title="Calcular liquidaciones en batch" size="md">
          <BatchModal
            empresaId={filtros.empresaId}
            empresa={empresas.find(e => e.id === filtros.empresaId)}
            anio={Number(filtros.anio)}
            mes={Number(filtros.mes)}
            onClose={() => setBatchOpen(false)}
            onSuccess={cargar}
          />
        </Modal>
      )}

      {resumenOpen && filtros.empresaId && (
        <Modal open={resumenOpen} onClose={() => setResumenOpen(false)} title="Resumen del período y cierre" size="lg">
          <ResumenCierreModal
            empresaId={filtros.empresaId}
            anio={Number(filtros.anio)}
            mes={Number(filtros.mes)}
            onClose={() => setResumenOpen(false)}
            onSuccess={cargar}
          />
        </Modal>
      )}
    </div>
  );
}
