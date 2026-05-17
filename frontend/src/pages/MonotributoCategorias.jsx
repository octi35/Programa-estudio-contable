import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, PencilIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import api from '../api/client';
import Modal from '../components/Modal';
import { confirm } from '../components/confirm';
import { formatMoney, formatDate } from '../utils/format';

const FILA_VACIA = {
  categoria: '', vigenciaDesde: new Date().toISOString().slice(0, 10),
  limiteIngresos: 0, cuotaImpuesto: 0, cuotaObraSocial: 0, cuotaJubilacion: 0, total: 0,
};

function CategoriaForm({ inicial, onSave, onCancel }) {
  const [f, setF] = useState(inicial || FILA_VACIA);
  const [guardando, setGuardando] = useState(false);

  const calcTotal = () => Number(f.cuotaImpuesto || 0) + Number(f.cuotaObraSocial || 0) + Number(f.cuotaJubilacion || 0);

  const guardar = async () => {
    if (!f.categoria || !f.vigenciaDesde) { toast.error('Categoría y vigencia son requeridos'); return; }
    setGuardando(true);
    try {
      const data = {
        categoria: f.categoria.toUpperCase().trim(),
        vigenciaDesde: f.vigenciaDesde,
        limiteIngresos: Number(f.limiteIngresos),
        cuotaImpuesto: Number(f.cuotaImpuesto),
        cuotaObraSocial: Number(f.cuotaObraSocial),
        cuotaJubilacion: Number(f.cuotaJubilacion),
        total: f.total ? Number(f.total) : calcTotal(),
      };
      if (inicial?.id) {
        await api.put(`/monotributo/categorias/${inicial.id}`, data);
      } else {
        await api.post('/monotributo/categorias', data);
      }
      toast.success('Categoría guardada');
      onSave();
    } catch (e) {
      // El interceptor ya mostró el error
    } finally { setGuardando(false); }
  };

  const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Categoría *</label>
          <input className={inp} value={f.categoria}
            onChange={e => setF(p => ({ ...p, categoria: e.target.value.toUpperCase() }))}
            placeholder="A, B, C..." maxLength={3} />
        </div>
        <div>
          <label className={lbl}>Vigencia desde *</label>
          <input type="date" className={inp} value={f.vigenciaDesde}
            onChange={e => setF(p => ({ ...p, vigenciaDesde: e.target.value }))} />
        </div>
      </div>

      <div>
        <label className={lbl}>Límite de ingresos anuales</label>
        <input type="number" className={inp} value={f.limiteIngresos}
          onChange={e => setF(p => ({ ...p, limiteIngresos: e.target.value }))} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Cuota impuesto</label>
          <input type="number" className={inp} value={f.cuotaImpuesto}
            onChange={e => setF(p => ({ ...p, cuotaImpuesto: e.target.value, total: '' }))} />
        </div>
        <div>
          <label className={lbl}>Cuota Obra Social</label>
          <input type="number" className={inp} value={f.cuotaObraSocial}
            onChange={e => setF(p => ({ ...p, cuotaObraSocial: e.target.value, total: '' }))} />
        </div>
        <div>
          <label className={lbl}>Cuota Jubilación</label>
          <input type="number" className={inp} value={f.cuotaJubilacion}
            onChange={e => setF(p => ({ ...p, cuotaJubilacion: e.target.value, total: '' }))} />
        </div>
      </div>

      <div>
        <label className={lbl}>Total cuota mensual (vacío → se calcula)</label>
        <input type="number" className={inp} value={f.total}
          onChange={e => setF(p => ({ ...p, total: e.target.value }))}
          placeholder={`Auto: ${formatMoney(calcTotal())}`} />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="btn-primary">
          {guardando ? 'Guardando...' : 'Guardar categoría'}
        </button>
      </div>
    </div>
  );
}

export default function MonotributoCategorias() {
  const [filas, setFilas] = useState([]);
  const [vigentes, setVigentes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {modo, fila}

  const cargar = async () => {
    setLoading(true);
    try {
      const [hist, vig] = await Promise.all([
        api.get('/monotributo/categorias/historial'),
        api.get('/monotributo/categorias'),
      ]);
      setFilas(hist.data);
      setVigentes(vig.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const eliminar = async (fila) => {
    if (!await confirm({
      title: `Eliminar categoría ${fila.categoria}`,
      message: 'Se elimina esta fila del historial de categorías de Monotributo.',
      details: 'Los monotributistas con esta categoría asignada no se modifican, pero podrían quedar sin categoría vigente válida.',
      confirmText: 'Eliminar',
      danger: true,
    })) return;
    try {
      await api.delete(`/monotributo/categorias/${fila.id}`);
      toast.success('Eliminada');
      cargar();
    } catch (_) { /* interceptor */ }
  };

  const cargarTabla2024 = async () => {
    if (!await confirm({
      title: 'Cargar tabla AFIP 2024',
      message: 'Se importarán las 11 categorías (A a K) con sus valores oficiales 2024, con vigencia desde 01/01/2024.',
      details: 'Podés editar los valores después. Si ya existen filas con esa misma vigencia, se omitirán.',
      confirmText: 'Cargar tabla',
    })) return;

    const tabla2024 = [
      { categoria: 'A', limiteIngresos: 6450000,  cuotaImpuesto: 2960,   cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'B', limiteIngresos: 9450000,  cuotaImpuesto: 5020,   cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'C', limiteIngresos: 13250000, cuotaImpuesto: 7960,   cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'D', limiteIngresos: 16450000, cuotaImpuesto: 11860,  cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'E', limiteIngresos: 19350000, cuotaImpuesto: 17360,  cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'F', limiteIngresos: 24250000, cuotaImpuesto: 24060,  cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'G', limiteIngresos: 29000000, cuotaImpuesto: 30960,  cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'H', limiteIngresos: 44000000, cuotaImpuesto: 70160,  cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'I', limiteIngresos: 49250000, cuotaImpuesto: 86560,  cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'J', limiteIngresos: 56400000, cuotaImpuesto: 104060, cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
      { categoria: 'K', limiteIngresos: 68000000, cuotaImpuesto: 124360, cuotaObraSocial: 5018, cuotaJubilacion: 1521 },
    ];

    try {
      const res = await api.post('/monotributo/categorias/bulk', {
        vigenciaDesde: '2024-01-01',
        categorias: tabla2024,
      });
      toast.success(`${res.data.creadas} categorías importadas`);
      cargar();
    } catch (_) { /* interceptor */ }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorías Monotributo</h1>
          <p className="text-gray-500 text-sm">Tabla AFIP con vigencias. Las recategorizaciones y alertas usan estos valores.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargarTabla2024} className="btn-secondary text-sm">
            <ArrowDownTrayIcon className="w-4 h-4" /> Cargar tabla 2024
          </button>
          <button onClick={() => setModal({ modo: 'crear' })} className="btn-primary text-sm">
            <PlusIcon className="w-4 h-4" /> Nueva categoría
          </button>
        </div>
      </div>

      {/* Vigentes hoy */}
      <div className="card p-4">
        <h2 className="font-semibold text-gray-700 text-sm mb-3">Vigentes hoy ({vigentes.length})</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {vigentes.map(v => (
            <div key={v.categoria} className="border rounded-lg p-2 text-xs bg-gray-50">
              <p className="font-bold text-base text-gray-900">{v.categoria}</p>
              <p className="text-gray-500">Hasta {formatMoney(v.limiteIngresos)}</p>
              <p className="font-medium text-blue-700 mt-1">{formatMoney(v.total)}/mes</p>
              {v._source === 'fallback' && <p className="text-orange-600 text-[10px] mt-1">⚠ Sin configurar (fallback)</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Historial */}
      <div className="card">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-700 text-sm">Historial de categorías ({filas.length})</h2>
        </div>
        {loading ? (
          <div className="p-10 text-center">
            <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2 text-left">Categoría</th>
                <th className="px-5 py-2 text-left">Vigencia desde</th>
                <th className="px-5 py-2 text-right">Límite ingresos</th>
                <th className="px-5 py-2 text-right">Impuesto</th>
                <th className="px-5 py-2 text-right">Obra Social</th>
                <th className="px-5 py-2 text-right">Jubilación</th>
                <th className="px-5 py-2 text-right">Total</th>
                <th className="px-5 py-2 text-center w-20">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map(f => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2 font-bold">{f.categoria}</td>
                  <td className="px-5 py-2 text-gray-600">{formatDate(f.vigenciaDesde)}</td>
                  <td className="px-5 py-2 text-right">{formatMoney(f.limiteIngresos)}</td>
                  <td className="px-5 py-2 text-right">{formatMoney(f.cuotaImpuesto)}</td>
                  <td className="px-5 py-2 text-right">{formatMoney(f.cuotaObraSocial)}</td>
                  <td className="px-5 py-2 text-right">{formatMoney(f.cuotaJubilacion)}</td>
                  <td className="px-5 py-2 text-right font-bold text-blue-700">{formatMoney(f.total)}</td>
                  <td className="px-5 py-2 text-center">
                    <button onClick={() => setModal({ modo: 'editar', fila: f })} className="text-blue-500 hover:text-blue-700 mr-2">
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => eliminar(f)} className="text-red-500 hover:text-red-700">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                  Aún no hay categorías cargadas. Usá "Cargar tabla 2024" para empezar.
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal open onClose={() => setModal(null)} title={modal.modo === 'editar' ? 'Editar categoría' : 'Nueva categoría'}>
          <CategoriaForm inicial={modal.fila} onCancel={() => setModal(null)} onSave={() => { setModal(null); cargar(); }} />
        </Modal>
      )}
    </div>
  );
}
