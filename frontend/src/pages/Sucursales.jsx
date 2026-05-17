import React, { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { useForm } from 'react-hook-form';

function SucursalForm({ sucursal, empresas, defaultEmpresaId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: sucursal || { empresaId: defaultEmpresaId, activa: true },
  });

  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      if (sucursal?.id) { await api.put(`/sucursales/${sucursal.id}`, data); toast.success('Sucursal actualizada'); }
      else { await api.post('/sucursales', data); toast.success('Sucursal creada'); }
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
          <input {...register('nombre', { required: true })} className={inp} placeholder="Casa Central / Sucursal Norte" />
        </div>
        <div>
          <label className={lbl}>Código</label>
          <input {...register('codigo')} className={inp} placeholder="001" />
        </div>
        <div>
          <label className={lbl}>Teléfono</label>
          <input {...register('telefono')} className={inp} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Domicilio</label>
          <input {...register('domicilio')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Localidad</label>
          <input {...register('localidad')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Provincia</label>
          <input {...register('provincia')} className={inp} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (sucursal ? 'Actualizar' : 'Crear Sucursal')}
        </button>
      </div>
    </form>
  );
}

export default function Sucursales() {
  const [sucursales, setSucursales] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const fetchEmpresas = async () => {
    const { data } = await api.get('/empresas', { params: { limit: 200 } });
    setEmpresas(data.data || []);
    if (data.data?.length > 0) setEmpresaId(data.data[0].id);
  };

  const fetchSucursales = async () => {
    const { data } = await api.get('/sucursales', { params: { empresaId } });
    setSucursales(data || []);
  };

  useEffect(() => { fetchEmpresas(); }, []);
  useEffect(() => { if (empresaId) fetchSucursales(); }, [empresaId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sucursales</h1>
        <button onClick={() => { setEditando(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <PlusIcon className="w-4 h-4" /> Nueva Sucursal
        </button>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sucursales.map(s => (
          <div key={s.id} className={`bg-white rounded-xl border p-4 ${!s.activa ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-800">{s.nombre}</p>
                {s.codigo && <p className="text-xs text-gray-400 font-mono">Cód: {s.codigo}</p>}
              </div>
              <div className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded text-xs ${s.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.activa ? 'Activa' : 'Inactiva'}
                </span>
                <button onClick={() => { setEditando(s); setShowForm(true); }}
                  className="p-1 text-gray-400 hover:text-blue-600">
                  <PencilIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            {s.domicilio && <p className="text-sm text-gray-600 mt-2">{s.domicilio}</p>}
            {s.localidad && <p className="text-xs text-gray-500">{s.localidad}{s.provincia ? `, ${s.provincia}` : ''}</p>}
            {s.telefono && <p className="text-xs text-gray-500 mt-1">{s.telefono}</p>}
            <p className="text-xs text-gray-400 mt-2">{s._count?.empleados || 0} empleados asignados</p>
          </div>
        ))}
        {sucursales.length === 0 && (
          <div className="col-span-3 p-8 text-center text-gray-400 bg-white rounded-xl border">
            Sin sucursales. Creá la primera.
          </div>
        )}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar Sucursal' : 'Nueva Sucursal'}>
          <SucursalForm sucursal={editando} empresas={empresas} defaultEmpresaId={empresaId}
            onSave={() => { setShowForm(false); fetchSucursales(); }}
            onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}
