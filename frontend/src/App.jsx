import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// Pages existentes
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Empresas from './pages/Empresas';
import EmpresaDetalle from './pages/EmpresaDetalle';
import Empleados from './pages/Empleados';
import EmpleadoDetalle from './pages/EmpleadoDetalle';
import Liquidaciones from './pages/Liquidaciones';
import LiquidacionDetalle from './pages/LiquidacionDetalle';
import Conceptos from './pages/Conceptos';

// Pages nuevas - Sueldos
import Ausentismos from './pages/Ausentismos';
import Convenios from './pages/Convenios';
import Sucursales from './pages/Sucursales';
import Parametros from './pages/Parametros';

// Pages IVA
import Comprobantes from './pages/iva/Comprobantes';
import LibroIVA from './pages/iva/LibroIVA';
import ProveedoresClientes from './pages/iva/ProveedoresClientes';
import PosicionIVA from './pages/iva/PosicionIVA';

// Pages Contabilidad
import Ejercicios from './pages/contabilidad/Ejercicios';
import Asientos from './pages/contabilidad/Asientos';
import PlanCuentas from './pages/contabilidad/PlanCuentas';
import Mayor from './pages/contabilidad/Mayor';
import BalanceSumas from './pages/contabilidad/BalanceSumas';
import EstadoResultados from './pages/EstadoResultados';
import BalanceGeneral from './pages/BalanceGeneral';
import ImportarNovedades from './pages/ImportarNovedades';
import LiquidacionFinal from './pages/LiquidacionFinal';
import LogAcciones from './pages/LogAcciones';
import Contribuciones from './pages/Contribuciones';
import Usuarios from './pages/Usuarios';
import PerfilEstudio from './pages/PerfilEstudio';
import Admin from './pages/Admin';

// Pages nuevas - Impuestos y finanzas
import FacturacionElectronica from './pages/FacturacionElectronica';
import Ganancias from './pages/Ganancias';
import IIBB from './pages/IIBB';
import Vencimientos from './pages/Vencimientos';
import Certificados from './pages/Certificados';
import Bancos from './pages/Bancos';
import Honorarios from './pages/Honorarios';
import Monotributo from './pages/Monotributo';
import MonotributoCategorias from './pages/MonotributoCategorias';
import Presupuesto from './pages/Presupuesto';
import CuentasCorrientes from './pages/CuentasCorrientes';
import TiposCambio from './pages/TiposCambio';

// Pages nuevas - Automatización y portal
import ControlLiquidaciones from './pages/ControlLiquidaciones';
import SimuladorCosto from './pages/SimuladorCosto';
import PortalEmpleado from './pages/PortalEmpleado';
import PortalCliente from './pages/PortalCliente';
import EscalasSalariales from './pages/EscalasSalariales';
import ConciliacionBancaria from './pages/ConciliacionBancaria';

function PrivateRoute({ children }) {
  const { usuario, loading } = useAuth();
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Cargando...</p>
      </div>
    </div>
  );
  return usuario ? children : <Navigate to="/login" replace />;
}

// Wrapper que aísla cada página detrás de un ErrorBoundary
const Safe = (El) => <ErrorBoundary>{El}</ErrorBoundary>;

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={Safe(<Login />)} />
          <Route path="/forgot-password" element={Safe(<ForgotPassword />)} />
          <Route path="/reset-password" element={Safe(<ResetPassword />)} />
          {/* Portales públicos: autenticados por token firmado en la URL */}
          <Route path="/portal" element={Safe(<PortalEmpleado />)} />
          <Route path="/portal-cliente" element={Safe(<PortalCliente />)} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={Safe(<Dashboard />)} />

            {/* Empresas y empleados */}
            <Route path="empresas" element={Safe(<Empresas />)} />
            <Route path="empresas/:id" element={Safe(<EmpresaDetalle />)} />
            <Route path="empleados" element={Safe(<Empleados />)} />
            <Route path="empleados/:id" element={Safe(<EmpleadoDetalle />)} />

            {/* Sueldos */}
            <Route path="liquidaciones" element={Safe(<Liquidaciones />)} />
            <Route path="liquidaciones/:id" element={Safe(<LiquidacionDetalle />)} />
            <Route path="conceptos" element={Safe(<Conceptos />)} />
            <Route path="ausentismos" element={Safe(<Ausentismos />)} />
            <Route path="convenios" element={Safe(<Convenios />)} />

            {/* Configuración */}
            <Route path="sucursales" element={Safe(<Sucursales />)} />
            <Route path="parametros" element={Safe(<Parametros />)} />

            {/* IVA */}
            <Route path="iva/comprobantes" element={Safe(<Comprobantes />)} />
            <Route path="iva/libro" element={Safe(<LibroIVA />)} />
            <Route path="iva/proveedores" element={Safe(<ProveedoresClientes />)} />
            <Route path="iva/posicion" element={Safe(<PosicionIVA />)} />

            {/* Contabilidad */}
            <Route path="contabilidad/ejercicios" element={Safe(<Ejercicios />)} />
            <Route path="contabilidad/asientos" element={Safe(<Asientos />)} />
            <Route path="contabilidad/cuentas" element={Safe(<PlanCuentas />)} />
            <Route path="contabilidad/mayor" element={Safe(<Mayor />)} />
            <Route path="contabilidad/balance" element={Safe(<BalanceSumas />)} />
            <Route path="contabilidad/estado-resultados" element={Safe(<EstadoResultados />)} />
            <Route path="contabilidad/balance-general" element={Safe(<BalanceGeneral />)} />

            {/* Herramientas */}
            <Route path="importar-novedades" element={Safe(<ImportarNovedades />)} />
            <Route path="liquidacion-final" element={Safe(<LiquidacionFinal />)} />
            <Route path="contribuciones" element={Safe(<Contribuciones />)} />
            <Route path="control-liquidaciones" element={Safe(<ControlLiquidaciones />)} />
            <Route path="simulador-costo" element={Safe(<SimuladorCosto />)} />
            <Route path="escalas" element={Safe(<EscalasSalariales />)} />
            <Route path="conciliacion" element={Safe(<ConciliacionBancaria />)} />
            <Route path="log-acciones" element={Safe(<LogAcciones />)} />

            {/* Impuestos */}
            <Route path="ganancias" element={Safe(<Ganancias />)} />
            <Route path="iibb" element={Safe(<IIBB />)} />
            <Route path="vencimientos" element={Safe(<Vencimientos />)} />
            <Route path="monotributo" element={Safe(<Monotributo />)} />
            <Route path="monotributo/categorias" element={Safe(<MonotributoCategorias />)} />

            {/* Finanzas */}
            <Route path="bancos" element={Safe(<Bancos />)} />
            <Route path="cuentas-corrientes" element={Safe(<CuentasCorrientes />)} />
            <Route path="tipos-cambio" element={Safe(<TiposCambio />)} />
            <Route path="presupuesto" element={Safe(<Presupuesto />)} />

            {/* Facturación Electrónica */}
            <Route path="facturacion-electronica" element={Safe(<FacturacionElectronica />)} />

            {/* Estudio */}
            <Route path="honorarios" element={Safe(<Honorarios />)} />
            <Route path="certificados" element={Safe(<Certificados />)} />

            {/* Configuración avanzada */}
            <Route path="usuarios" element={Safe(<Usuarios />)} />
            <Route path="perfil-estudio" element={Safe(<PerfilEstudio />)} />
            <Route path="admin" element={Safe(<Admin />)} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </AuthProvider>
  );
}
