import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { formatCurrency, formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, ArrowUpCircleIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { useForm } from 'react-hook-form';

function ParitariaModal({ convenioId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [tabla, setTabla] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const { register, handleSubmit, watch } = useForm({ defaultValues: { tipo: 'PORCENTAJE', vigenciaDesde: new Date().toISOString().split('T')[0] } });
  const tipo = watch('tipo');

  useEffect(() => {
    api.get(`/convenios/${convenioId}/tabla-sueldo`, { params: { vigente: 'true' } })
      .then(({ data }) => {
        setTabla(data || []);
        setSeleccionadas(data.map(t => t.categoria));
      });
  }, [convenioId]);

  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      const resp = await api.post(`/convenios/${convenioId}/paritaria`, {
        ...data,
        valor: parseFloat(data.valor),
        categorias: seleccionadas,
      });
      toast.success(resp.data.mensaje);
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
          <label className={lbl}>Tipo de aumento</label>
          <select {...register('tipo')} className={inp}>
            <option value="PORCENTAJE">Por porcentaje (%)</option>
            <option value="IMPORTE">Por importe fijo ($)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>{tipo === 'PORCENTAJE' ? 'Porcentaje (%)' : 'Importe ($)'}</label>
          <input type="number" step="0.01" min="0" {...register('valor', { required: true })} className={inp} placeholder={tipo === 'PORCENTAJE' ? 'Ej: 15' : 'Ej: 50000'} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Vigencia desde</label>
          <input type="date" {...register('vigenciaDesde', { required: true })} className={inp} />
        </div>
      </div>

      <div>
        <label className={lbl}>Categorías a actualizar ({seleccionadas.length}/{tabla.length})</label>
        <div className="border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
          {tabla.map(t => (
            <label key={t.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 border-b last:border-0 cursor-pointer">
              <input type="checkbox"
                checked={seleccionadas.includes(t.categoria)}
                onChange={e => {
                  if (e.target.checked) setSeleccionadas(s => [...s, t.categoria]);
                  else setSeleccionadas(s => s.filter(c => c !== t.categoria));
                }}
                className="rounded" />
              <span className="flex-1 text-sm">
                <strong>{t.categoria}</strong> {t.descripcion ? `— ${t.descripcion}` : ''}
              </span>
              <span className="text-sm text-gray-600">{formatCurrency(t.basicoMensual)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando || seleccionadas.length === 0}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
          {guardando ? 'Aplicando...' : 'Aplicar Paritaria'}
        </button>
      </div>
    </form>
  );
}

export default function Convenios() {
  const [convenios, setConvenios] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [tablaVigente, setTablaVigente] = useState([]);
  const [showParitaria, setShowParitaria] = useState(false);
  const [showNuevoCCT, setShowNuevoCCT] = useState(false);
  const [editandoCCT, setEditandoCCT] = useState(null);

  const fetchConvenios = async () => {
    const { data } = await api.get('/convenios');
    setConvenios(data || []);
    if (data?.length > 0 && !seleccionado) {
      setSeleccionado(data[0]);
    }
  };

  const fetchTabla = async () => {
    if (!seleccionado?.id) return;
    const { data } = await api.get(`/convenios/${seleccionado.id}/tabla-sueldo`, { params: { vigente: 'true' } });
    setTablaVigente(data || []);
  };

  useEffect(() => { fetchConvenios(); }, []);
  useEffect(() => { if (seleccionado) fetchTabla(); }, [seleccionado]);

  return (
    <div className="flex gap-4 h-full">
      {/* Lista CCTs */}
      <div className="w-64 flex-shrink-0 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">Convenios CCT</h2>
        </div>
        {convenios.map(c => (
          <button key={c.id} onClick={() => setSeleccionado(c)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${seleccionado?.id === c.id ? 'bg-blue-100 text-blue-800 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
            <p className="font-medium">{c.codigo}</p>
            <p className="text-xs text-gray-500 truncate">{c.nombre}</p>
            <p className="text-xs text-gray-400">{c._count?.empresas || 0} emp. · {c._count?.empleados || 0} legajos</p>
          </button>
        ))}
      </div>

      {/* Detalle CCT seleccionado */}
      {seleccionado && (
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{seleccionado.nombre}</h1>
              <p className="text-gray-500 text-sm">{seleccionado.codigo} · {seleccionado.descripcion}</p>
            </div>
            <button onClick={() => setShowParitaria(true)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
              <ArrowUpCircleIcon className="w-4 h-4" /> Aplicar Paritaria
            </button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-medium text-gray-700 text-sm">Escala Salarial Vigente</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Categoría</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Descripción</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Básico Mensual</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Vigencia</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tablaVigente.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-blue-700">{t.categoria}</td>
                    <td className="px-4 py-3 text-gray-700">{t.descripcion || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(t.basicoMensual)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      Desde {formatDate(t.vigenciaDesde)}
                      {t.vigenciaHasta && ` → ${formatDate(t.vigenciaHasta)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tablaVigente.length === 0 && (
              <div className="p-6 text-center text-gray-400">Sin escala salarial vigente</div>
            )}
          </div>
        </div>
      )}

      {showParitaria && seleccionado && (
        <Modal onClose={() => setShowParitaria(false)} title={`Paritaria — ${seleccionado.nombre}`}>
          <ParitariaModal convenioId={seleccionado.id}
            onSave={() => { setShowParitaria(false); fetchTabla(); }}
            onCancel={() => setShowParitaria(false)} />
        </Modal>
      )}
    </div>
  );
}
