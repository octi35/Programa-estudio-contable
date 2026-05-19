import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { formatCurrency, formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, ArrowUpCircleIcon, TrashIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { useForm } from 'react-hook-form';
import { confirm } from '../components/confirm';

// ─── Paritaria (sube básicos de la tabla salarial) ───────────────────────────
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

// ─── Formulario Acuerdo Paritario ─────────────────────────────────────────────
function AcuerdoForm({ convenioId, acuerdo, onSuccess, onClose }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: acuerdo ? {
      ...acuerdo,
      vigenciaDesde: acuerdo.vigenciaDesde?.slice(0, 10),
      vigenciaHasta: acuerdo.vigenciaHasta?.slice(0, 10) || '',
    } : {
      tipo: 'NO_REMUNERATIVO',
      vigenciaDesde: new Date().toISOString().slice(0, 10),
      absorbible: true,
    },
  });
  const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  const onSubmit = async (data) => {
    try {
      const payload = {
        ...data,
        convenioId,
        monto: data.monto ? Number(data.monto) : null,
        porcentaje: data.porcentaje ? Number(data.porcentaje) : null,
        cuota: data.cuota ? Number(data.cuota) : null,
        totalCuotas: data.totalCuotas ? Number(data.totalCuotas) : null,
        absorbible: !!data.absorbible,
        vigenciaHasta: data.vigenciaHasta || null,
      };
      if (acuerdo?.id) {
        await api.put(`/acuerdos/${acuerdo.id}`, payload);
        toast.success('Acuerdo actualizado');
      } else {
        await api.post('/acuerdos', payload);
        toast.success('Acuerdo creado');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className={lbl}>Descripción *</label>
        <input className={inp} {...register('descripcion', { required: 'Requerido' })} placeholder="Ej: Acuerdo Paritario Junio 2026" />
        {errors.descripcion && <p className="text-red-500 text-xs mt-1">{errors.descripcion.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Tipo *</label>
          <select className={inp} {...register('tipo', { required: true })}>
            <option value="NO_REMUNERATIVO">No Remunerativo</option>
            <option value="REMUNERATIVO">Remunerativo</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Vigencia desde *</label>
          <input type="date" className={inp} {...register('vigenciaDesde', { required: 'Requerido' })} />
          {errors.vigenciaDesde && <p className="text-red-500 text-xs mt-1">{errors.vigenciaDesde.message}</p>}
        </div>
        <div>
          <label className={lbl}>Monto fijo ($)</label>
          <input type="number" step="0.01" className={inp} {...register('monto')} placeholder="0.00" />
        </div>
        <div>
          <label className={lbl}>Porcentaje del básico (%)</label>
          <input type="number" step="0.01" className={inp} {...register('porcentaje')} placeholder="0.00" />
        </div>
        <div>
          <label className={lbl}>Vigencia hasta</label>
          <input type="date" className={inp} {...register('vigenciaHasta')} />
        </div>
        <div>
          <label className={lbl}>Cuota N°</label>
          <input type="number" min="1" className={inp} {...register('cuota')} placeholder="Ej: 3" />
        </div>
        <div>
          <label className={lbl}>Total de cuotas</label>
          <input type="number" min="1" className={inp} {...register('totalCuotas')} placeholder="Ej: 12" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" className="rounded" {...register('absorbible')} />
        Se absorbe en futuros aumentos del básico
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={isSubmitting}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? 'Guardando...' : acuerdo ? 'Guardar cambios' : 'Crear acuerdo'}
        </button>
      </div>
    </form>
  );
}

// ─── Sección Acuerdos Paritarios ──────────────────────────────────────────────
function TabAcuerdos({ convenioId }) {
  const [acuerdos, setAcuerdos] = useState([]);
  const [modal, setModal]       = useState(false);
  const [editando, setEditando] = useState(null);

  const cargar = () => api.get('/acuerdos', { params: { convenioId } })
    .then(r => setAcuerdos(r.data))
    .catch(() => {});

  useEffect(() => { cargar(); }, [convenioId]);

  const marcarAbsorbido = async (a) => {
    if (!await confirm({
      title: 'Marcar como absorbido',
      message: `"${a.descripcion}" se marcará como absorbido y dejará de aplicarse en las liquidaciones.`,
      confirmText: 'Marcar absorbido',
      danger: false,
    })) return;
    try {
      await api.put(`/acuerdos/${a.id}`, { absorbido: true });
      toast.success('Marcado como absorbido');
      cargar();
    } catch { toast.error('Error'); }
  };

  const eliminar = async (id) => {
    if (!await confirm({ title: 'Eliminar acuerdo', message: 'No afecta liquidaciones ya calculadas.', confirmText: 'Eliminar', danger: true })) return;
    try {
      await api.delete(`/acuerdos/${id}`);
      toast.success('Acuerdo eliminado');
      cargar();
    } catch { toast.error('Error al eliminar'); }
  };

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
        <div>
          <h3 className="font-medium text-gray-700 text-sm">Acuerdos Paritarios</h3>
          <p className="text-xs text-gray-400 mt-0.5">Se aplican automáticamente en cada liquidación según su vigencia</p>
        </div>
        <button onClick={() => { setEditando(null); setModal(true); }}
          className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700">
          <PlusIcon className="w-3.5 h-3.5" /> Nuevo acuerdo
        </button>
      </div>

      {acuerdos.length === 0 ? (
        <p className="p-6 text-center text-gray-400 text-sm">Sin acuerdos paritarios cargados</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
            <tr>
              <th className="px-4 py-3 text-left">Descripción</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-right">Monto / %</th>
              <th className="px-4 py-3 text-left">Vigencia</th>
              <th className="px-4 py-3 text-left">Cuota</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {acuerdos.map(a => (
              <tr key={a.id} className={`hover:bg-gray-50 ${a.absorbido ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{a.descripcion}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${a.tipo === 'REMUNERATIVO' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {a.tipo === 'REMUNERATIVO' ? 'Remunerativo' : 'No Rem.'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">
                  {a.monto ? formatCurrency(a.monto) : a.porcentaje ? `${Number(a.porcentaje)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {formatDate(a.vigenciaDesde)}
                  {a.vigenciaHasta && ` → ${formatDate(a.vigenciaHasta)}`}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {a.cuota ? `${a.cuota}/${a.totalCuotas || '?'}` : '—'}
                </td>
                <td className="px-4 py-3">
                  {a.absorbido
                    ? <span className="text-xs text-gray-400">Absorbido</span>
                    : <span className="text-xs text-green-600 font-medium">Vigente</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    {!a.absorbido && a.absorbible && (
                      <button onClick={() => marcarAbsorbido(a)}
                        title="Marcar como absorbido en el básico"
                        className="text-xs text-orange-600 hover:text-orange-800">Absorber</button>
                    )}
                    <button onClick={() => { setEditando(a); setModal(true); }}
                      className="text-gray-400 hover:text-blue-600">
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => eliminar(a.id)} className="text-gray-400 hover:text-red-600">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <Modal onClose={() => setModal(false)}
          title={editando ? 'Editar acuerdo paritario' : 'Nuevo acuerdo paritario'}
          size="lg">
          <AcuerdoForm
            convenioId={convenioId}
            acuerdo={editando}
            onSuccess={() => { setModal(false); cargar(); }}
            onClose={() => setModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Convenios() {
  const [convenios, setConvenios]     = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [tablaVigente, setTablaVigente] = useState([]);
  const [tab, setTab]                 = useState('escala');
  const [showParitaria, setShowParitaria] = useState(false);
  const [showEditConvenio, setShowEditConvenio] = useState(false);

  const fetchConvenios = async () => {
    const { data } = await api.get('/convenios');
    setConvenios(data || []);
    if (data?.length > 0 && !seleccionado) setSeleccionado(data[0]);
  };

  const fetchTabla = async () => {
    if (!seleccionado?.id) return;
    const { data } = await api.get(`/convenios/${seleccionado.id}/tabla-sueldo`, { params: { vigente: 'true' } });
    setTablaVigente(data || []);
  };

  useEffect(() => { fetchConvenios(); }, []);
  useEffect(() => { if (seleccionado) { fetchTabla(); setTab('escala'); } }, [seleccionado?.id]);

  const guardarConvenio = async (data) => {
    try {
      const updated = await api.put(`/convenios/${seleccionado.id}`, {
        ...data,
        horasSemanales: Number(data.horasSemanales),
      });
      toast.success('Convenio actualizado');
      setShowEditConvenio(false);
      setSeleccionado(updated.data);
      fetchConvenios();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

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
            <p className="text-xs text-gray-400">{c._count?.empresas || 0} emp. · {c._count?.empleados || 0} legajos · {c.horasSemanales || 40}hs/sem</p>
          </button>
        ))}
      </div>

      {/* Detalle CCT seleccionado */}
      {seleccionado && (
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{seleccionado.nombre}</h1>
              <p className="text-gray-500 text-sm">
                {seleccionado.codigo}
                {seleccionado.descripcion ? ` · ${seleccionado.descripcion}` : ''}
                <span className="ml-2 inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                  {seleccionado.horasSemanales || 40}hs semanales
                </span>
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowEditConvenio(true)}
                className="flex items-center gap-1.5 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
                <PencilIcon className="w-4 h-4" /> Editar
              </button>
              <button onClick={() => setShowParitaria(true)}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                <ArrowUpCircleIcon className="w-4 h-4" /> Aplicar Paritaria
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            {[['escala', 'Escala Salarial'], ['acuerdos', 'Acuerdos Paritarios']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'escala' && (
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
          )}

          {tab === 'acuerdos' && <TabAcuerdos convenioId={seleccionado.id} />}
        </div>
      )}

      {showParitaria && seleccionado && (
        <Modal onClose={() => setShowParitaria(false)} title={`Paritaria — ${seleccionado.nombre}`}>
          <ParitariaModal convenioId={seleccionado.id}
            onSave={() => { setShowParitaria(false); fetchTabla(); }}
            onCancel={() => setShowParitaria(false)} />
        </Modal>
      )}

      {showEditConvenio && seleccionado && (
        <Modal onClose={() => setShowEditConvenio(false)} title="Editar convenio">
          <EditConvenioForm convenio={seleccionado} onSuccess={guardarConvenio} onClose={() => setShowEditConvenio(false)} />
        </Modal>
      )}
    </div>
  );
}

function EditConvenioForm({ convenio, onSuccess, onClose }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      codigo: convenio.codigo,
      nombre: convenio.nombre,
      descripcion: convenio.descripcion || '',
      horasSemanales: convenio.horasSemanales || 40,
    },
  });
  const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <form onSubmit={handleSubmit(onSuccess)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Código</label>
          <input className={inp} {...register('codigo', { required: true })} />
        </div>
        <div>
          <label className={lbl}>Horas semanales full-time</label>
          <input type="number" min="1" max="168" className={inp} {...register('horasSemanales')} />
          <p className="text-xs text-gray-400 mt-0.5">Referencia para calcular factor part-time (ej: 40)</p>
        </div>
        <div className="col-span-2">
          <label className={lbl}>Nombre</label>
          <input className={inp} {...register('nombre', { required: true })} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Descripción</label>
          <input className={inp} {...register('descripcion')} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={isSubmitting}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
