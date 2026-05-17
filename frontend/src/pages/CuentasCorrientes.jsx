import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { formatMoney, formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

const MEDIOS_PAGO = ['TRANSFERENCIA', 'CHEQUE', 'EFECTIVO', 'DEBITO', 'CREDITO'];

const ESTADO_BADGE = {
  SALDADO: 'bg-green-100 text-green-700',
  PARCIAL: 'bg-yellow-100 text-yellow-700',
  PENDIENTE: 'bg-orange-100 text-orange-700',
  VENCIDO: 'bg-red-100 text-red-700',
};

function estadoComprobante(comp) {
  const saldo = parseFloat(comp.total || 0) - parseFloat(comp.pagado || 0);
  if (saldo <= 0) return 'SALDADO';
  if (parseFloat(comp.pagado || 0) > 0) return 'PARCIAL';
  if (comp.fechaVencimiento && new Date(comp.fechaVencimiento) < new Date()) return 'VENCIDO';
  return 'PENDIENTE';
}

function agingLabel(dias) {
  if (dias <= 30) return '0-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  return '+90';
}

function PagoForm({ comprobanteId, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    importe: '',
    medioPago: 'TRANSFERENCIA',
    referencia: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post(`/iva/comprobantes/${comprobanteId}/pago`, form);
      toast.success('Pago registrado');
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al registrar pago');
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
          <label className={lbl}>Importe ($) *</label>
          <input type="number" min="0" step="0.01" value={form.importe}
            onChange={e => setForm(f => ({ ...f, importe: e.target.value }))} className={inp} required />
        </div>
        <div>
          <label className={lbl}>Medio de pago</label>
          <select value={form.medioPago} onChange={e => setForm(f => ({ ...f, medioPago: e.target.value }))} className={inp}>
            {MEDIOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Referencia</label>
          <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} className={inp} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Registrar pago'}
        </button>
      </div>
    </form>
  );
}

export default function CuentasCorrientes() {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [tipo, setTipo] = useState('PROVEEDOR');
  const [entidades, setEntidades] = useState([]);
  const [entidadSelec, setEntidadSelec] = useState(null);
  const [comprobantes, setComprobantes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagoModal, setPagoModal] = useState(null);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setEmpresaId(data.data[0].id);
    }).catch(() => {});
  }, []);

  const fetchEntidades = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const { data } = await api.get('/iva/proveedores', { params: { empresaId, tipo } });
      setEntidades(data || []);
      setEntidadSelec(null);
    } catch { toast.error('Error al cargar'); }
    finally { setLoading(false); }
  }, [empresaId, tipo]);

  const fetchComprobantes = useCallback(async () => {
    if (!entidadSelec) return;
    try {
      const { data } = await api.get('/iva/comprobantes', {
        params: { empresaId, proveedorClienteId: entidadSelec.id, limit: 200 }
      });
      setComprobantes(data.data || data || []);
    } catch {}
  }, [entidadSelec, empresaId]);

  useEffect(() => { fetchEntidades(); }, [fetchEntidades]);
  useEffect(() => { fetchComprobantes(); }, [fetchComprobantes]);

  // Aging
  const aging = comprobantes.reduce((acc, c) => {
    const saldo = parseFloat(c.total || 0) - parseFloat(c.pagado || 0);
    if (saldo <= 0) return acc;
    const dias = c.fechaVencimiento
      ? Math.ceil((new Date() - new Date(c.fechaVencimiento)) / 86400000)
      : 0;
    const label = agingLabel(Math.max(0, dias));
    acc[label] = (acc[label] || 0) + saldo;
    return acc;
  }, {});

  const totalACobrarPagar = comprobantes.reduce((s, c) => {
    return s + Math.max(0, parseFloat(c.total || 0) - parseFloat(c.pagado || 0));
  }, 0);

  const overdue = comprobantes.filter(c => {
    const saldo = parseFloat(c.total || 0) - parseFloat(c.pagado || 0);
    return saldo > 0 && c.fechaVencimiento && new Date(c.fechaVencimiento) < new Date();
  }).reduce((s, c) => s + parseFloat(c.total || 0) - parseFloat(c.pagado || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cuentas Corrientes</h1>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-center">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <div className="flex border rounded-lg overflow-hidden">
          {[{ v: 'PROVEEDOR', l: 'Proveedores' }, { v: 'CLIENTE', l: 'Clientes' }].map(t => (
            <button key={t.v} onClick={() => setTipo(t.v)}
              className={`px-4 py-2 text-sm ${tipo === t.v ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lista entidades */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-semibold text-sm text-gray-700">{tipo === 'PROVEEDOR' ? 'Proveedores' : 'Clientes'}</h3>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">Cargando...</div>
          ) : entidades.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">Sin registros</div>
          ) : (
            <div className="divide-y">
              {entidades.map(e => (
                <button key={e.id} onClick={() => setEntidadSelec(e)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${entidadSelec?.id === e.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
                  <p className="font-medium text-gray-800 text-sm">{e.razonSocial}</p>
                  <p className="text-xs text-gray-500">{e.cuit}</p>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">{e.facturasAbiertas || 0} facturas</span>
                    <span className="text-xs font-semibold text-gray-700">{formatMoney(e.saldoTotal || 0)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detalle comprobantes */}
        {entidadSelec ? (
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">{entidadSelec.razonSocial}</h3>
                  <p className="text-sm text-gray-500">CUIT: {entidadSelec.cuit}</p>
                </div>
                <button onClick={() => setEntidadSelec(null)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600">Saldo total</p>
                  <p className="font-bold text-blue-700">{formatMoney(totalACobrarPagar)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs text-red-600">Vencido</p>
                  <p className="font-bold text-red-700">{formatMoney(overdue)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-xs">
                  {Object.entries(aging).map(([label, val]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-500">{label}d</span>
                      <span className="font-medium">{formatMoney(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Numero</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Pagado</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Saldo</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {comprobantes.map(c => {
                      const saldo = parseFloat(c.total || 0) - parseFloat(c.pagado || 0);
                      const estado = estadoComprobante(c);
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">{formatDate(c.fecha)}</td>
                          <td className="px-4 py-3 text-gray-600 font-mono">
                            {c.puntoVenta ? `${String(c.puntoVenta).padStart(4,'0')}-${String(c.numero).padStart(8,'0')}` : c.numero}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatMoney(c.total)}</td>
                          <td className="px-4 py-3 text-right text-green-600">{formatMoney(c.pagado || 0)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(saldo)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[estado]}`}>
                              {estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {saldo > 0 && (
                              <button onClick={() => setPagoModal(c)}
                                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 mx-auto">
                                <PlusIcon className="w-3 h-3" /> Pago
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {comprobantes.length === 0 && (
                  <div className="p-8 text-center text-gray-400">Sin comprobantes</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 bg-white rounded-xl border p-12 text-center text-gray-400">
            Seleccione un {tipo === 'PROVEEDOR' ? 'proveedor' : 'cliente'} para ver su cuenta corriente
          </div>
        )}
      </div>

      {/* Resumen global */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-500">Total a cobrar / pagar</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{formatMoney(entidades.reduce((s, e) => s + parseFloat(e.saldoTotal || 0), 0))}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-sm text-red-600">Overdue total</p>
          <p className="text-xl font-bold text-red-700 mt-1">{formatMoney(overdue)}</p>
        </div>
        <div className="bg-gray-50 border rounded-xl p-4">
          <p className="text-sm text-gray-500">Entidades con saldo</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{entidades.filter(e => parseFloat(e.saldoTotal || 0) > 0).length}</p>
        </div>
      </div>

      {pagoModal && (
        <Modal onClose={() => setPagoModal(null)} title="Registrar Pago">
          <PagoForm
            comprobanteId={pagoModal.id}
            onSave={() => { setPagoModal(null); fetchComprobantes(); }}
            onCancel={() => setPagoModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
