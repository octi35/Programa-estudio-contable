import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { formatCurrency, formatDate } from '../../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, EyeIcon, XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import Modal from '../../components/Modal';
import { confirm } from '../../components/confirm';
import { downloadWithProgress } from '../../utils/download';
import { useForm, useFieldArray } from 'react-hook-form';

function AsientoForm({ asiento, empresas, defaultEmpresaId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [cuentas, setCuentas] = useState([]);
  const [ejercicios, setEjercicios] = useState([]);

  const { register, handleSubmit, watch, control, formState: { errors } } = useForm({
    defaultValues: asiento || {
      empresaId: defaultEmpresaId || '',
      fecha: new Date().toISOString().split('T')[0],
      descripcion: '', glosa: '', origen: 'MANUAL',
      lineas: [
        { cuentaContableId: '', descripcion: '', debe: 0, haber: 0 },
        { cuentaContableId: '', descripcion: '', debe: 0, haber: 0 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' });
  const lineas = watch('lineas') || [];
  const empresaId = watch('empresaId');

  const totalDebe = lineas.reduce((s, l) => s + parseFloat(l.debe || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + parseFloat(l.haber || 0), 0);
  const balanceado = Math.abs(totalDebe - totalHaber) < 0.01;

  useEffect(() => {
    if (!empresaId) return;
    Promise.all([
      api.get('/contabilidad/cuentas', { params: { empresaId, permiteMovimientos: true } }),
      api.get('/contabilidad/ejercicios', { params: { empresaId } }),
    ]).then(([{ data: c }, { data: e }]) => {
      setCuentas(c || []);
      setEjercicios(e || []);
    });
  }, [empresaId]);

  const onSubmit = async (data) => {
    if (!balanceado) { toast.error('El asiento debe balancear (Debe = Haber)'); return; }
    setGuardando(true);
    try {
      if (asiento?.id) { await api.put(`/contabilidad/asientos/${asiento.id}`, data); toast.success('Asiento actualizado'); }
      else { await api.post('/contabilidad/asientos', data); toast.success('Asiento creado'); }
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
            <option value="">Seleccionar...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Ejercicio *</label>
          <select {...register('ejercicioId', { required: true })} className={inp}>
            <option value="">Seleccionar...</option>
            {ejercicios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Fecha *</label>
          <input type="date" {...register('fecha', { required: true })} className={inp} />
        </div>
        <div>
          <label className={lbl}>Origen</label>
          <select {...register('origen')} className={inp}>
            <option value="MANUAL">Manual</option>
            <option value="IVA_COMPRAS">IVA Compras</option>
            <option value="IVA_VENTAS">IVA Ventas</option>
            <option value="SUELDOS">Sueldos</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={lbl}>Descripción *</label>
          <input {...register('descripcion', { required: true })} className={inp} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Glosa</label>
          <input {...register('glosa')} className={inp} />
        </div>
      </div>

      {/* Líneas del asiento */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-gray-700 text-sm">Líneas del Asiento</h3>
          <button type="button" onClick={() => append({ cuentaContableId: '', descripcion: '', debe: 0, haber: 0 })}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <PlusIcon className="w-3 h-3" /> Agregar línea
          </button>
        </div>
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Cuenta</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Descripción</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 w-28">Debe</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 w-28">Haber</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {fields.map((field, i) => (
                <tr key={field.id}>
                  <td className="px-3 py-2">
                    <select {...register(`lineas.${i}.cuentaContableId`, { required: true })}
                      className="border rounded px-2 py-1 text-xs w-full">
                      <option value="">Seleccionar...</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input {...register(`lineas.${i}.descripcion`)} className="border rounded px-2 py-1 text-xs w-full" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" {...register(`lineas.${i}.debe`, { valueAsNumber: true })}
                      className="border rounded px-2 py-1 text-xs w-full text-right" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" {...register(`lineas.${i}.haber`, { valueAsNumber: true })}
                      className="border rounded px-2 py-1 text-xs w-full text-right" />
                  </td>
                  <td className="px-3 py-2">
                    {fields.length > 2 && (
                      <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2">
              <tr className={balanceado ? 'bg-green-50' : 'bg-red-50'}>
                <td colSpan="2" className="px-3 py-2 text-sm font-semibold text-gray-700 text-right">TOTALES</td>
                <td className="px-3 py-2 text-right font-bold text-sm">{formatCurrency(totalDebe)}</td>
                <td className="px-3 py-2 text-right font-bold text-sm">{formatCurrency(totalHaber)}</td>
                <td className="px-3 py-2 text-center">
                  {balanceado ? '✓' : <span className="text-red-600 text-xs">≠</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando || !balanceado}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (asiento ? 'Actualizar' : 'Crear Asiento')}
        </button>
      </div>
    </form>
  );
}

export default function Asientos() {
  const [asientos, setAsientos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [ejercicioId, setEjercicioId] = useState('');
  const [ejercicios, setEjercicios] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const fetchEmpresas = async () => {
    const { data } = await api.get('/empresas', { params: { limit: 200 } });
    setEmpresas(data.data || []);
    if (data.data?.length > 0) setEmpresaId(data.data[0].id);
  };

  useEffect(() => { fetchEmpresas(); }, []);

  useEffect(() => {
    if (!empresaId) return;
    api.get('/contabilidad/ejercicios', { params: { empresaId } })
      .then(({ data }) => { setEjercicios(data || []); if (data?.length > 0) setEjercicioId(data[0].id); });
  }, [empresaId]);

  const fetchAsientos = async () => {
    if (!empresaId) return;
    const { data } = await api.get('/contabilidad/asientos', { params: { empresaId, ejercicioId, page } });
    setAsientos(data.data || []);
    setPagination(data.pagination || {});
  };

  useEffect(() => { fetchAsientos(); }, [empresaId, ejercicioId, page]);

  const handleAnular = async (id) => {
    if (!await confirm({
      title: 'Anular asiento contable',
      message: 'El asiento quedará marcado como ANULADO y dejará de impactar en los reportes contables (Mayor, Balance, Estado de Resultados).',
      details: [
        'No se elimina físicamente del libro diario, pero pierde efecto.',
        'Si fue generado automáticamente desde una liquidación o factura, recordá revisar la origen.',
        'Acción definitiva.',
      ],
      confirmText: 'Anular asiento',
      requireText: 'ANULAR',
      danger: true,
    })) return;
    try {
      await api.delete(`/contabilidad/asientos/${id}`);
      toast.success('Asiento anulado');
      fetchAsientos();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Asientos Contables</h1>
        <div className="flex gap-2 flex-wrap">
          {empresaId && (
            <div className="inline-flex items-center gap-1 border rounded-lg bg-white p-1 text-xs">
              <span className="px-2 text-gray-500">Exportar:</span>
              {['csv', 'tango', 'bejerman'].map(fmt => (
                <button
                  key={fmt}
                  onClick={() => downloadWithProgress(
                    `/api/contabilidad/asientos/exportar?empresaId=${empresaId}&formato=${fmt}`,
                    {
                      filename: fmt === 'tango' ? 'asientos_tango.zip' : `asientos_${fmt}.csv`,
                      loadingLabel: `Generando ${fmt.toUpperCase()}...`,
                    },
                  )}
                  className="px-2 py-1 rounded-md hover:bg-gray-100 font-medium text-gray-700 uppercase"
                >
                  {fmt}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { setEditando(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <PlusIcon className="w-4 h-4" /> Nuevo Asiento
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select value={ejercicioId} onChange={e => setEjercicioId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          <option value="">Todos los ejercicios</option>
          {ejercicios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">N°</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Descripción</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">Origen</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 hidden sm:table-cell">Debe</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Haber</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {asientos.map(a => (
              <tr key={a.id} className={`hover:bg-gray-50 ${a.anulado ? 'opacity-40 line-through' : ''}`}>
                <td className="px-4 py-3 font-mono text-gray-600 hidden sm:table-cell">{a.numero || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(a.fecha)}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">{a.descripcion}</p>
                  {a.glosa && <p className="text-xs text-gray-400">{a.glosa}</p>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{a.origen}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm hidden sm:table-cell">{formatCurrency(a.totalDebe)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{formatCurrency(a.totalHaber)}</td>
                <td className="px-4 py-3 text-center">
                  {!a.anulado && (
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => { setEditando(a); setShowForm(true); }}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleAnular(a.id)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {asientos.length === 0 && <div className="p-8 text-center text-gray-400">Sin asientos registrados</div>}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar Asiento' : 'Nuevo Asiento Contable'} size="xl">
          <AsientoForm asiento={editando} empresas={empresas} defaultEmpresaId={empresaId}
            onSave={() => { setShowForm(false); fetchAsientos(); }}
            onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </div>
  );
}
