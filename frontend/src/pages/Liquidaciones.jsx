import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalculatorIcon, PlayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';
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

export default function Liquidaciones() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const empresaIdFiltro = searchParams.get('empresaId');
  const empleadoIdFiltro = searchParams.get('empleadoId');

  const [liquidaciones, setLiquidaciones] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [filtros, setFiltros] = useState({
    empresaId: empresaIdFiltro || '',
    empleadoId: empleadoIdFiltro || '',
    anio: anioActual,
    mes: mesActual,
  });

  const cargar = async () => {
    setLoading(true);
    const params = {};
    if (filtros.empresaId) params.empresaId = filtros.empresaId;
    if (filtros.empleadoId) params.empleadoId = filtros.empleadoId;
    if (filtros.anio) params.anio = filtros.anio;
    if (filtros.mes) params.mes = filtros.mes;

    const [liqRes, empRes] = await Promise.all([
      api.get('/liquidaciones', { params }),
      api.get('/empresas'),
    ]);
    setLiquidaciones(liqRes.data.data);
    setEmpresas(empRes.data.data);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [JSON.stringify(filtros)]);

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
    window.open(`/api/liquidaciones/${id}/recibo`, '_blank');
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
        <button onClick={() => setModalOpen(true)} className="btn-primary">
          <CalculatorIcon className="w-4 h-4" /> Liquidar período
        </button>
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
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Empleado</th>
                <th className="px-5 py-3 text-left hidden md:table-cell">Empresa</th>
                <th className="px-5 py-3 text-center">Período</th>
                <th className="px-5 py-3 text-center hidden sm:table-cell">Tipo</th>
                <th className="px-5 py-3 text-right">Haberes</th>
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
                      {liq.periodo?.empresaId ? empresas.find(e => e.id === liq.periodo?.empresaId)?.razonSocial : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-center text-gray-700 font-medium">
                      {mesNombre(liq.mes)} {liq.anio}
                    </td>
                    <td className="px-5 py-3.5 text-center hidden sm:table-cell">
                      <span className="badge-gray text-xs">{tipoLiquidacionLabel[liq.tipo] || liq.tipo}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-green-700 font-medium">
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
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Liquidar período" size="md">
        <LiquidarPeriodoForm
          empresas={empresas}
          onSuccess={() => { setModalOpen(false); cargar(); }}
          onClose={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
