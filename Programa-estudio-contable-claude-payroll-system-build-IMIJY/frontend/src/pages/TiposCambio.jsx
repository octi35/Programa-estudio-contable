import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { formatDate } from '../utils/format';
import toast from 'react-hot-toast';
import { PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

const MONEDAS = ['USD', 'EUR', 'BRL', 'GBP', 'CHF', 'CAD', 'JPY', 'CNY'];
const TIPOS_CAMBIO = ['OFICIAL', 'BLUE', 'MEP', 'CCL'];

const TIPO_BADGE = {
  OFICIAL: 'bg-blue-100 text-blue-700',
  BLUE: 'bg-gray-800 text-gray-100',
  MEP: 'bg-purple-100 text-purple-700',
  CCL: 'bg-orange-100 text-orange-700',
};

function CotizacionForm({ onSave, onCancel }) {
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    moneda: 'USD',
    tipo: 'OFICIAL',
    fecha: new Date().toISOString().split('T')[0],
    compra: '',
    venta: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post('/cambios', form);
      toast.success('Cotizacion registrada');
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
          <label className={lbl}>Moneda *</label>
          <select value={form.moneda} onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))} className={inp}>
            {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Tipo *</label>
          <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={inp}>
            {TIPOS_CAMBIO.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Fecha *</label>
          <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className={inp} required />
        </div>
        <div />
        <div>
          <label className={lbl}>Compra ($)</label>
          <input type="number" min="0" step="0.01" value={form.compra}
            onChange={e => setForm(f => ({ ...f, compra: e.target.value }))} className={inp} />
        </div>
        <div>
          <label className={lbl}>Venta ($) *</label>
          <input type="number" min="0" step="0.01" value={form.venta}
            onChange={e => setForm(f => ({ ...f, venta: e.target.value }))} className={inp} required />
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

// SVG Line chart — sin librerias externas
function LineChart({ data, width = 600, height = 160 }) {
  if (!data || data.length < 2) return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Sin datos suficientes para el grafico</div>
  );

  const valores = data.map(d => parseFloat(d.venta || 0));
  const minV = Math.min(...valores) * 0.995;
  const maxV = Math.max(...valores) * 1.005;
  const rango = maxV - minV || 1;
  const padL = 60, padR = 20, padT = 10, padB = 30;
  const W = width - padL - padR;
  const H = height - padT - padB;

  const toX = (i) => padL + (i / (data.length - 1)) * W;
  const toY = (v) => padT + H - ((v - minV) / rango) * H;

  const points = data.map((d, i) => `${toX(i)},${toY(parseFloat(d.venta || 0))}`).join(' ');

  // Ticks Y
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minV + (rango * i) / yTicks);

  // Ticks X (cada ~5 puntos)
  const xStep = Math.max(1, Math.floor(data.length / 5));
  const xTicks = data.filter((_, i) => i % xStep === 0 || i === data.length - 1);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Grid */}
      {yTickVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={toY(v)} x2={padL + W} y2={toY(v)} stroke="#e5e7eb" strokeWidth="1" />
          <text x={padL - 6} y={toY(v) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">
            {v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </text>
        </g>
      ))}
      {/* X ticks */}
      {xTicks.map((d, i) => {
        const idx = data.indexOf(d);
        return (
          <text key={i} x={toX(idx)} y={height - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {formatDate(d.fecha)}
          </text>
        );
      })}
      {/* Line */}
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
      {/* Dots */}
      {data.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(parseFloat(d.venta || 0))} r="2.5" fill="#2563eb" />
      ))}
    </svg>
  );
}

export default function TiposCambio() {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filtros, setFiltros] = useState({
    moneda: 'USD',
    tipo: '',
    fechaDesde: '',
    fechaHasta: '',
  });
  const [graficoDatos, setGraficoDatos] = useState([]);

  const fetchCotizaciones = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/cambios', { params: filtros });
      setCotizaciones(data || []);
    } catch { toast.error('Error al cargar cotizaciones'); }
    finally { setLoading(false); }
  }, [filtros]);

  const fetchGrafico = useCallback(async () => {
    try {
      const { data } = await api.get('/cambios', { params: { moneda: 'USD', tipo: 'OFICIAL', limit: 30 } });
      setGraficoDatos((data || []).slice(0, 30).reverse());
    } catch {}
  }, []);

  useEffect(() => { fetchCotizaciones(); }, [fetchCotizaciones]);
  useEffect(() => { fetchGrafico(); }, [fetchGrafico]);

  const [sincronizando, setSincronizando] = useState(false);
  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const r = await api.post('/tipos-cambio/sync');
      const actualizados = (r.data.resultados || []).filter(x => x.accion === 'actualizado').length;
      toast.success(actualizados > 0
        ? `Sincronizado: ${actualizados} cotizaciones actualizadas`
        : 'Sincronizado: sin cambios respecto al último registro');
      fetchCotizaciones();
      fetchGrafico();
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo sincronizar');
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tipos de Cambio</h1>
        <div className="flex gap-2">
          <button onClick={sincronizar} disabled={sincronizando}
            className="flex items-center gap-2 border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            <ArrowPathIcon className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
            {sincronizando ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <PlusIcon className="w-4 h-4" /> Cotizacion
          </button>
        </div>
      </div>

      {/* Grafico USD */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Evolucion USD Oficial — ultimos 30 registros</h2>
        <LineChart data={graficoDatos} />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={filtros.moneda} onChange={e => setFiltros(f => ({ ...f, moneda: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Todas las monedas</option>
          {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los tipos</option>
          {TIPOS_CAMBIO.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" value={filtros.fechaDesde} onChange={e => setFiltros(f => ({ ...f, fechaDesde: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm" placeholder="Desde" />
        <input type="date" value={filtros.fechaHasta} onChange={e => setFiltros(f => ({ ...f, fechaHasta: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm" placeholder="Hasta" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Moneda</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Compra</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Venta</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Spread</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cotizaciones.map(c => {
                const spread = c.venta && c.compra
                  ? ((parseFloat(c.venta) - parseFloat(c.compra)) / parseFloat(c.compra) * 100).toFixed(2)
                  : null;
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.fecha)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{c.moneda}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TIPO_BADGE[c.tipo] || 'bg-gray-100 text-gray-600'}`}>
                        {c.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {c.compra ? `$ ${parseFloat(c.compra).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      $ {parseFloat(c.venta || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {spread !== null ? `${spread}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {cotizaciones.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-400">Sin cotizaciones registradas con los filtros seleccionados</div>
        )}
      </div>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title="Nueva Cotizacion">
          <CotizacionForm
            onSave={() => { setShowForm(false); fetchCotizaciones(); fetchGrafico(); }}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
    </div>
  );
}
