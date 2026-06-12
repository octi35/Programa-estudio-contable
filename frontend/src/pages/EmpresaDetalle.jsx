import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BuildingOfficeIcon, UsersIcon, ArrowLeftIcon, CalculatorIcon, LinkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../api/client';
import { formatDate, mesNombre } from '../utils/format';

export default function EmpresaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [empresa, setEmpresa] = useState(null);
  const [empleados, setEmpleados] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/empresas/${id}`),
      api.get('/empleados', { params: { empresaId: id, activo: true } }),
      api.get(`/empresas/${id}/periodos`),
    ]).then(([e, emp, p]) => {
      setEmpresa(e.data);
      setEmpleados(emp.data.data);
      setPeriodos(p.data);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!empresa) return <p className="text-gray-500">Empresa no encontrada</p>;

  const descargar = async (tipo, anio, mes) => {
    const endpoint = tipo === 'lsd'
      ? `/documentos/lsd/${id}/${anio}/${mes}`
      : `/documentos/f931/${id}/${anio}/${mes}`;
    const resp = await api.get(endpoint, { responseType: 'blob' });
    const url = URL.createObjectURL(resp.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tipo.toUpperCase()}_${empresa.cuit.replace(/-/g, '')}_${anio}${String(mes).padStart(2, '0')}.${tipo === 'lsd' ? 'xlsx' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/empresas')} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{empresa.razonSocial}</h1>
          <p className="text-gray-500 text-sm">CUIT: {empresa.cuit}</p>
        </div>
        <button
          onClick={async () => {
            try {
              const r = await api.post(`/empresas/${id}/portal-link`);
              await navigator.clipboard.writeText(r.data.url);
              toast.success(`Link del portal copiado (válido ${r.data.expiraEn}). Envíaselo al cliente para que cargue las novedades del mes.`, { duration: 6000 });
            } catch (_) { /* interceptor */ }
          }}
          className="btn-secondary"
          title="Genera un link de 30 días para que el cliente cargue novedades (horas extra, ausencias, premios) sin pasar por el estudio">
          <LinkIcon className="w-4 h-4" /> Portal del cliente
        </button>
        <button onClick={() => navigate(`/empleados?empresaId=${id}`)} className="btn-secondary">
          <UsersIcon className="w-4 h-4" /> Empleados
        </button>
        <button onClick={() => navigate(`/liquidaciones?empresaId=${id}`)} className="btn-primary">
          <CalculatorIcon className="w-4 h-4" /> Liquidar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Info empresa */}
        <div className="card p-5 md:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Datos de la empresa</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Razón Social', empresa.razonSocial],
              ['CUIT', empresa.cuit],
              ['Domicilio', empresa.domicilio || '—'],
              ['Localidad', empresa.localidad || '—'],
              ['Provincia', empresa.provincia || '—'],
              ['Teléfono', empresa.telefono || '—'],
              ['Email', empresa.email || '—'],
              ['Convenio', empresa.convenio?.nombre || 'LCT 20.744'],
              ['Actividad', empresa.actividadPrincipal || '—'],
              ['Inicio actividades', formatDate(empresa.fechaInicio)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-500 text-xs">{k}</dt>
                <dd className="font-medium text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Stats */}
        <div className="space-y-4">
          <div className="card p-5 text-center">
            <p className="text-3xl font-bold text-blue-700">{empleados.length}</p>
            <p className="text-sm text-gray-600 mt-1">Empleados activos</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-3xl font-bold text-green-700">{periodos.length}</p>
            <p className="text-sm text-gray-600 mt-1">Períodos registrados</p>
          </div>
        </div>
      </div>

      {/* Empleados */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Nómina activa ({empleados.length})</h2>
          <button onClick={() => navigate(`/empleados?empresaId=${id}`)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Ver todos →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Legajo</th>
                <th className="px-5 py-3 text-left">Apellido y Nombre</th>
                <th className="px-5 py-3 text-left">CUIL</th>
                <th className="px-5 py-3 text-left">Categoría</th>
                <th className="px-5 py-3 text-left">Ingreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empleados.slice(0, 10).map(emp => (
                <tr key={emp.id} className="table-row-hover" onClick={() => navigate(`/empleados/${emp.id}`)}>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{emp.legajoNumero || '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{emp.apellido}, {emp.nombre}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{emp.cuil}</td>
                  <td className="px-5 py-3 text-gray-600">{emp.categoria || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{formatDate(emp.fechaIngreso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Períodos */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Historial de períodos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Período</th>
                <th className="px-5 py-3 text-left">Tipo</th>
                <th className="px-5 py-3 text-center">Liquidaciones</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-center">Exportar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {periodos.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium">{mesNombre(p.mes)} {p.anio}</td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{p.tipo}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="badge-blue">{p._count.liquidaciones}</span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={p.estado === 'CERRADO' ? 'badge-green' : p.estado === 'PROCESADO' ? 'badge-blue' : 'badge-yellow'}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center flex gap-2 justify-center">
                    <button onClick={() => descargar('lsd', p.anio, p.mes)}
                      className="text-xs btn-secondary py-1 px-2">LSD Excel</button>
                    <button onClick={() => descargar('f931', p.anio, p.mes)}
                      className="text-xs btn-secondary py-1 px-2">F.931</button>
                  </td>
                </tr>
              ))}
              {periodos.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Sin períodos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
