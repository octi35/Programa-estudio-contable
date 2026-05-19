import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { formatMoney, MESES } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, CheckIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';

const PROVINCIAS = [
  'Buenos Aires','Catamarca','Chaco','Chubut','Cordoba','Corrientes',
  'Entre Rios','Formosa','Jujuy','La Pampa','La Rioja','Mendoza',
  'Misiones','Neuquen','Rio Negro','Salta','San Juan','San Luis',
  'Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego',
  'Tucuman','Ciudad Autonoma de Buenos Aires',
];

const REGIMENES = ['DIRECTO', 'MULTILATERAL'];

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

const ESTADO_BADGE = {
  PENDIENTE: 'bg-yellow-100 text-yellow-700',
  PRESENTADA: 'bg-blue-100 text-blue-700',
  PAGADA: 'bg-green-100 text-green-700',
};

function DeclaracionForm({ declaracion, empresaId, anio, mes, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    jurisdiccion: declaracion?.jurisdiccion || '',
    regimen: declaracion?.regimen || 'DIRECTO',
    baseImponible: declaracion?.baseImponible || '',
    alicuota: declaracion?.alicuota || '',
    retenciones: declaracion?.retenciones || 0,
    percepciones: declaracion?.percepciones || 0,
  });

  const impuesto = parseFloat(form.baseImponible || 0) * (parseFloat(form.alicuota || 0) / 100);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const payload = { ...form, empresaId, anio, mes, impuesto };
      if (declaracion?.id) {
        await api.put(`/iibb/${declaracion.id}`, payload);
        toast.success('Declaracion actualizada');
      } else {
        await api.post('/iibb', payload);
        toast.success('Declaracion creada');
      }
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
        <div className="col-span-2">
          <label className={lbl}>Jurisdiccion *</label>
          <select value={form.jurisdiccion} onChange={e => setForm(f => ({ ...f, jurisdiccion: e.target.value }))} className={inp} required>
            <option value="">Seleccionar provincia...</option>
            {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Regimen *</label>
          <select value={form.regimen} onChange={e => setForm(f => ({ ...f, regimen: e.target.value }))} className={inp}>
            {REGIMENES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Alicuota (%)</label>
          <input type="number" min="0" step="0.01" value={form.alicuota}
            onChange={e => setForm(f => ({ ...f, alicuota: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Base imponible ($)</label>
          <input type="number" min="0" step="0.01" value={form.baseImponible}
            onChange={e => setForm(f => ({ ...f, baseImponible: e.target.value }))} className={inp} required />
        </div>
        <div>
          <label className={lbl}>Impuesto (calculado)</label>
          <input type="text" readOnly value={formatMoney(impuesto)} className={`${inp} bg-gray-50`} />
        </div>
        <div>
          <label className={lbl}>Retenciones ($)</label>
          <input type="number" min="0" step="0.01" value={form.retenciones}
            onChange={e => setForm(f => ({ ...f, retenciones: parseFloat(e.target.value) || 0 }))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Percepciones ($)</label>
          <input type="number" min="0" step="0.01" value={form.percepciones}
            onChange={e => setForm(f => ({ ...f, percepciones: parseFloat(e.target.value) || 0 }))} className={inp} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (declaracion ? 'Actualizar' : 'Crear')}
        </button>
      </div>
    </form>
  );
}

export default function IIBB() {
  const [empresas, setEmpresas] = useState([]);
  const [declaraciones, setDeclaraciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [empresaId, setEmpresaId] = useState('');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [tab, setTab] = useState('mes');
  const [resumenAnual, setResumenAnual] = useState([]);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setEmpresaId(data.data[0].id);
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const { data } = await api.get('/iibb', { params: { empresaId, anio, mes } });
      setDeclaraciones(data || []);
    } catch {
      toast.error('Error al cargar declaraciones');
    } finally {
      setLoading(false);
    }
  }, [empresaId, anio, mes]);

  const fetchAnual = useCallback(async () => {
    if (!empresaId) return;
    try {
      const promises = MESES.map((_, i) =>
        api.get('/iibb', { params: { empresaId, anio, mes: i + 1 } }).then(r => ({ mes: i + 1, items: r.data || [] }))
      );
      const results = await Promise.all(promises);
      setResumenAnual(results);
    } catch {}
  }, [empresaId, anio]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (tab === 'anual') fetchAnual(); }, [tab, fetchAnual]);

  const handlePresentar = async (id) => {
    try {
      await api.put(`/iibb/${id}/presentar`);
      toast.success('Declaracion presentada');
      fetchData();
    } catch { toast.error('Error al presentar'); }
  };

  const handlePagar = async (id) => {
    try {
      await api.put(`/iibb/${id}`, { estado: 'PAGADA' });
      toast.success('Marcada como pagada');
      fetchData();
    } catch { toast.error('Error al actualizar'); }
  };

  const totalBase = declaraciones.reduce((s, d) => s + parseFloat(d.baseImponible || 0), 0);
  const totalImpuesto = declaraciones.reduce((s, d) => s + parseFloat(d.impuesto || 0), 0);
  const totalSaldo = declaraciones.reduce((s, d) => {
    const saldo = parseFloat(d.impuesto || 0) - parseFloat(d.retenciones || 0) - parseFloat(d.percepciones || 0);
    return s + saldo;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ingresos Brutos</h1>
        <button onClick={() => { setEditando(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <PlusIcon className="w-4 h-4" /> Nueva Declaracion
        </button>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select value={mes} onChange={e => setMes(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" value={anio} onChange={e => setAnio(parseInt(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm w-24" placeholder="Año" />
        <div className="flex border rounded-lg overflow-hidden ml-auto">
          <button onClick={() => setTab('mes')}
            className={`px-4 py-2 text-sm ${tab === 'mes' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            Mes
          </button>
          <button onClick={() => setTab('anual')}
            className={`px-4 py-2 text-sm ${tab === 'anual' ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
            Resumen anual
          </button>
        </div>
      </div>

      {tab === 'mes' && (
        <>
          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Cargando...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Jurisdiccion</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Regimen</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Base Imponible</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Alicuota</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Impuesto</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Retenciones</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Percepciones</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {declaraciones.map(d => {
                      const saldo = parseFloat(d.impuesto || 0) - parseFloat(d.retenciones || 0) - parseFloat(d.percepciones || 0);
                      return (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{d.jurisdiccion}</td>
                          <td className="px-4 py-3 text-gray-600">{d.regimen}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatMoney(d.baseImponible)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{d.alicuota}%</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatMoney(d.impuesto)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatMoney(d.retenciones)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatMoney(d.percepciones)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(saldo)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[d.estado] || 'bg-gray-100 text-gray-600'}`}>
                              {d.estado || 'PENDIENTE'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1">
                              {d.estado !== 'PRESENTADA' && d.estado !== 'PAGADA' && (
                                <button onClick={() => handlePresentar(d.id)}
                                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                                  Presentar
                                </button>
                              )}
                              {d.estado !== 'PAGADA' && (
                                <button onClick={() => handlePagar(d.id)}
                                  className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">
                                  Pagada
                                </button>
                              )}
                              <button onClick={() => { setEditando(d); setShowForm(true); }}
                                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                                Editar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {declaraciones.length > 0 && (
                    <tfoot className="bg-gray-50 border-t font-semibold text-sm">
                      <tr>
                        <td className="px-4 py-3" colSpan={2}>Totales</td>
                        <td className="px-4 py-3 text-right">{formatMoney(totalBase)}</td>
                        <td />
                        <td className="px-4 py-3 text-right">{formatMoney(totalImpuesto)}</td>
                        <td colSpan={2} />
                        <td className="px-4 py-3 text-right">{formatMoney(totalSaldo)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
                {declaraciones.length === 0 && (
                  <div className="p-8 text-center text-gray-400">Sin declaraciones en este periodo</div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'anual' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Mes</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Declaraciones</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Base Imponible</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Impuesto</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo a pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumenAnual.map(({ mes: m, items }) => {
                  const base = items.reduce((s, d) => s + parseFloat(d.baseImponible || 0), 0);
                  const imp = items.reduce((s, d) => s + parseFloat(d.impuesto || 0), 0);
                  const saldo = items.reduce((s, d) => {
                    return s + parseFloat(d.impuesto || 0) - parseFloat(d.retenciones || 0) - parseFloat(d.percepciones || 0);
                  }, 0);
                  return (
                    <tr key={m} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{MESES[m - 1]}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{items.length}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatMoney(base)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatMoney(imp)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(saldo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar Declaracion' : 'Nueva Declaracion'}>
          <DeclaracionForm
            declaracion={editando}
            empresaId={empresaId}
            anio={anio}
            mes={mes}
            onSave={() => { setShowForm(false); fetchData(); }}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
    </div>
  );
}
