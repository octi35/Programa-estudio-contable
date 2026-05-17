import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '../../components/Modal';
import ImportExcelButton from '../../components/ImportExcelButton';
import { useForm } from 'react-hook-form';

const CONDICION_IVA = ['RESPONSABLE_INSCRIPTO','MONOTRIBUTISTA','EXENTO','CONSUMIDOR_FINAL','NO_RESPONSABLE'];
const TIPO_PERSONA = ['PROVEEDOR','CLIENTE','AMBOS'];

function ProveedorForm({ item, empresas, defaultEmpresaId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: item || { empresaId: defaultEmpresaId, tipo: 'PROVEEDOR', condicionIVA: 'RESPONSABLE_INSCRIPTO', activo: true },
  });

  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      if (item?.id) { await api.put(`/iva/proveedores/${item.id}`, data); toast.success('Actualizado'); }
      else { await api.post('/iva/proveedores', data); toast.success('Creado'); }
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
          <label className={lbl}>Empresa *</label>
          <select {...register('empresaId', { required: true })} className={inp}>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Tipo *</label>
          <select {...register('tipo')} className={inp}>
            {TIPO_PERSONA.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Condición IVA *</label>
          <select {...register('condicionIVA')} className={inp}>
            {CONDICION_IVA.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={lbl}>Razón Social *</label>
          <input {...register('razonSocial', { required: true })} className={inp} />
        </div>
        <div>
          <label className={lbl}>CUIT</label>
          <input {...register('cuit')} className={inp} placeholder="XX-XXXXXXXX-X" />
        </div>
        <div>
          <label className={lbl}>Email</label>
          <input type="email" {...register('email')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Teléfono</label>
          <input {...register('telefono')} className={inp} />
        </div>
        <div>
          <label className={lbl}>Localidad</label>
          <input {...register('localidad')} className={inp} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (item ? 'Actualizar' : 'Crear')}
        </button>
      </div>
    </form>
  );
}

export default function ProveedoresClientes() {
  const [lista, setLista] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [tipo, setTipo] = useState('');
  const [buscar, setBuscar] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const fetchEmpresas = async () => {
    const { data } = await api.get('/empresas', { params: { limit: 200 } });
    setEmpresas(data.data || []);
    if (data.data?.length > 0) setEmpresaId(data.data[0].id);
  };

  const fetchLista = async () => {
    const { data } = await api.get('/iva/proveedores', { params: { empresaId, tipo, buscar } });
    setLista(data || []);
  };

  useEffect(() => { fetchEmpresas(); }, []);
  useEffect(() => { if (empresaId) fetchLista(); }, [empresaId, tipo, buscar]);

  const badgeTipo = (t) => ({
    PROVEEDOR: 'bg-blue-100 text-blue-700', CLIENTE: 'bg-green-100 text-green-700', AMBOS: 'bg-purple-100 text-purple-700',
  })[t] || 'bg-gray-100 text-gray-600';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Proveedores / Clientes</h1>
        <div className="flex gap-2 flex-wrap">
          {empresaId && (
            <ImportExcelButton
              endpoint="/iva/proveedores/importar"
              label="Importar Excel"
              title="Importar proveedores / clientes"
              extraData={{ empresaId }}
              columnas={[
                { nombre: 'razon_social', descripcion: 'Razón social', requerido: true },
                { nombre: 'cuit', descripcion: 'CUIT (con o sin guiones)' },
                { nombre: 'tipo', descripcion: 'PROVEEDOR / CLIENTE / AMBOS' },
                { nombre: 'condicion_iva', descripcion: 'RESPONSABLE_INSCRIPTO, MONOTRIBUTISTA, EXENTO, CONSUMIDOR_FINAL, NO_RESPONSABLE' },
                { nombre: 'email', descripcion: 'Email de contacto' },
                { nombre: 'telefono', descripcion: 'Teléfono' },
                { nombre: 'domicilio', descripcion: 'Dirección' },
              ]}
              ejemplo="ACME SA, 30712345678, PROVEEDOR, RESPONSABLE_INSCRIPTO, ventas@acme.com"
              onSuccess={() => fetchLista()}
            />
          )}
          <button onClick={() => { setEditando(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <PlusIcon className="w-4 h-4" /> Nuevo
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Todos</option>
          {TIPO_PERSONA.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar..."
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[150px]" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Razón Social</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">CUIT</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Condición IVA</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Contacto</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lista.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{p.razonSocial}</td>
                <td className="px-4 py-3 font-mono text-gray-600">{p.cuit || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeTipo(p.tipo)}`}>{p.tipo}</span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{p.condicionIVA?.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{p.email || p.telefono || '—'}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => { setEditando(p); setShowForm(true); }}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <div className="p-8 text-center text-gray-400">No hay registros</div>}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar' : 'Nuevo Proveedor/Cliente'}>
          <ProveedorForm item={editando} empresas={empresas} defaultEmpresaId={empresaId}
            onSave={() => { setShowForm(false); fetchLista(); }}
            onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}
