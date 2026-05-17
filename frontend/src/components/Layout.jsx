import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../api/client';
import {
  HomeIcon, BuildingOfficeIcon, UsersIcon, DocumentTextIcon,
  CalculatorIcon, CogIcon, Bars3Icon, XMarkIcon, ArrowRightOnRectangleIcon,
  ChevronDownIcon, ChevronRightIcon, BriefcaseIcon, ClipboardDocumentListIcon,
  BanknotesIcon, BookOpenIcon, ScaleIcon, AdjustmentsHorizontalIcon,
  WrenchScrewdriverIcon, ClipboardDocumentCheckIcon, KeyIcon,
  CalendarDaysIcon, CurrencyDollarIcon, BuildingLibraryIcon, ReceiptPercentIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import Modal from './Modal';
import GlobalSearch from './GlobalSearch';

function CambiarPasswordModal({ onClose }) {
  const [datos, setDatos] = useState({ actual: '', nuevo: '', confirmar: '' });
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (datos.nuevo !== datos.confirmar) { toast.error('Las contraseñas nuevas no coinciden'); return; }
    if (datos.nuevo.length < 8) { toast.error('Mínimo 8 caracteres'); return; }
    setGuardando(true);
    try {
      await api.post('/auth/change-password', { passwordActual: datos.actual, passwordNuevo: datos.nuevo });
      toast.success('Contraseña actualizada');
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al cambiar contraseña'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-4">
      {[['actual', 'Contraseña actual'], ['nuevo', 'Nueva contraseña'], ['confirmar', 'Confirmar nueva contraseña']].map(([key, label]) => (
        <div key={key}>
          <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
          <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={datos[key]} onChange={e => setDatos(p => ({ ...p, [key]: e.target.value }))} />
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Cambiar contraseña'}
        </button>
      </div>
    </div>
  );
}

const menuConfig = [
  { to: '/dashboard', icon: HomeIcon, label: 'Panel Principal' },
  {
    label: 'Sueldos', icon: CalculatorIcon, children: [
      { to: '/empresas', label: 'Empresas' },
      { to: '/empleados', label: 'Empleados' },
      { to: '/ausentismos', label: 'Ausentismos' },
      { to: '/liquidaciones', label: 'Liquidaciones' },
      { to: '/liquidacion-final', label: 'Liquidación Final' },
      { to: '/conceptos', label: 'Conceptos' },
      { to: '/convenios', label: 'Convenios (CCT)' },
    ],
  },
  {
    label: 'IVA', icon: BanknotesIcon, children: [
      { to: '/iva/comprobantes', label: 'Comprobantes' },
      { to: '/iva/libro', label: 'Libro IVA' },
      { to: '/iva/proveedores', label: 'Proveedores/Clientes' },
      { to: '/iva/posicion', label: 'Posición IVA' },
    ],
  },
  {
    label: 'Contabilidad', icon: BookOpenIcon, children: [
      { to: '/contabilidad/ejercicios', label: 'Ejercicios' },
      { to: '/contabilidad/asientos', label: 'Asientos' },
      { to: '/contabilidad/cuentas', label: 'Plan de Cuentas' },
      { to: '/contabilidad/mayor', label: 'Mayor' },
      { to: '/contabilidad/balance', label: 'Balance Sumas y Saldos' },
      { to: '/contabilidad/estado-resultados', label: 'Estado de Resultados' },
      { to: '/contabilidad/balance-general', label: 'Balance General' },
    ],
  },
  {
    label: 'Impuestos', icon: ReceiptPercentIcon, children: [
      { to: '/vencimientos', label: 'Agenda Vencimientos' },
      { to: '/iibb', label: 'Ingresos Brutos' },
      { to: '/ganancias', label: 'Ganancias 4ª Cat.' },
      { to: '/monotributo', label: 'Monotributo' },
    ],
  },
  {
    label: 'Finanzas', icon: BuildingLibraryIcon, children: [
      { to: '/bancos', label: 'Cuentas Bancarias' },
      { to: '/cuentas-corrientes', label: 'Cuentas Corrientes' },
      { to: '/presupuesto', label: 'Presupuesto' },
      { to: '/tipos-cambio', label: 'Tipos de Cambio' },
    ],
  },
  {
    label: 'Facturación', icon: DocumentTextIcon, children: [
      { to: '/facturacion-electronica', label: 'Facturación Electrónica' },
    ],
  },
  {
    label: 'Estudio', icon: BriefcaseIcon, children: [
      { to: '/honorarios', label: 'Honorarios' },
      { to: '/certificados', label: 'Certificados Laborales' },
    ],
  },
  {
    label: 'Herramientas', icon: WrenchScrewdriverIcon, children: [
      { to: '/importar-novedades', label: 'Importar Novedades' },
      { to: '/log-acciones', label: 'Log de Acciones' },
    ],
  },
  {
    label: 'Configuración', icon: CogIcon, children: [
      { to: '/parametros', label: 'Parámetros Fiscales' },
      { to: '/sucursales', label: 'Sucursales' },
      { to: '/perfil-estudio', label: 'Perfil del Estudio' },
      { to: '/usuarios', label: 'Usuarios' },
      { to: '/admin', label: 'Administración' },
    ],
  },
];

function NavItem({ item, depth = 0 }) {
  const location = useLocation();
  const hasChildren = item.children && item.children.length > 0;
  const isActiveParent = hasChildren && item.children.some(c => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(isActiveParent);
  const Icon = item.icon;

  if (!hasChildren) {
    return (
      <NavLink to={item.to}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
          ${depth > 0 ? 'px-3 py-2 ml-4' : 'px-3 py-2.5'}
          ${isActive
            ? 'bg-blue-600 text-white'
            : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`
        }>
        {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
        <span>{item.label}</span>
      </NavLink>
    );
  }

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
          ${isActiveParent ? 'bg-blue-800 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`}>
        {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {item.children.map(child => (
            <NavItem key={child.to} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCambiarPass, setShowCambiarPass] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Atajo global Ctrl+K (o Cmd+K en Mac) para abrir búsqueda
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#1e3a5f] transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:flex lg:flex-col`}>

        <div className="flex items-center justify-between h-16 px-5 border-b border-blue-900 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-400 rounded-lg flex items-center justify-center">
              <CalculatorIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">EstudioPRO</p>
              <p className="text-blue-300 text-xs">Sistema Contable</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-blue-300 hover:text-white">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {usuario?.estudio && (
          <div className="px-4 py-3 border-b border-blue-900 bg-blue-900/30 flex-shrink-0">
            <p className="text-blue-200 text-xs font-medium truncate">{usuario.estudio.razonSocial}</p>
            <p className="text-blue-400 text-xs">CUIT: {usuario.estudio.cuit}</p>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {menuConfig.map((item, i) => (
            <NavItem key={item.to || item.label} item={item} />
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-blue-900 flex-shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {usuario?.nombre?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{usuario?.nombre}</p>
              <p className="text-blue-400 text-xs capitalize">{usuario?.rol?.toLowerCase()}</p>
            </div>
            <button onClick={() => setShowCambiarPass(true)} title="Cambiar contraseña" className="text-blue-400 hover:text-white transition-colors">
              <KeyIcon className="w-4 h-4" />
            </button>
            <button onClick={handleLogout} title="Cerrar sesión" className="text-blue-400 hover:text-white transition-colors">
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {showCambiarPass && (
        <Modal onClose={() => setShowCambiarPass(false)} title="Cambiar mi contraseña">
          <CambiarPasswordModal onClose={() => setShowCambiarPass(false)} />
        </Modal>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
            <Bars3Icon className="w-5 h-5" />
          </button>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 w-full max-w-md text-left text-sm text-gray-400 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            title="Búsqueda global (Ctrl+K)">
            <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
            <span className="flex-1 truncate">Buscar empleados, empresas, comprobantes...</span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-white border border-gray-200 rounded">Ctrl+K</kbd>
          </button>

          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="hidden sm:inline">Bienvenido,</span>
            <span className="font-medium text-gray-900">{usuario?.nombre}</span>
          </div>
        </header>

        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
