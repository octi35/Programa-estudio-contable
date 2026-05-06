import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Empresas from './pages/Empresas';
import EmpresaDetalle from './pages/EmpresaDetalle';
import Empleados from './pages/Empleados';
import EmpleadoDetalle from './pages/EmpleadoDetalle';
import Liquidaciones from './pages/Liquidaciones';
import LiquidacionDetalle from './pages/LiquidacionDetalle';
import Conceptos from './pages/Conceptos';

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

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="empresas" element={<Empresas />} />
          <Route path="empresas/:id" element={<EmpresaDetalle />} />
          <Route path="empleados" element={<Empleados />} />
          <Route path="empleados/:id" element={<EmpleadoDetalle />} />
          <Route path="liquidaciones" element={<Liquidaciones />} />
          <Route path="liquidaciones/:id" element={<LiquidacionDetalle />} />
          <Route path="conceptos" element={<Conceptos />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
