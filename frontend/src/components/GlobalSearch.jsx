import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, XMarkIcon, UserIcon, BuildingOfficeIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import api from '../api/client';

export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Foco automático al abrir
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounce de 300ms
  useEffect(() => {
    if (!open) return;
    if (!query || query.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get('/search', { params: { q: query.trim() } });
        setResults(r.data);
        setActiveIdx(0);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  // Aplanar resultados para navegación con teclado
  const allItems = results
    ? [
        ...results.empleados.map(i => ({ ...i, _grupo: 'Empleado', _icon: UserIcon })),
        ...results.empresas.map(i => ({ ...i, _grupo: 'Empresa', _icon: BuildingOfficeIcon })),
        ...results.comprobantes.map(i => ({ ...i, _grupo: 'Comprobante IVA', _icon: DocumentTextIcon })),
      ]
    : [];

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (!allItems.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(allItems.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = allItems[activeIdx];
      if (item) goToItem(item);
    }
  };

  const goToItem = (item) => {
    navigate(item.ruta);
    onClose();
  };

  if (!open) return null;

  const groupTitle = (label, count) => (
    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">
      {label} ({count})
    </div>
  );

  let runningIdx = -1;
  const renderGroup = (items, label, Icon) => {
    if (!items?.length) return null;
    return (
      <>
        {groupTitle(label, items.length)}
        {items.map(it => {
          runningIdx++;
          const isActive = runningIdx === activeIdx;
          return (
            <button
              key={`${label}-${it.id}`}
              onClick={() => goToItem(it)}
              onMouseEnter={() => setActiveIdx(runningIdx)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 transition-colors ${
                isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}>
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-900' : 'text-gray-900'}`}>{it.titulo}</p>
                <p className="text-xs text-gray-500 truncate">{it.subtitulo}</p>
              </div>
              {it.activo === false && <span className="text-xs text-red-500 ml-2">inactivo</span>}
            </button>
          );
        })}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[60]" onKeyDown={handleKeyDown}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 top-16 mx-auto max-w-2xl px-4">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar empleados, empresas, comprobantes..."
              className="flex-1 outline-none text-sm bg-transparent"
            />
            {loading && <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {!query && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">
                Escribí al menos 2 caracteres para buscar
                <p className="text-xs mt-2 text-gray-300">Esc para cerrar · ↑↓ para navegar · Enter para abrir</p>
              </div>
            )}

            {query.trim().length >= 2 && results && allItems.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">
                Sin resultados para "<strong>{query}</strong>"
              </div>
            )}

            {results && (
              <>
                {renderGroup(results.empleados, 'Empleados', UserIcon)}
                {renderGroup(results.empresas, 'Empresas', BuildingOfficeIcon)}
                {renderGroup(results.comprobantes, 'Comprobantes IVA', DocumentTextIcon)}
              </>
            )}
          </div>

          <div className="border-t border-gray-100 px-3 py-1.5 flex items-center justify-between bg-gray-50 text-xs text-gray-400">
            <span>Búsqueda global</span>
            <span><kbd className="bg-white border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd> para cerrar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
