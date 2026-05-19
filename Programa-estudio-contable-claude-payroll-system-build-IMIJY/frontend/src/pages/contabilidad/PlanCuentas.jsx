import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Modal from '../../components/Modal';
import { confirm } from '../../components/confirm';
import { useForm } from 'react-hook-form';

const TIPOS = ['ACTIVO','PASIVO','PATRIMONIO_NETO','RESULTADO_POSITIVO','RESULTADO_NEGATIVO'];
const NATURALEZAS = ['DEUDORA','ACREEDORA'];

const badgeTipo = (tipo) => {
  const map = {
    ACTIVO: 'bg-blue-100 text-blue-700',
    PASIVO: 'bg-red-100 text-red-700',
    PATRIMONIO_NETO: 'bg-green-100 text-green-700',
    RESULTADO_POSITIVO: 'bg-emerald-100 text-emerald-700',
    RESULTADO_NEGATIVO: 'bg-orange-100 text-orange-700',
  };
  return map[tipo] || 'bg-gray-100 text-gray-600';
};

function CuentaForm({ cuenta, empresas, cuentas, defaultEmpresaId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: cuenta || {
      empresaId: defaultEmpresaId, tipo: 'ACTIVO', naturaleza: 'DEUDORA',
      nivel: 1, permiteMovimientos: true, activa: true,
    },
  });

  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      if (cuenta?.id) { await api.put(`/contabilidad/cuentas/${cuenta.id}`, data); toast.success('Cuenta actualizada'); }
      else { await api.post('/contabilidad/cuentas', data); toast.success('Cuenta creada'); }
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
          <label className={lbl}>Código *</label>
          <input {...register('codigo', { required: true })} className={inp} placeholder="1.1.01" />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Nombre *</label>
          <input {...register('nombre', { required: true })} className={inp} />
        </div>
        <div>
          <label className={lbl}>Tipo *</label>
          <select {...register('tipo')} className={inp}>
            {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Naturaleza *</label>
          <select {...register('naturaleza')} className={inp}>
            {NATURALEZAS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Cuenta padre</label>
          <select {...register('cuentaPadreId')} className={inp}>
            <option value="">Sin padre (cuenta mayor)</option>
            {cuentas.filter(c => c.id !== cuenta?.id).map(c => (
              <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>Nivel</label>
          <input type="number" min="1" max="5" {...register('nivel', { valueAsNumber: true })} className={inp} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" {...register('permiteMovimientos')} id="permMov" />
          <label htmlFor="permMov" className="text-sm text-gray-700">Permite movimientos</label>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (cuenta ? 'Actualizar' : 'Crear Cuenta')}
        </button>
      </div>
    </form>
  );
}

export default function PlanCuentas() {
  const [cuentas, setCuentas] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [buscar, setBuscar] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const fetchEmpresas = async () => {
    const { data } = await api.get('/empresas', { params: { limit: 200 } });
    setEmpresas(data.data || []);
    if (data.data?.length > 0) setEmpresaId(data.data[0].id);
  };

  const fetchCuentas = async () => {
    if (!empresaId) return;
    const { data } = await api.get('/contabilidad/cuentas', { params: { empresaId, tipo: tipoFiltro, buscar } });
    setCuentas(data || []);
  };

  useEffect(() => { fetchEmpresas(); }, []);
  useEffect(() => { if (empresaId) fetchCuentas(); }, [empresaId, tipoFiltro, buscar]);

  const handleEliminar = async (id) => {
    if (!await confirm({
      title: 'Eliminar cuenta contable',
      message: 'Se eliminará la cuenta del plan de cuentas.',
      details: 'No se podrá eliminar si la cuenta tiene asientos registrados o cuentas hijas asociadas.',
      confirmText: 'Eliminar',
      danger: true,
    })) return;
    try {
      await api.delete(`/contabilidad/cuentas/${id}`);
      toast.success('Cuenta eliminada');
      fetchCuentas();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al eliminar'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Plan de Cuentas</h1>
        <button onClick={() => { setEditando(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <PlusIcon className="w-4 h-4" /> Nueva Cuenta
        </button>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
        </select>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar código o nombre..."
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[150px]" />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Naturaleza</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Cuenta Padre</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Mov.</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cuentas.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium text-gray-800">{c.codigo}</td>
                <td className="px-4 py-3" style={{ paddingLeft: `${(c.nivel - 1) * 20 + 16}px` }}>
                  {c.nivel > 1 && <ChevronRightIcon className="w-3 h-3 inline mr-1 text-gray-400" />}
                  {c.nombre}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeTipo(c.tipo)}`}>
                    {c.tipo.replace(/_/g,' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.naturaleza}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.cuentaPadre?.codigo ? `${c.cuentaPadre.codigo} — ${c.cuentaPadre.nombre}` : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`w-2 h-2 rounded-full inline-block ${c.permiteMovimientos ? 'bg-green-400' : 'bg-gray-300'}`} />
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => { setEditando(c); setShowForm(true); }}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEliminar(c.id)}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cuentas.length === 0 && <div className="p-8 text-center text-gray-400">Sin cuentas. Creá el plan de cuentas.</div>}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar Cuenta' : 'Nueva Cuenta Contable'}>
          <CuentaForm cuenta={editando} empresas={empresas} cuentas={cuentas} defaultEmpresaId={empresaId}
            onSave={() => { setShowForm(false); fetchCuentas(); }}
            onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}
