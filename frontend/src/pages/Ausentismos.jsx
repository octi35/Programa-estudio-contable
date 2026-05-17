import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { confirm } from '../components/confirm';
import { useForm } from 'react-hook-form';

const TIPOS = [
  { value: 'ENFERMEDAD_INCULPABLE', label: 'Enfermedad inculpable' },
  { value: 'ACCIDENTE_TRABAJO', label: 'Accidente de trabajo' },
  { value: 'LICENCIA_ORDINARIA', label: 'Licencia ordinaria' },
  { value: 'LICENCIA_ESPECIAL', label: 'Licencia especial' },
  { value: 'FALTA_INJUSTIFICADA', label: 'Falta injustificada' },
  { value: 'LICENCIA_MATERNIDAD', label: 'Licencia maternidad' },
  { value: 'LICENCIA_PATERNIDAD', label: 'Licencia paternidad' },
  { value: 'DUELO', label: 'Duelo' },
  { value: 'SUSPENSION_DISCIPLINARIA', label: 'Suspensión disciplinaria' },
  { value: 'OTRO', label: 'Otro' },
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function AusentismoForm({ ausentismo, empleados, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: ausentismo || { justificado: true },
  });

  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      if (ausentismo?.id) { await api.put(`/ausentismos/${ausentismo.id}`, data); toast.success('Actualizado'); }
      else { await api.post('/ausentismos', data); toast.success('Registrado'); }
      onSave();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
    finally { setGuardando(false); }
  };

  const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={lbl}>Empleado *</label>
          <select {...register('empleadoId', { required: true })} className={inp}>
            <option value="">Seleccionar...</option>
            {empleados.map(e => (
              <option key={e.id} value={e.id}>{e.apellido}, {e.nombre} {e.legajoNumero ? `(Leg. ${e.legajoNumero})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>Tipo *</label>
          <select {...register('tipo', { required: true })} className={inp}>
            <option value="">Seleccionar...</option>
            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Días</label>
          <input type="number" min="1" {...register('dias', { valueAsNumber: true })} className={inp} />
        </div>
        <div>
          <label className={lbl}>Fecha inicio *</label>
          <input type="date" {...register('fechaDesde', { required: true })} className={inp} />
        </div>
        <div>
          <label className={lbl}>Fecha fin</label>
          <input type="date" {...register('fechaHasta')} className={inp} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Descripción</label>
          <input {...register('descripcion')} className={inp} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" {...register('justificado')} id="just" defaultChecked />
          <label htmlFor="just" className="text-sm text-gray-700">Justificado</label>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (ausentismo ? 'Actualizar' : 'Registrar')}
        </button>
      </div>
    </form>
  );
}

export default function Ausentismos() {
  const [ausentismos, setAusentismos] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const fetchEmpresas = async () => {
    const { data } = await api.get('/empresas', { params: { limit: 200 } });
    setEmpresas(data.data || []);
    if (data.data?.length > 0) setEmpresaId(data.data[0].id);
  };

  const fetchData = async () => {
    if (!empresaId) return;
    const [ausResp, empResp] = await Promise.all([
      api.get('/ausentismos', { params: { empresaId, anio, mes } }),
      api.get('/empleados', { params: { empresaId, activo: true, limit: 200 } }),
    ]);
    setAusentismos(ausResp.data || []);
    setEmpleados(empResp.data?.data || []);
  };

  useEffect(() => { fetchEmpresas(); }, []);
  useEffect(() => { if (empresaId) fetchData(); }, [empresaId, anio, mes]);

  const handleEliminar = async (id) => {
    if (!await confirm({
      title: 'Eliminar ausentismo',
      message: 'Se eliminará el registro de ausentismo del empleado.',
      details: 'Esta acción no se puede deshacer. Si el ausentismo afecta a una liquidación ya emitida, deberá recalcularse.',
      confirmText: 'Eliminar',
      danger: true,
    })) return;
    try {
      await api.delete(`/ausentismos/${id}`);
      toast.success('Eliminado');
      fetchData();
    } catch { toast.error('Error al eliminar'); }
  };

  const badgeTipo = (tipo) => {
    const map = {
      FALTA_INJUSTIFICADA: 'bg-red-100 text-red-700',
      ENFERMEDAD_INCULPABLE: 'bg-yellow-100 text-yellow-700',
      ACCIDENTE_TRABAJO: 'bg-orange-100 text-orange-700',
      LICENCIA_MATERNIDAD: 'bg-pink-100 text-pink-700',
      LICENCIA_PATERNIDAD: 'bg-blue-100 text-blue-700',
    };
    return map[tipo] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ausentismos</h1>
        <button onClick={() => { setEditando(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <PlusIcon className="w-4 h-4" /> Registrar
        </button>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <input type="number" value={anio} onChange={e => setAnio(parseInt(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm w-24" placeholder="Año" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Empleado</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Desde</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Hasta</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Días</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Just.</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Descripción</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ausentismos.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{a.empleado?.apellido}, {a.empleado?.nombre}</p>
                  {a.empleado?.legajoNumero && <p className="text-xs text-gray-400">Leg. {a.empleado.legajoNumero}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeTipo(a.tipo)}`}>
                    {TIPOS.find(t => t.value === a.tipo)?.label || a.tipo}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDate(a.fechaDesde)}</td>
                <td className="px-4 py-3 text-gray-600">{a.fechaHasta ? formatDate(a.fechaHasta) : '—'}</td>
                <td className="px-4 py-3 text-center font-semibold text-gray-700">{a.dias || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={a.justificado ? 'text-green-600' : 'text-red-500'}>{a.justificado ? '✓' : '✗'}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{a.descripcion || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => { setEditando(a); setShowForm(true); }}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEliminar(a.id)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ausentismos.length === 0 && (
          <div className="p-8 text-center text-gray-400">Sin ausentismos registrados en este período</div>
        )}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar Ausentismo' : 'Registrar Ausentismo'}>
          <AusentismoForm ausentismo={editando} empleados={empleados}
            onSave={() => { setShowForm(false); fetchData(); }}
            onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}
