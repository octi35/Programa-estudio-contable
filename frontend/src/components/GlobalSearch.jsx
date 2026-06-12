import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon, XMarkIcon, UserIcon, BuildingOfficeIcon, DocumentTextIcon,
  CalculatorIcon, UsersIcon, ReceiptPercentIcon, BookOpenIcon, ListBulletIcon,
  TagIcon, DocumentDuplicateIcon, BuildingLibraryIcon, BanknotesIcon, FolderIcon,
  MapPinIcon, ChartBarIcon, UserGroupIcon, ArrowRightCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../api/client';

// Iconos por categoría de resultado del backend
const GROUP_ICONS = {
  empleados: UserIcon,
  empresas: BuildingOfficeIcon,
  liquidaciones: CalculatorIcon,
  comprobantes: DocumentTextIcon,
  proveedores: UsersIcon,
  facturasHonorarios: ReceiptPercentIcon,
  asientos: BookOpenIcon,
  cuentasContables: ListBulletIcon,
  conceptos: TagIcon,
  convenios: DocumentDuplicateIcon,
  cuentasBancarias: BuildingLibraryIcon,
  movimientosBancarios: BanknotesIcon,
  documentos: FolderIcon,
  sucursales: MapPinIcon,
  presupuestos: ChartBarIcon,
  usuarios: UserGroupIcon,
};

// Todas las páginas del sistema, navegables desde el buscador
const PAGINAS = [
  { ruta: '/dashboard', titulo: 'Panel Principal', seccion: 'Inicio' },
  { ruta: '/asistente', titulo: 'Asistente IA', seccion: 'Inicio' },
  { ruta: '/empresas', titulo: 'Empresas', seccion: 'Sueldos' },
  { ruta: '/empleados', titulo: 'Empleados', seccion: 'Sueldos' },
  { ruta: '/ausentismos', titulo: 'Ausentismos', seccion: 'Sueldos' },
  { ruta: '/liquidaciones', titulo: 'Liquidaciones', seccion: 'Sueldos' },
  { ruta: '/control-liquidaciones', titulo: 'Control Pre-cierre', seccion: 'Sueldos' },
  { ruta: '/liquidacion-final', titulo: 'Liquidación Final', seccion: 'Sueldos' },
  { ruta: '/contribuciones', titulo: 'Contribuciones', seccion: 'Sueldos' },
  { ruta: '/simulador-costo', titulo: 'Simulador de Costo', seccion: 'Sueldos' },
  { ruta: '/conceptos', titulo: 'Conceptos', seccion: 'Sueldos' },
  { ruta: '/convenios', titulo: 'Convenios (CCT)', seccion: 'Sueldos' },
  { ruta: '/escalas', titulo: 'Escalas (Paritarias)', seccion: 'Sueldos' },
  { ruta: '/iva/comprobantes', titulo: 'Comprobantes', seccion: 'IVA' },
  { ruta: '/iva/libro', titulo: 'Libro IVA', seccion: 'IVA' },
  { ruta: '/iva/proveedores', titulo: 'Proveedores/Clientes', seccion: 'IVA' },
  { ruta: '/iva/posicion', titulo: 'Posición IVA', seccion: 'IVA' },
  { ruta: '/contabilidad/ejercicios', titulo: 'Ejercicios', seccion: 'Contabilidad' },
  { ruta: '/contabilidad/asientos', titulo: 'Asientos', seccion: 'Contabilidad' },
  { ruta: '/contabilidad/cuentas', titulo: 'Plan de Cuentas', seccion: 'Contabilidad' },
  { ruta: '/contabilidad/mayor', titulo: 'Mayor', seccion: 'Contabilidad' },
  { ruta: '/contabilidad/balance', titulo: 'Balance Sumas y Saldos', seccion: 'Contabilidad' },
  { ruta: '/contabilidad/estado-resultados', titulo: 'Estado de Resultados', seccion: 'Contabilidad' },
  { ruta: '/contabilidad/balance-general', titulo: 'Balance General', seccion: 'Contabilidad' },
  { ruta: '/vencimientos', titulo: 'Agenda Vencimientos', seccion: 'Impuestos' },
  { ruta: '/iibb', titulo: 'Ingresos Brutos', seccion: 'Impuestos' },
  { ruta: '/ganancias', titulo: 'Ganancias 4ª Cat.', seccion: 'Impuestos' },
  { ruta: '/monotributo', titulo: 'Monotributo', seccion: 'Impuestos' },
  { ruta: '/bancos', titulo: 'Cuentas Bancarias', seccion: 'Finanzas' },
  { ruta: '/conciliacion', titulo: 'Conciliación Bancaria', seccion: 'Finanzas' },
  { ruta: '/cuentas-corrientes', titulo: 'Cuentas Corrientes', seccion: 'Finanzas' },
  { ruta: '/presupuesto', titulo: 'Presupuesto', seccion: 'Finanzas' },
  { ruta: '/tipos-cambio', titulo: 'Tipos de Cambio', seccion: 'Finanzas' },
  { ruta: '/facturacion-electronica', titulo: 'Facturación Electrónica', seccion: 'Facturación' },
  { ruta: '/honorarios', titulo: 'Honorarios', seccion: 'Estudio' },
  { ruta: '/certificados', titulo: 'Certificados Laborales', seccion: 'Estudio' },
  { ruta: '/importar-novedades', titulo: 'Importar Novedades', seccion: 'Herramientas' },
  { ruta: '/log-acciones', titulo: 'Log de Acciones', seccion: 'Herramientas' },
  { ruta: '/parametros', titulo: 'Parámetros Fiscales', seccion: 'Configuración' },
  { ruta: '/sucursales', titulo: 'Sucursales', seccion: 'Configuración' },
  { ruta: '/perfil-estudio', titulo: 'Perfil del Estudio', seccion: 'Configuración' },
  { ruta: '/usuarios', titulo: 'Usuarios', seccion: 'Configuración' },
  { ruta: '/admin', titulo: 'Administración', seccion: 'Configuración' },
];

// Normaliza para comparar sin acentos ni mayúsculas ("liquidacion" matchea "Liquidación")
const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function buscarPaginas(q) {
  const nq = normalizar(q);
  return PAGINAS
    .filter(p => normalizar(p.titulo).includes(nq) || normalizar(p.seccion).includes(nq))
    .slice(0, 5)
    .map(p => ({ id: p.ruta, titulo: p.titulo, subtitulo: `Ir a ${p.seccion} → ${p.titulo}`, ruta: p.ruta }));
}

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

  // Grupos a renderizar: páginas (cliente) + entidades (backend)
  const paginas = query.trim().length >= 2 ? buscarPaginas(query.trim()) : [];
  const grupos = [
    ...(paginas.length ? [{ key: 'paginas', label: 'Páginas', items: paginas }] : []),
    ...(results?.grupos || []),
  ];

  // Aplanar resultados para navegación con teclado
  const allItems = grupos.flatMap(g => g.items);

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
  const renderGroup = (grupo) => {
    if (!grupo.items?.length) return null;
    const Icon = grupo.key === 'paginas' ? ArrowRightCircleIcon : (GROUP_ICONS[grupo.key] || DocumentTextIcon);
    return (
      <React.Fragment key={grupo.key}>
        {groupTitle(grupo.label, grupo.items.length)}
        {grupo.items.map(it => {
          runningIdx++;
          const idx = runningIdx;
          const isActive = idx === activeIdx;
          return (
            <button
              key={`${grupo.key}-${it.id}`}
              onClick={() => goToItem(it)}
              onMouseEnter={() => setActiveIdx(idx)}
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
      </React.Fragment>
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
              placeholder="Buscar en todo el sistema: empleados, liquidaciones, asientos, páginas..."
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

            {query.trim().length >= 2 && allItems.length === 0 && !loading && (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">
                Sin resultados para "<strong>{query}</strong>"
              </div>
            )}

            {grupos.map(renderGroup)}
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
