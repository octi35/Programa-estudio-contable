import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BuildingOfficeIcon, UsersIcon, CalculatorIcon, CurrencyDollarIcon,
  CheckCircleIcon, ClockIcon, ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import { formatMoney, mesNombre } from '../utils/format';

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    purple: 'bg-purple-600',
    orange: 'bg-orange-500',
  };
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`${colors[color]} p-3 rounded-xl flex-shrink-0`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

function EstadoPeriodo({ periodo }) {
  if (!periodo || periodo.length === 0) return <span className="badge-gray">Sin liquidar</span>;
  const { estado } = periodo[0];
  if (estado === 'CERRADO') return <span className="badge-green">Cerrado</span>;
  if (estado === 'PROCESADO') return <span className="badge-blue">Procesado</span>;
  return <span className="badge-yellow">Abierto</span>;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/reportes/panel-estudio')
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return <p className="text-gray-500">Error cargando datos</p>;

  const { resumen, empresas, periodo } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel Principal</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Período actual: {mesNombre(periodo.mes)} {periodo.anio}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={BuildingOfficeIcon} label="Empresas activas" value={resumen.cantEmpresas} color="blue" />
        <StatCard icon={UsersIcon} label="Empleados activos" value={resumen.cantEmpleados} color="green" />
        <StatCard icon={CalculatorIcon} label="Liquidaciones del mes" value={resumen.liquidacionesMes} color="purple" />
        <StatCard icon={CurrencyDollarIcon} label="Total haberes mes" value={formatMoney(resumen.totalMensual)} color="orange" />
      </div>

      {/* Empresas */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Estado de empresas - {mesNombre(periodo.mes)} {periodo.anio}</h2>
          <button onClick={() => navigate('/empresas')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Ver todas →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-6 py-3 text-left">Empresa</th>
                <th className="px-6 py-3 text-center">CUIT</th>
                <th className="px-6 py-3 text-center">Empleados</th>
                <th className="px-6 py-3 text-center">Estado período</th>
                <th className="px-6 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empresas.map(emp => (
                <tr key={emp.id} className="table-row-hover" onClick={() => navigate(`/empresas/${emp.id}`)}>
                  <td className="px-6 py-3.5 font-medium text-gray-900">{emp.razonSocial}</td>
                  <td className="px-6 py-3.5 text-center text-gray-500">{emp.cuit}</td>
                  <td className="px-6 py-3.5 text-center">
                    <span className="badge-blue">{emp._count.empleados}</span>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <EstadoPeriodo periodo={emp.periodos} />
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/liquidaciones?empresaId=${emp.id}`); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Liquidar
                    </button>
                  </td>
                </tr>
              ))}
              {empresas.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No hay empresas registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
