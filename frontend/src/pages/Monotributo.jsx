import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { formatMoney, formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

const CATEGORIAS_DEFAULT = [
  { cat: 'A', limiteIngresos: 6450000, cuota: 2614 },
  { cat: 'B', limiteIngresos: 9450000, cuota: 3128 },
  { cat: 'C', limiteIngresos: 13250000, cuota: 3729 },
  { cat: 'D', limiteIngresos: 16450000, cuota: 4472 },
  { cat: 'E', limiteIngresos: 19350000, cuota: 5490 },
  { cat: 'F', limiteIngresos: 24250000, cuota: 6767 },
  { cat: 'G', limiteIngresos: 29000000, cuota: 8328 },
  { cat: 'H', limiteIngresos: 44000000, cuota: 13110 },
  { cat: 'I', limiteIngresos: 49250000, cuota: 14914 },
  { cat: 'J', limiteIngresos: 56400000, cuota: 17271 },
  { cat: 'K', limiteIngresos: 68000000, cuota: 21246 },
];

const CAT_COLORS = {
  A: 'bg-green-100 text-green-700', B: 'bg-green-100 text-green-700',
  C: 'bg-teal-100 text-teal-700', D: 'bg-blue-100 text-blue-700',
  E: 'bg-blue-100 text-blue-700', F: 'bg-indigo-100 text-indigo-700',
  G: 'bg-purple-100 text-purple-700', H: 'bg-orange-100 text-orange-700',
  I: 'bg-red-100 text-red-700', J: 'bg-red-100 text-red-700', K: 'bg-red-200 text-red-800',
};

function MonotributistaNuevoForm({ empresas, categorias, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ empresaId: '', categoria: 'A' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post('/monotributo', form);
      toast.success('Monotributista agregado');
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={lbl}>Empresa *</label>
        <select value={form.empresaId} onChange={e => setForm(f => ({ ...f, empresaId: e.target.value }))} className={inp} required>
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Categoria inicial *</label>
        <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className={inp}>
          {categorias.map(c => (
            <option key={c.cat} value={c.cat}>Categoria {c.cat} — hasta {formatMoney(c.limiteIngresos)}/ano</option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Agregar'}
        </button>
      </div>
    </form>
  );
}

function MonoEditForm({ mono, categorias, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    categoria: mono.categoria || 'A',
    ingresosBrutosMensuales: mono.ingresosBrutosMensuales || '',
    cuotaMensual: mono.cuotaMensual || '',
    diaVencimiento: mono.diaVencimiento || 20,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.put(`/monotributo/${mono.id}`, form);
      toast.success('Actualizado');
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Categoria *</label>
          <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className={inp}>
            {categorias.map(c => <option key={c.cat} value={c.cat}>Categoria {c.cat}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Dia de vencimiento</label>
          <input type="number" min="1" max="31" value={form.diaVencimiento}
            onChange={e => setForm(f => ({ ...f, diaVencimiento: parseInt(e.target.value) }))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Ingresos brutos mensuales ($)</label>
          <input type="number" min="0" step="0.01" value={form.ingresosBrutosMensuales}
            onChange={e => setForm(f => ({ ...f, ingresosBrutosMensuales: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Cuota mensual ($)</label>
          <input type="number" min="0" step="0.01" value={form.cuotaMensual}
            onChange={e => setForm(f => ({ ...f, cuotaMensual: e.target.value }))} className={inp} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function RecategorizarModal({ mono, onSave, onCancel }) {
  const [ingresos, setIngresos] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleRecategorizar = async () => {
    if (!ingresos) { toast.error('Ingrese los ingresos declarados'); return; }
    setCargando(true);
    try {
      const { data } = await api.post(`/monotributo/${mono.id}/recategorizar`, { ingresosMensuales: parseFloat(ingresos) });
      setResultado(data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al recategorizar');
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmar = async () => {
    setCargando(true);
    try {
      await api.put(`/monotributo/${mono.id}`, { categoria: resultado.nuevaCategoria });
      toast.success(`Recategorizado a categoria ${resultado.nuevaCategoria}`);
      onSave();
    } catch { toast.error('Error al confirmar'); }
    finally { setCargando(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Categoria actual: <span className="font-semibold">{mono.categoria}</span></p>
      <div>
        <label className={lbl}>Ingresos brutos mensuales promedio ($)</label>
        <input type="number" min="0" step="0.01" value={ingresos} onChange={e => setIngresos(e.target.value)} className={inp} />
      </div>
      <button onClick={handleRecategorizar} disabled={cargando || !ingresos}
        className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
        {cargando ? 'Calculando...' : 'Calcular nueva categoria'}
      </button>
      {resultado && (
        <div className={`rounded-lg p-4 ${resultado.nuevaCategoria !== mono.categoria ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
          <p className="text-sm font-semibold">
            {resultado.nuevaCategoria !== mono.categoria
              ? `Debe recategorizarse a Categoria ${resultado.nuevaCategoria}`
              : `Permanece en Categoria ${mono.categoria}`}
          </p>
          <p className="text-xs text-gray-600 mt-1">Cuota: {formatMoney(resultado.cuota)}</p>
          {resultado.nuevaCategoria !== mono.categoria && (
            <button onClick={handleConfirmar} disabled={cargando}
              className="mt-2 px-3 py-1.5 text-xs bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
              Confirmar recategorizacion
            </button>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cerrar</button>
      </div>
    </div>
  );
}

export default function Monotributo() {
  const [empresas, setEmpresas] = useState([]);
  const [monotributistas, setMonotributistas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNuevo, setShowNuevo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [recategorizando, setRecategorizando] = useState(null);
  const [categorias, setCategorias] = useState(CATEGORIAS_DEFAULT);
  const [catLoading, setCatLoading] = useState(true);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/parametros/monotributo/categorias')
      .then(r => setCategorias(r.data.categorias))
      .catch(() => setCategorias(CATEGORIAS_DEFAULT))
      .finally(() => setCatLoading(false));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/monotributo');
      setMonotributistas(data || []);
    } catch { toast.error('Error al cargar monotributistas'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hoy = new Date();
  const proximosVencimientos = monotributistas.filter(m => {
    if (!m.diaVencimiento) return false;
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), m.diaVencimiento);
    const diff = Math.ceil((d - hoy) / 86400000);
    return diff >= 0 && diff <= 15;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Monotributo</h1>
        <div className="flex gap-2">
          <Link to="/monotributo/categorias" className="btn-secondary text-sm">
            <AdjustmentsHorizontalIcon className="w-4 h-4" /> Categorías
          </Link>
          <button onClick={() => setShowNuevo(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <PlusIcon className="w-4 h-4" /> Monotributista
          </button>
        </div>
      </div>

      {proximosVencimientos.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-orange-700 mb-2">Cuotas con vencimiento en los proximos 15 dias</p>
          <div className="flex flex-wrap gap-2">
            {proximosVencimientos.map(m => (
              <span key={m.id} className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
                {m.empresa?.razonSocial} — dia {m.diaVencimiento}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tabla principal */}
        <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Categoria</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Cuota mensual</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Vencimiento</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {monotributistas.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{m.empresa?.razonSocial}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${CAT_COLORS[m.categoria] || 'bg-gray-100 text-gray-600'}`}>
                        Categoria {m.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {formatMoney(m.cuotaMensual || categorias.find(c => c.cat === m.categoria)?.cuota || 0)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {m.diaVencimiento ? `Dia ${m.diaVencimiento}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditando(m)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => setRecategorizando(m)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                          Recategorizar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {monotributistas.length === 0 && !loading && (
            <div className="p-8 text-center text-gray-400">Sin monotributistas registrados</div>
          )}
        </div>

        {/* Tabla categorias */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-semibold text-sm text-gray-700">Categorias vigentes {catLoading ? '...' : ''}</h3>
          </div>
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr>
                <th className="px-3 py-2 text-center font-medium text-gray-600">Cat.</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Limite anual</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Cuota</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {categorias.map(c => (
                <tr key={c.cat} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${CAT_COLORS[c.cat] || 'bg-gray-100 text-gray-600'}`}>{c.cat}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{formatMoney(c.limiteIngresos)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatMoney(c.cuota)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNuevo && (
        <Modal onClose={() => setShowNuevo(false)} title="Agregar Monotributista">
          <MonotributistaNuevoForm
            empresas={empresas}
            categorias={categorias}
            onSave={() => { setShowNuevo(false); fetchData(); }}
            onCancel={() => setShowNuevo(false)}
          />
        </Modal>
      )}

      {editando && (
        <Modal onClose={() => setEditando(null)} title={`Editar — ${editando.empresa?.razonSocial}`}>
          <MonoEditForm
            mono={editando}
            categorias={categorias}
            onSave={() => { setEditando(null); fetchData(); }}
            onCancel={() => setEditando(null)}
          />
        </Modal>
      )}

      {recategorizando && (
        <Modal onClose={() => setRecategorizando(null)} title={`Recategorizar — ${recategorizando.empresa?.razonSocial}`}>
          <RecategorizarModal
            mono={recategorizando}
            onSave={() => { setRecategorizando(null); fetchData(); }}
            onCancel={() => setRecategorizando(null)}
          />
        </Modal>
      )}
    </div>
  );
}
