import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { formatMoney, formatDate, MESES } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, CheckIcon, BoltIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';
import { confirm } from '../components/confirm';

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

const PERIODICIDADES = ['MENSUAL', 'TRIMESTRAL', 'ANUAL'];
const ESTADOS_FACTURA = ['PENDIENTE', 'ENVIADA', 'COBRADA'];

const ESTADO_BADGE = {
  PENDIENTE: 'bg-yellow-100 text-yellow-700',
  ENVIADA: 'bg-blue-100 text-blue-700',
  COBRADA: 'bg-green-100 text-green-700',
};

function HonorarioForm({ honorario, empresas, onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    empresaId: honorario?.empresaId || '',
    descripcion: honorario?.descripcion || '',
    periodicidad: honorario?.periodicidad || 'MENSUAL',
    importe: honorario?.importe || '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      if (honorario?.id) {
        await api.put(`/honorarios/${honorario.id}`, form);
        toast.success('Honorario actualizado');
      } else {
        await api.post('/honorarios', form);
        toast.success('Honorario creado');
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
          <label className={lbl}>Empresa *</label>
          <select value={form.empresaId} onChange={e => setForm(f => ({ ...f, empresaId: e.target.value }))} className={inp} required>
            <option value="">Seleccionar empresa...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={lbl}>Descripcion *</label>
          <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} className={inp} required />
        </div>
        <div>
          <label className={lbl}>Periodicidad</label>
          <select value={form.periodicidad} onChange={e => setForm(f => ({ ...f, periodicidad: e.target.value }))} className={inp}>
            {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Importe ($) *</label>
          <input type="number" min="0" step="0.01" value={form.importe}
            onChange={e => setForm(f => ({ ...f, importe: e.target.value }))} className={inp} required />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button type="submit" disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (honorario ? 'Actualizar' : 'Crear')}
        </button>
      </div>
    </form>
  );
}

export default function Honorarios() {
  const [tab, setTab] = useState('fijos');
  const [empresas, setEmpresas] = useState([]);
  const [honorarios, setHonorarios] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);

  const [filtros, setFiltros] = useState({
    empresaId: '',
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
    estado: '',
  });
  const [facturando, setFacturando] = useState(false);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
    }).catch(() => {});
  }, []);

  const fetchHonorarios = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/honorarios');
      setHonorarios(data || []);
    } catch { toast.error('Error al cargar honorarios'); }
    finally { setLoading(false); }
  }, []);

  const fetchFacturas = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/honorarios/facturas', { params: filtros });
      setFacturas(data || []);
    } catch { toast.error('Error al cargar facturas'); }
    finally { setLoading(false); }
  }, [filtros]);

  useEffect(() => { if (tab === 'fijos') fetchHonorarios(); }, [tab, fetchHonorarios]);
  useEffect(() => { if (tab === 'facturas') fetchFacturas(); }, [tab, fetchFacturas]);

  const handleFacturarMes = async () => {
    setFacturando(true);
    try {
      const { data } = await api.post('/honorarios/facturas', { mes: filtros.mes, anio: filtros.anio });
      toast.success(`${data.count || 0} facturas generadas`);
      if (tab === 'facturas') fetchFacturas();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al facturar');
    } finally {
      setFacturando(false);
    }
  };

  // Emite CAE en AFIP para todas las facturas PENDIENTES visibles.
  const handleFacturarMasivoAfip = async () => {
    const pendientes = (facturas || []).filter(f => f.estado === 'PENDIENTE');
    if (pendientes.length === 0) {
      toast('No hay facturas PENDIENTES para emitir', { icon: 'ℹ️' });
      return;
    }
    const totalImp = pendientes.reduce((s, f) => s + parseFloat(f.total || 0), 0);
    if (!await confirm({
      title: `Emitir ${pendientes.length} facturas en AFIP`,
      message: `Se solicitará CAE a AFIP para ${pendientes.length} factura(s) por un total de $${totalImp.toLocaleString('es-AR', { minimumFractionDigits: 2 })}.`,
      details: [
        'El sistema arma cada Factura A/B/C según la condición IVA del cliente.',
        'Si AFIP_AMBIENTE=SIMULADO o no hay certificado configurado, se simulan los CAE.',
        'Las facturas exitosas quedan marcadas como ENVIADAS con su CAE registrado.',
        'Los errores se devuelven en el reporte sin afectar las que sí se emitieron.',
      ],
      confirmText: 'Emitir CAE',
    })) return;

    const toastId = toast.loading(`Emitiendo ${pendientes.length} facturas...`);
    try {
      const r = await api.post('/afip/facturar-honorarios', { facturaIds: pendientes.map(f => f.id) });
      const { total, exitosos, errores } = r.data;
      toast.success(
        `Emitidas: ${exitosos}/${total}` + (errores > 0 ? ` · Errores: ${errores}` : ''),
        { id: toastId, duration: 6000 }
      );
      fetchFacturas();
    } catch (_) { toast.dismiss(toastId); }
  };

  const handleMarcarCobrada = async (id) => {
    try {
      await api.put(`/honorarios/facturas/${id}`, { estado: 'COBRADA' });
      toast.success('Marcada como cobrada');
      fetchFacturas();
    } catch { toast.error('Error al actualizar'); }
  };

  const handleDesactivar = async (id) => {
    if (!await confirm({
      title: 'Desactivar honorario',
      message: 'El honorario dejará de generar facturas automáticas y de aparecer como pendiente de cobro.',
      details: 'Las facturas ya emitidas no se modifican.',
      confirmText: 'Desactivar',
      danger: true,
    })) return;
    try {
      await api.delete(`/honorarios/${id}`);
      toast.success('Desactivado');
      fetchHonorarios();
    } catch { toast.error('Error al desactivar'); }
  };

  // Agrupados por empresa
  const honorariosPorEmpresa = honorarios.reduce((acc, h) => {
    const key = h.empresa?.razonSocial || h.empresaId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});

  const totalPendiente = Array.isArray(facturas) ? facturas.filter(f => f.estado !== 'COBRADA').reduce((s, f) => s + parseFloat(f.total || 0), 0) : 0;
  const totalCobrado = Array.isArray(facturas) ? facturas.filter(f => f.estado === 'COBRADA').reduce((s, f) => s + parseFloat(f.total || 0), 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Honorarios del Estudio</h1>
        <div className="flex gap-2">
          {tab === 'fijos' && (
            <button onClick={() => { setEditando(null); setShowForm(true); }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              <PlusIcon className="w-4 h-4" /> Honorario
            </button>
          )}
          {tab === 'facturas' && (
            <>
              <button onClick={handleFacturarMes} disabled={facturando}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                <CheckIcon className="w-4 h-4" />
                {facturando ? 'Generando...' : `Facturar ${MESES[filtros.mes - 1]} ${filtros.anio}`}
              </button>
              <button onClick={handleFacturarMasivoAfip}
                className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
                <BoltIcon className="w-4 h-4" />
                Emitir CAE masivo (AFIP)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {[{ key: 'fijos', label: 'Honorarios Fijos' }, { key: 'facturas', label: 'Facturas' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'fijos' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-500">Cargando...</div>
          ) : Object.keys(honorariosPorEmpresa).length === 0 ? (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400">Sin honorarios configurados</div>
          ) : (
            Object.entries(honorariosPorEmpresa).map(([empresa, items]) => (
              <div key={empresa} className="bg-white rounded-xl border overflow-hidden">
                <div className="px-6 py-3 bg-gray-50 border-b">
                  <h3 className="font-semibold text-gray-800">{empresa}</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Descripcion</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Periodicidad</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Importe</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map(h => (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800">{h.descripcion}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{h.periodicidad}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(h.importe)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setEditando(h); setShowForm(true); }}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                              Editar
                            </button>
                            <button onClick={() => handleDesactivar(h.id)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">
                              Desactivar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'facturas' && (
        <>
          <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
            <select value={filtros.empresaId} onChange={e => setFiltros(f => ({ ...f, empresaId: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
              <option value="">Todas las empresas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
            </select>
            <select value={filtros.mes} onChange={e => setFiltros(f => ({ ...f, mes: parseInt(e.target.value) }))}
              className="border rounded-lg px-3 py-2 text-sm">
              {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <input type="number" value={filtros.anio} onChange={e => setFiltros(f => ({ ...f, anio: parseInt(e.target.value) }))}
              className="border rounded-lg px-3 py-2 text-sm w-24" />
            <select value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Todos los estados</option>
              {ESTADOS_FACTURA.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Cargando...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Concepto</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Array.isArray(facturas) && facturas.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{f.empresa?.razonSocial}</td>
                      <td className="px-4 py-3 text-gray-600">{f.concepto}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(f.fecha)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(f.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[f.estado] || 'bg-gray-100 text-gray-600'}`}>
                          {f.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {f.estado !== 'COBRADA' && (
                          <button onClick={() => handleMarcarCobrada(f.id)}
                            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">
                            Cobrada
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {facturas.length === 0 && !loading && (
              <div className="p-8 text-center text-gray-400">Sin facturas en este periodo</div>
            )}
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
              <p className="text-sm text-yellow-600 font-medium">Total pendiente de cobro</p>
              <p className="text-2xl font-bold text-yellow-700 mt-1">{formatMoney(totalPendiente)}</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-4">
              <p className="text-sm text-green-600 font-medium">Total cobrado en el periodo</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{formatMoney(totalCobrado)}</p>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar Honorario' : 'Nuevo Honorario'}>
          <HonorarioForm
            honorario={editando}
            empresas={empresas}
            onSave={() => { setShowForm(false); fetchHonorarios(); }}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
    </div>
  );
}
