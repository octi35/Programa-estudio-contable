import React, { useState } from 'react';
import { CheckCircleIcon, TrashIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatMoney } from '../utils/format';

const natCls = { HABER: 'text-green-700', DESCUENTO: 'text-red-600', INFORMATIVO: 'text-gray-500' };

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

function toRow(d) {
  return {
    key: d.id || `tmp-${Math.random().toString(36).slice(2)}`,
    conceptoId: d.conceptoId || '',
    descripcion: d.descripcion || '',
    naturaleza: d.naturaleza || 'HABER',
    tipo: d.tipo || 'REMUNERATIVO',
    remunerativo: d.remunerativo ?? true,
    cantidad: d.cantidad != null ? String(d.cantidad) : '',
    valorUnitario: d.valorUnitario != null ? String(d.valorUnitario) : '',
    importe: String(Math.abs(num(d.importe || 0))),
    orden: d.orden ?? 0,
  };
}

/**
 * Editor reutilizable de líneas de una liquidación.
 * props:
 *  - detalles: array inicial de detalles
 *  - conceptos: catálogo para agregar líneas (requiere conceptoId válido)
 *  - onSave(detallesNormalizados): callback async al guardar
 *  - onCancel(): callback al cancelar
 *  - saving: boolean (estado de guardado externo)
 *  - title, saveLabel: textos opcionales
 */
export default function DetallesEditor({ detalles, conceptos = [], onSave, onCancel, saving = false, title = 'Editando importes — los cambios se guardan al confirmar', saveLabel = 'Guardar cambios' }) {
  const [rows, setRows] = useState(() => detalles.map(toRow));
  const [nuevoConceptoId, setNuevoConceptoId] = useState('');

  const setRow = (key, patch) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key) => setRows(rs => rs.filter(r => r.key !== key));

  const agregarLinea = () => {
    const c = conceptos.find(x => x.id === nuevoConceptoId);
    if (!c) { toast.error('Elegí un concepto para agregar'); return; }
    setRows(rs => [...rs, {
      key: `tmp-${Math.random().toString(36).slice(2)}`,
      conceptoId: c.id,
      descripcion: c.nombre,
      naturaleza: c.naturaleza,
      tipo: c.tipo,
      remunerativo: c.remunerativo ?? true,
      cantidad: '',
      valorUnitario: '',
      importe: '0',
      orden: (Math.max(0, ...rs.map(r => r.orden || 0)) || 0) + 10,
    }]);
    setNuevoConceptoId('');
  };

  const totalHaberes = rows.filter(r => r.naturaleza === 'HABER').reduce((s, r) => s + Math.abs(num(r.importe)), 0);
  const totalDescuentos = rows.filter(r => r.naturaleza === 'DESCUENTO').reduce((s, r) => s + Math.abs(num(r.importe)), 0);
  const totalNeto = totalHaberes - totalDescuentos;

  const guardar = async () => {
    if (rows.some(r => !r.conceptoId)) { toast.error('Hay líneas sin concepto asignado'); return; }
    if (rows.some(r => !r.descripcion.trim())) { toast.error('Hay líneas sin descripción'); return; }
    const detallesNorm = rows.map((r, i) => ({
      conceptoId: r.conceptoId,
      descripcion: r.descripcion.trim(),
      naturaleza: r.naturaleza,
      tipo: r.tipo,
      remunerativo: r.remunerativo,
      importe: Math.abs(num(r.importe)),
      cantidad: r.cantidad === '' ? null : num(r.cantidad),
      valorUnitario: r.valorUnitario === '' ? null : num(r.valorUnitario),
      orden: r.orden ?? i + 1,
    }));
    await onSave(detallesNorm);
  };

  return (
    <div className="card overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-amber-800 font-medium">{title}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={saving} className="btn-secondary text-sm">
            <XMarkIcon className="w-4 h-4" /> Cancelar
          </button>
          <button onClick={guardar} disabled={saving} className="btn-primary text-sm">
            <CheckCircleIcon className="w-4 h-4" /> {saving ? 'Guardando...' : saveLabel}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Concepto</th>
              <th className="px-3 py-2 text-left w-32">Naturaleza</th>
              <th className="px-3 py-2 text-right w-24">Cant.</th>
              <th className="px-3 py-2 text-right w-28">V. Unit.</th>
              <th className="px-3 py-2 text-right w-32">Importe</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.key} className="hover:bg-gray-50">
                <td className="px-3 py-1.5">
                  <input className="input py-1.5 text-sm" value={r.descripcion}
                    onChange={e => setRow(r.key, { descripcion: e.target.value })} />
                </td>
                <td className="px-3 py-1.5">
                  <select className={`input py-1.5 text-sm font-medium ${natCls[r.naturaleza]}`} value={r.naturaleza}
                    onChange={e => setRow(r.key, { naturaleza: e.target.value })}>
                    <option value="HABER">Haber</option>
                    <option value="DESCUENTO">Descuento</option>
                    <option value="INFORMATIVO">Informativo</option>
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" step="any" className="input py-1.5 text-sm text-right" value={r.cantidad}
                    onChange={e => setRow(r.key, { cantidad: e.target.value })} />
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" step="any" className="input py-1.5 text-sm text-right" value={r.valorUnitario}
                    onChange={e => setRow(r.key, { valorUnitario: e.target.value })} />
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" step="0.01" className="input py-1.5 text-sm text-right font-medium" value={r.importe}
                    onChange={e => setRow(r.key, { importe: e.target.value })} />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button onClick={() => removeRow(r.key)} title="Eliminar línea" className="text-gray-400 hover:text-red-600">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400 text-sm">Sin líneas. Agregá un concepto abajo.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Agregar línea */}
      <div className="flex items-center gap-2 px-3 py-3 bg-gray-50 border-t border-gray-100">
        <select className="input py-1.5 text-sm flex-1 max-w-md" value={nuevoConceptoId}
          onChange={e => setNuevoConceptoId(e.target.value)}>
          <option value="">Agregar concepto…</option>
          {conceptos.map(c => (
            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre} ({c.naturaleza})</option>
          ))}
        </select>
        <button onClick={agregarLinea} className="btn-secondary text-sm">
          <PlusIcon className="w-4 h-4" /> Agregar línea
        </button>
      </div>

      {/* Totales en vivo */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-200 bg-white">
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-400">Haberes</p>
          <p className="font-bold text-green-700">{formatMoney(totalHaberes)}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-400">Descuentos</p>
          <p className="font-bold text-red-600">- {formatMoney(totalDescuentos)}</p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-400">Neto a cobrar</p>
          <p className="font-bold text-gray-900 text-lg">{formatMoney(totalNeto)}</p>
        </div>
      </div>
    </div>
  );
}
