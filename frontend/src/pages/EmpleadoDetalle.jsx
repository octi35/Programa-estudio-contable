import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, CalculatorIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';
import { formatDate, formatMoney, mesNombre, estadoLiquidacionLabel, tipoLiquidacionLabel } from '../utils/format';

function BajaForm({ onSuccess, onClose }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  return (
    <form onSubmit={handleSubmit(onSuccess)} className="space-y-4">
      <div>
        <label className="label">Fecha de egreso *</label>
        <input type="date" className="input" {...register('fechaEgreso', { required: 'Requerido' })} />
        {errors.fechaEgreso && <p className="text-red-500 text-xs mt-1">{errors.fechaEgreso.message}</p>}
      </div>
      <div>
        <label className="label">Motivo de egreso *</label>
        <select className="input" {...register('motivoEgreso', { required: 'Requerido' })}>
          <option value="">Seleccionar...</option>
          <option value="RENUNCIA">Renuncia</option>
          <option value="DESPIDO_SIN_CAUSA">Despido sin causa</option>
          <option value="DESPIDO_CON_CAUSA">Despido con causa</option>
          <option value="MUTUO_ACUERDO">Mutuo acuerdo</option>
          <option value="JUBILACION">Jubilación</option>
          <option value="FALLECIMIENTO">Fallecimiento</option>
          <option value="VENCIMIENTO_CONTRATO">Vencimiento de contrato</option>
        </select>
        {errors.motivoEgreso && <p className="text-red-500 text-xs mt-1">{errors.motivoEgreso.message}</p>}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-danger">
          {isSubmitting ? 'Procesando...' : 'Registrar baja'}
        </button>
      </div>
    </form>
  );
}

export default function EmpleadoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [empleado, setEmpleado] = useState(null);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bajaModal, setBajaModal] = useState(false);

  const cargar = () =>
    Promise.all([
      api.get(`/empleados/${id}`),
      api.get(`/empleados/${id}/liquidaciones`),
    ]).then(([e, l]) => {
      setEmpleado(e.data);
      setLiquidaciones(l.data);
    }).finally(() => setLoading(false));

  useEffect(() => { cargar(); }, [id]);

  const handleBaja = async (data) => {
    try {
      await api.post(`/empleados/${id}/baja`, data);
      toast.success('Baja registrada correctamente');
      setBajaModal(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar baja');
    }
  };

  if (loading) return (
    <div className="flex justify-center p-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!empleado) return <p className="text-gray-500">Empleado no encontrado</p>;

  const antiguedadAnios = empleado.antiguedadAnios ?? 0;
  const antiguedadMeses = empleado.antiguedadMeses ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-700 flex-shrink-0">
          {empleado.apellido[0]}{empleado.nombre[0]}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{empleado.apellido}, {empleado.nombre}</h1>
          <p className="text-gray-500 text-sm">CUIL: {empleado.cuil} · {empleado.empresa?.razonSocial}</p>
        </div>
        {empleado.activo && (
          <button onClick={() => setBajaModal(true)} className="btn-danger">Registrar baja</button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Datos personales */}
        <div className="card p-5 lg:col-span-2 space-y-5">
          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2">Datos del legajo</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              ['N° Legajo', empleado.legajoNumero || '—'],
              ['DNI', empleado.dni || '—'],
              ['Fecha nacimiento', formatDate(empleado.fechaNacimiento)],
              ['Sexo', empleado.sexo === 'M' ? 'Masculino' : empleado.sexo === 'F' ? 'Femenino' : empleado.sexo || '—'],
              ['Estado civil', empleado.estadoCivil || '—'],
              ['Teléfono', empleado.telefono || '—'],
              ['Email', empleado.email || '—'],
              ['Domicilio', empleado.domicilio || '—'],
              ['Localidad', `${empleado.localidad || '—'}, ${empleado.provincia || ''}`.trim().replace(/,$/, '')],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-400 text-xs mb-0.5">{k}</dt>
                <dd className="font-medium text-gray-900 text-sm">{v}</dd>
              </div>
            ))}
          </div>

          <h2 className="font-semibold text-gray-900 border-b border-gray-100 pb-2 pt-2">Datos laborales</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              ['Empresa', empleado.empresa?.razonSocial],
              ['Fecha ingreso', formatDate(empleado.fechaIngreso)],
              ['Categoría', empleado.categoria || '—'],
              ['Puesto', empleado.puesto || '—'],
              ['Modalidad', empleado.modalidadContrato?.replace(/_/g, ' ')],
              ['Jornada', empleado.jornadaTrabajo?.replace(/_/g, ' ')],
              ['Básico mensual', formatMoney(empleado.basicoMensual)],
              ['Obra social', empleado.obraSocialNombre || '—'],
              ['CBU', empleado.cbu || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-400 text-xs mb-0.5">{k}</dt>
                <dd className="font-medium text-gray-900 text-sm">{v}</dd>
              </div>
            ))}
          </div>

          {!empleado.activo && empleado.fechaEgreso && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-red-800">Empleado dado de baja</p>
              <p className="text-red-600">Fecha egreso: {formatDate(empleado.fechaEgreso)} · Motivo: {empleado.motivoEgreso?.replace(/_/g, ' ')}</p>
            </div>
          )}
        </div>

        {/* Stats y novedades */}
        <div className="space-y-4">
          <div className="card p-5 text-center">
            <p className="text-3xl font-bold text-blue-700">{antiguedadAnios}</p>
            <p className="text-sm text-gray-600 mt-1">años de antigüedad</p>
            <p className="text-xs text-gray-400">{antiguedadMeses % 12} meses adicionales</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-2xl font-bold text-green-700">{formatMoney(empleado.basicoMensual)}</p>
            <p className="text-sm text-gray-600 mt-1">Básico mensual</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-2xl font-bold text-purple-700">{liquidaciones.length}</p>
            <p className="text-sm text-gray-600 mt-1">Liquidaciones históricas</p>
          </div>

          {/* Novedades */}
          {empleado.novedades?.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">Novedades recientes</h3>
              <div className="space-y-2">
                {empleado.novedades.map(n => (
                  <div key={n.id} className="text-xs border-l-2 border-blue-300 pl-2">
                    <p className="font-medium text-gray-700">{n.tipo.replace(/_/g, ' ')}</p>
                    <p className="text-gray-500">{n.descripcion}</p>
                    <p className="text-gray-400">{formatDate(n.fechaDesde)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Historial liquidaciones */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Historial de liquidaciones</h2>
          <button
            onClick={() => navigate(`/liquidaciones?empleadoId=${id}`)}
            className="btn-primary text-xs py-1.5">
            <CalculatorIcon className="w-3.5 h-3.5" /> Nueva liquidación
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Período</th>
                <th className="px-5 py-3 text-left">Tipo</th>
                <th className="px-5 py-3 text-right">Haberes</th>
                <th className="px-5 py-3 text-right">Descuentos</th>
                <th className="px-5 py-3 text-right">Neto</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-center">Recibo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {liquidaciones.map(liq => {
                const est = estadoLiquidacionLabel[liq.estado] || { label: liq.estado, cls: 'badge-gray' };
                return (
                  <tr key={liq.id} className="table-row-hover"
                    onClick={() => navigate(`/liquidaciones/${liq.id}`)}>
                    <td className="px-5 py-3 font-medium">{mesNombre(liq.mes)} {liq.anio}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{tipoLiquidacionLabel[liq.tipo] || liq.tipo}</td>
                    <td className="px-5 py-3 text-right text-green-700 font-medium">{formatMoney(liq.totalHaberes)}</td>
                    <td className="px-5 py-3 text-right text-red-600">{formatMoney(liq.totalDescuentos)}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{formatMoney(liq.totalNeto)}</td>
                    <td className="px-5 py-3 text-center"><span className={est.cls}>{est.label}</span></td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          window.open(`/api/liquidaciones/${liq.id}/recibo`, '_blank');
                        }}
                        className="text-blue-600 hover:text-blue-800">
                        <DocumentTextIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {liquidaciones.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">Sin liquidaciones registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={bajaModal} onClose={() => setBajaModal(false)} title="Registrar baja de empleado">
        <BajaForm onSuccess={handleBaja} onClose={() => setBajaModal(false)} />
      </Modal>
    </div>
  );
}
