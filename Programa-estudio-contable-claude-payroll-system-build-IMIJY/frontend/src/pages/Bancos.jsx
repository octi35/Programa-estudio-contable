import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { formatMoney, formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, XMarkIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import ImportExcelButton from '../components/ImportExcelButton';

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

const BANCOS_AR = ['Banco Nacion','Banco Provincia','Banco Ciudad','Galicia','Santander','BBVA','HSBC','Macro','Supervielle','Patagonia','Brubank','Naranja X','Otro'];
const TIPOS_CUENTA = ['CUENTA_CORRIENTE','CAJA_AHORRO','CUENTA_INVERSION'];

function CuentaForm({ cuenta, empresaId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    banco: cuenta?.banco || '',
    tipo: cuenta?.tipo || 'CUENTA_CORRIENTE',
    numero: cuenta?.numero || '',
    cbu: cuenta?.cbu || '',
    alias: cuenta?.alias || '',
    moneda: cuenta?.moneda || 'ARS',
    saldoInicial: cuenta?.saldoInicial || 0,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      if (cuenta?.id) {
        await api.put(`/bancos/cuentas/${cuenta.id}`, form);
        toast.success('Cuenta actualizada');
      } else {
        await api.post('/bancos/cuentas', { ...form, empresaId });
        toast.success('Cuenta creada');
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
        <div>
          <label className={lbl}>Banco *</label>
          <select value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} className={inp} required>
            <option value="">Seleccionar...</option>
            {BANCOS_AR.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Tipo de cuenta *</label>
          <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inp}>
            {TIPOS_CUENTA.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Numero de cuenta</label>
          <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Moneda</label>
          <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className={inp}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={lbl}>CBU</label>
          <input value={form.cbu} onChange={e => setForm(f => ({ ...f, cbu: e.target.value }))}
            className={inp} maxLength={22} placeholder="22 digitos" />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Alias</label>
          <input value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))} className={inp} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Saldo inicial ($)</label>
          <input type="number" step="0.01" value={form.saldoInicial}
            onChange={e => setForm(f => ({ ...f, saldoInicial: parseFloat(e.target.value) || 0 }))} className={inp} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (cuenta ? 'Actualizar' : 'Crear')}
        </button>
      </div>
    </form>
  );
}

function MovimientoForm({ cuentaId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ fecha: new Date().toISOString().split('T')[0], descripcion: '', debe: '', haber: '', referencia: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post(`/bancos/cuentas/${cuentaId}/movimientos`, form);
      toast.success('Movimiento registrado');
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
          <label className={lbl}>Fecha *</label>
          <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} required />
        </div>
        <div>
          <label className={lbl}>Referencia</label>
          <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className={inp} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Descripcion *</label>
          <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className={inp} required />
        </div>
        <div>
          <label className={lbl}>Debe (egreso $)</label>
          <input type="number" min="0" step="0.01" value={form.debe}
            onChange={e => setForm(f => ({ ...f, debe: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Haber (ingreso $)</label>
          <input type="number" min="0" step="0.01" value={form.haber}
            onChange={e => setForm(f => ({ ...f, haber: e.target.value }))} className={inp} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Registrar'}
        </button>
      </div>
    </form>
  );
}

export default function Bancos() {
  const [empresas, setEmpresas] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [cuentaSelec, setCuentaSelec] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCuentaForm, setShowCuentaForm] = useState(false);
  const [showMovForm, setShowMovForm] = useState(false);
  const [showImportar, setShowImportar] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importando, setImportando] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setEmpresaId(data.data[0].id);
    }).catch(() => {});
  }, []);

  const fetchCuentas = useCallback(async () => {
    if (!empresaId) return;
    try {
      const { data } = await api.get('/bancos/cuentas', { params: { empresaId } });
      setCuentas(data || []);
    } catch { toast.error('Error al cargar cuentas'); }
  }, [empresaId]);

  const fetchMovimientos = useCallback(async () => {
    if (!cuentaSelec) return;
    setLoading(true);
    try {
      const params = { cuentaId: cuentaSelec.id };
      if (fechaDesde) params.desde = fechaDesde;
      if (fechaHasta) params.hasta = fechaHasta;
      const { data } = await api.get(`/bancos/cuentas/${cuentaSelec.id}/movimientos`, { params });
      setMovimientos(data || []);
    } catch { toast.error('Error al cargar movimientos'); }
    finally { setLoading(false); }
  }, [cuentaSelec, fechaDesde, fechaHasta]);

  useEffect(() => { fetchCuentas(); }, [fetchCuentas]);
  useEffect(() => { fetchMovimientos(); }, [fetchMovimientos]);

  const handleConciliar = async (id, conciliado) => {
    try {
      await api.patch(`/bancos/movimientos/${id}`, { conciliado: !conciliado });
      fetchMovimientos();
    } catch { toast.error('Error al actualizar'); }
  };

  const handleImportar = async () => {
    if (!csvText.trim() || !cuentaSelec) return;
    setImportando(true);
    try {
      await api.post(`/bancos/cuentas/${cuentaSelec.id}/importar`, { data: csvText });
      toast.success('Movimientos importados');
      setShowImportar(false);
      setCsvText('');
      fetchMovimientos();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al importar');
    } finally {
      setImportando(false);
    }
  };

  const saldoCalculado = (cuenta) => {
    if (!cuenta) return 0;
    return parseFloat(cuenta.saldoInicial || 0) +
      movimientos.reduce((s, m) => s + parseFloat(m.haber || 0) - parseFloat(m.debe || 0), 0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cuentas Bancarias</h1>
        <button onClick={() => setShowCuentaForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <PlusIcon className="w-4 h-4" /> Cuenta
        </button>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <select value={empresaId} onChange={e => { setEmpresaId(e.target.value); setCuentaSelec(null); }}
          className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista de cuentas */}
        <div className="space-y-3">
          {cuentas.length === 0 ? (
            <div className="bg-white rounded-xl border p-6 text-center text-gray-400 text-sm">Sin cuentas registradas</div>
          ) : cuentas.map(c => (
            <button key={c.id} onClick={() => setCuentaSelec(c)}
              className={`w-full text-left bg-white rounded-xl border p-4 hover:shadow-md transition-all ${cuentaSelec?.id === c.id ? 'border-blue-400 ring-2 ring-blue-100' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-800">{c.banco}</p>
                  <p className="text-xs text-gray-500">{c.tipo?.replace(/_/g, ' ')} · {c.moneda}</p>
                  {c.alias && <p className="text-xs text-gray-400 mt-0.5">{c.alias}</p>}
                </div>
                <div className="text-right">
                  <p className="font-bold text-blue-700">{formatMoney(c.saldoActual ?? c.saldoInicial)}</p>
                </div>
              </div>
              {c.cbu && <p className="text-xs text-gray-400 mt-2 font-mono">CBU: {c.cbu}</p>}
            </button>
          ))}
        </div>

        {/* Detalle cuenta */}
        {cuentaSelec ? (
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">{cuentaSelec.banco} — {cuentaSelec.tipo?.replace(/_/g, ' ')}</h3>
                  <p className="text-sm text-gray-500">Saldo actual: <span className="font-bold text-blue-700">{formatMoney(saldoCalculado(cuentaSelec))}</span></p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <ImportExcelButton
                    endpoint={`/bancos/${cuentaSelec.id}/movimientos/importar-excel`}
                    label="Excel"
                    title="Importar movimientos desde Excel"
                    columnas={[
                      { nombre: 'fecha', descripcion: 'DD/MM/AAAA o YYYY-MM-DD', requerido: true },
                      { nombre: 'descripcion', descripcion: 'Descripción del movimiento' },
                      { nombre: 'referencia', descripcion: 'Nº de comprobante / orden' },
                      { nombre: 'debe', descripcion: 'Egreso (importe positivo)' },
                      { nombre: 'haber', descripcion: 'Ingreso (importe positivo)' },
                    ]}
                    ejemplo="15/05/2026, Transferencia de cliente XYZ, REF-1234, 0, 250000"
                    onSuccess={() => fetchMovimientos()}
                  />
                  <button onClick={() => setShowImportar(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50">
                    <ArrowUpTrayIcon className="w-4 h-4" /> CSV
                  </button>
                  <button onClick={() => setShowMovForm(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <PlusIcon className="w-4 h-4" /> Movimiento
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm" />
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
            </div>

            <div className="bg-white rounded-xl border overflow-hidden">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Cargando...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Descripcion</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Debe</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Haber</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo</th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600">Conc.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {movimientos.map(m => (
                        <tr key={m.id} className={`hover:bg-gray-50 ${m.conciliado ? 'opacity-70' : ''}`}>
                          <td className="px-4 py-3 text-gray-600">{formatDate(m.fecha)}</td>
                          <td className="px-4 py-3">
                            <p className="text-gray-800">{m.descripcion}</p>
                            {m.referencia && <p className="text-xs text-gray-400">{m.referencia}</p>}
                          </td>
                          <td className="px-4 py-3 text-right text-red-600">{m.debe > 0 ? formatMoney(m.debe) : '—'}</td>
                          <td className="px-4 py-3 text-right text-green-600">{m.haber > 0 ? formatMoney(m.haber) : '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(m.saldo)}</td>
                          <td className="px-4 py-3 text-center">
                            <input type="checkbox" checked={!!m.conciliado}
                              onChange={() => handleConciliar(m.id, m.conciliado)}
                              className="w-4 h-4 cursor-pointer" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {movimientos.length === 0 && (
                    <div className="p-8 text-center text-gray-400">Sin movimientos registrados</div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-white rounded-xl border p-12 text-center text-gray-400">
            Seleccione una cuenta para ver sus movimientos
          </div>
        )}
      </div>

      {showCuentaForm && (
        <Modal onClose={() => setShowCuentaForm(false)} title="Nueva Cuenta Bancaria">
          <CuentaForm
            empresaId={empresaId}
            onSave={() => { setShowCuentaForm(false); fetchCuentas(); }}
            onCancel={() => setShowCuentaForm(false)}
          />
        </Modal>
      )}

      {showMovForm && cuentaSelec && (
        <Modal onClose={() => setShowMovForm(false)} title="Registrar Movimiento">
          <MovimientoForm
            cuentaId={cuentaSelec.id}
            onSave={() => { setShowMovForm(false); fetchMovimientos(); }}
            onCancel={() => setShowMovForm(false)}
          />
        </Modal>
      )}

      {showImportar && cuentaSelec && (
        <Modal onClose={() => setShowImportar(false)} title="Importar Movimientos" size="lg">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Pegue los movimientos en formato CSV o JSON. CSV: <code className="bg-gray-100 px-1 rounded">fecha,descripcion,debe,haber,referencia</code>
            </p>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              rows={10}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="2024-01-15,Transferencia salarios,150000,,REF001"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowImportar(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleImportar} disabled={importando || !csvText.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
