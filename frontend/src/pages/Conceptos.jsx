import React, { useEffect, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';

const TIPOS = ['REMUNERATIVO', 'NO_REMUNERATIVO', 'DEDUCCION', 'APORTE_EMPLEADOR'];
const NATURALEZAS = ['HABER', 'DESCUENTO', 'INFORMATIVO'];
const UNIDADES = ['IMPORTE', 'PORCENTAJE', 'HORAS', 'DIAS', 'CANTIDAD'];

const tipoBadge = {
  REMUNERATIVO: 'badge-green',
  NO_REMUNERATIVO: 'badge-blue',
  DEDUCCION: 'badge-red',
  APORTE_EMPLEADOR: 'badge-yellow',
};

function ConceptoForm({ concepto, convenios, onSuccess, onClose }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: concepto || { tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'IMPORTE', remunerativo: true, imprimible: true, orden: 0 },
  });
  const unidad = watch('unidad');

  const onSubmit = async (data) => {
    try {
      if (concepto) {
        await api.put(`/conceptos/${concepto.id}`, data);
        toast.success('Concepto actualizado');
      } else {
        await api.post('/conceptos', data);
        toast.success('Concepto creado');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Código *</label>
          <input className="input font-mono" {...register('codigo', { required: 'Requerido' })} />
          {errors.codigo && <p className="text-red-500 text-xs mt-1">{errors.codigo.message}</p>}
        </div>
        <div>
          <label className="label">Convenio (opcional)</label>
          <select className="input" {...register('convenioId')}>
            <option value="">General (todos los convenios)</option>
            {convenios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Nombre *</label>
          <input className="input" {...register('nombre', { required: 'Requerido' })} />
          {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
        </div>
        <div>
          <label className="label">Tipo *</label>
          <select className="input" {...register('tipo', { required: 'Requerido' })}>
            {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Naturaleza *</label>
          <select className="input" {...register('naturaleza', { required: 'Requerido' })}>
            {NATURALEZAS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Unidad de cálculo</label>
          <select className="input" {...register('unidad')}>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Orden de impresión</label>
          <input type="number" className="input" {...register('orden', { valueAsNumber: true })} />
        </div>
        {unidad === 'PORCENTAJE' && (
          <div>
            <label className="label">Porcentaje (%)</label>
            <input type="number" step="0.0001" className="input"
              {...register('porcentaje', { valueAsNumber: true })} />
          </div>
        )}
        {unidad === 'IMPORTE' && (
          <div>
            <label className="label">Importe fijo ($)</label>
            <input type="number" step="0.01" className="input"
              {...register('importe', { valueAsNumber: true })} />
          </div>
        )}
        <div className="col-span-2">
          <label className="label">Fórmula (opcional)</label>
          <input className="input font-mono text-sm" placeholder="Ej: BASICO * 0.08"
            {...register('formula')} />
          <p className="text-xs text-gray-400 mt-1">Variables: BASICO, TOTAL_REMUNERATIVO, ANTIGUEDAD_PCT, VALOR_HORA, CANTIDAD</p>
        </div>
        <div className="col-span-2 flex gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" className="rounded" {...register('remunerativo')} />
            Remunerativo
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" className="rounded" {...register('imprimible')} />
            Imprimible en recibo
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Guardando...' : concepto ? 'Guardar cambios' : 'Crear concepto'}
        </button>
      </div>
    </form>
  );
}

export default function Conceptos() {
  const [conceptos, setConceptos] = useState([]);
  const [convenios, setConvenios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroConvenio, setFiltroConvenio] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editConcepto, setEditConcepto] = useState(null);

  const cargar = async () => {
    const params = {};
    if (filtroConvenio) params.convenioId = filtroConvenio;
    if (filtroTipo) params.tipo = filtroTipo;
    const [cRes, convRes] = await Promise.all([
      api.get('/conceptos', { params }),
      api.get('/convenios'),
    ]);
    setConceptos(cRes.data);
    setConvenios(convRes.data);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [filtroConvenio, filtroTipo]);

  const handleSuccess = () => { setModalOpen(false); setEditConcepto(null); cargar(); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conceptos de Liquidación</h1>
          <p className="text-gray-500 text-sm">Haberes, descuentos y contribuciones por convenio</p>
        </div>
        <button onClick={() => { setEditConcepto(null); setModalOpen(true); }} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Nuevo concepto
        </button>
      </div>

      <div className="card p-4 flex gap-3">
        <select className="input w-64" value={filtroConvenio} onChange={e => setFiltroConvenio(e.target.value)}>
          <option value="">Todos los convenios</option>
          {convenios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="input w-44" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="p-10 text-center">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Código</th>
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-5 py-3 text-left hidden md:table-cell">Convenio</th>
                <th className="px-5 py-3 text-center">Tipo</th>
                <th className="px-5 py-3 text-center hidden sm:table-cell">Unidad</th>
                <th className="px-5 py-3 text-right hidden lg:table-cell">Valor</th>
                <th className="px-5 py-3 text-center">Remun.</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {conceptos.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-600">{c.codigo}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs hidden md:table-cell">
                    {c.convenio?.nombre || <span className="italic text-gray-400">General</span>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={tipoBadge[c.tipo] || 'badge-gray'}>
                      {c.tipo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center text-gray-500 text-xs hidden sm:table-cell">{c.unidad}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-gray-700 hidden lg:table-cell">
                    {c.porcentaje ? `${c.porcentaje}%` : c.importe ? `$${c.importe}` : c.formula || '—'}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {c.remunerativo
                      ? <span className="badge-green">Sí</span>
                      : <span className="badge-gray">No</span>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button onClick={() => { setEditConcepto(c); setModalOpen(true); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {conceptos.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">No se encontraron conceptos</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditConcepto(null); }}
        title={editConcepto ? 'Editar concepto' : 'Nuevo concepto'} size="lg">
        <ConceptoForm concepto={editConcepto} convenios={convenios}
          onSuccess={handleSuccess} onClose={() => { setModalOpen(false); setEditConcepto(null); }} />
      </Modal>
    </div>
  );
}
