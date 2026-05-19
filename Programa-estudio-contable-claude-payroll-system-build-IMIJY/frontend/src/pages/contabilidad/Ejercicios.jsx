import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { formatDate } from '../../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import Modal from '../../components/Modal';
import { confirm } from '../../components/confirm';
import { useForm } from 'react-hook-form';

function EjercicioForm({ ejercicio, empresas, defaultEmpresaId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: ejercicio || { empresaId: defaultEmpresaId, estado: 'ABIERTO' },
  });

  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      if (ejercicio?.id) { await api.put(`/contabilidad/ejercicios/${ejercicio.id}`, data); toast.success('Actualizado'); }
      else { await api.post('/contabilidad/ejercicios', data); toast.success('Ejercicio creado'); }
      onSave();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
    finally { setGuardando(false); }
  };

  const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Empresa *</label>
          <select {...register('empresaId', { required: true })} className={inp}>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Nombre *</label>
          <input {...register('nombre', { required: true })} className={inp} placeholder="Ejercicio 2025" />
        </div>
        <div>
          <label className={lbl}>Fecha inicio *</label>
          <input type="date" {...register('fechaInicio', { required: true })} className={inp} />
        </div>
        <div>
          <label className={lbl}>Fecha cierre</label>
          <input type="date" {...register('fechaCierre')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Estado</label>
          <select {...register('estado')} className={inp}>
            <option value="ABIERTO">Abierto</option>
            <option value="CERRADO">Cerrado</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (ejercicio ? 'Actualizar' : 'Crear Ejercicio')}
        </button>
      </div>
    </form>
  );
}

export default function Ejercicios() {
  const [ejercicios, setEjercicios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cerrando, setCerrando] = useState(null);

  const cerrarEjercicio = async (e) => {
    if (!await confirm({
      title: `Cerrar ejercicio "${e.nombre}"`,
      message: 'Se generará el asiento de CIERRE automáticamente, cancelando todas las cuentas de resultado contra el resultado del ejercicio.',
      details: [
        'No se podrán cargar nuevos asientos en este ejercicio.',
        'No se podrán modificar los asientos existentes.',
        'Esta acción no se puede deshacer.',
      ],
      confirmText: 'Cerrar ejercicio',
      requireText: 'CERRAR',
      danger: true,
    })) return;
    setCerrando(e.id);
    try {
      const { data } = await api.post(`/contabilidad/ejercicios/${e.id}/cerrar`);
      toast.success(`Ejercicio cerrado${data.asientoCierreId ? ' — asiento de cierre generado' : ''}`);
      fetchEjercicios();
    } catch (err) { toast.error(err.response?.data?.error || 'Error al cerrar ejercicio'); }
    finally { setCerrando(null); }
  };

  const fetchEmpresas = async () => {
    const { data } = await api.get('/empresas', { params: { limit: 200 } });
    setEmpresas(data.data || []);
    if (data.data?.length > 0) setEmpresaId(data.data[0].id);
  };

  const fetchEjercicios = async () => {
    if (!empresaId) return;
    const { data } = await api.get('/contabilidad/ejercicios', { params: { empresaId } });
    setEjercicios(data || []);
  };

  useEffect(() => { fetchEmpresas(); }, []);
  useEffect(() => { if (empresaId) fetchEjercicios(); }, [empresaId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ejercicios Contables</h1>
        <button onClick={() => { setEditando(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <PlusIcon className="w-4 h-4" /> Nuevo Ejercicio
        </button>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
      </div>

      <div className="grid gap-3">
        {ejercicios.map(e => (
          <div key={e.id} className="bg-white rounded-xl border p-4 flex items-center justify-between hover:border-blue-300 transition-colors">
            <div>
              <p className="font-semibold text-gray-800">{e.nombre}</p>
              <p className="text-sm text-gray-500">
                {formatDate(e.fechaInicio)} → {e.fechaCierre ? formatDate(e.fechaCierre) : 'Abierto'}
              </p>
              <p className="text-xs text-gray-400">{e._count?.asientos || 0} asientos</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${e.estado === 'ABIERTO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {e.estado}
              </span>
              <button onClick={() => { setEditando(e); setShowForm(true); }}
                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Editar">
                <PencilIcon className="w-4 h-4" />
              </button>
              {e.estado === 'ABIERTO' && (
                <button onClick={() => cerrarEjercicio(e)} disabled={cerrando === e.id}
                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded" title="Cerrar ejercicio">
                  <LockClosedIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {ejercicios.length === 0 && (
          <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">
            Sin ejercicios registrados para esta empresa
          </div>
        )}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar Ejercicio' : 'Nuevo Ejercicio'}>
          <EjercicioForm ejercicio={editando} empresas={empresas} defaultEmpresaId={empresaId}
            onSave={() => { setShowForm(false); fetchEjercicios(); }}
            onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}
