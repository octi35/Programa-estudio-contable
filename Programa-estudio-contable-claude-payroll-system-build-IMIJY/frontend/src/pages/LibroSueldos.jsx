import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { formatCurrency, MESES, aniosRecientes, anioActual, mesActual } from '../utils/format';
import { downloadWithProgress } from '../utils/download';
import toast from 'react-hot-toast';
import { ArrowDownTrayIcon, BookOpenIcon } from '@heroicons/react/24/outline';

export default function LibroSueldos() {
  const [empresas, setEmpresas] = useState([]);
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState({
    empresaId: '', anio: anioActual(), mes: mesActual(),
  });

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } })
      .then(({ data }) => {
        setEmpresas(data.data || []);
        if (data.data?.length > 0) setFiltros(f => ({ ...f, empresaId: data.data[0].id }));
      });
  }, []);

  const consultar = async () => {
    if (!filtros.empresaId) { toast.error('Seleccioná una empresa'); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/reportes/libro-sueldos-data', { params: filtros });
      setDatos(data);
    } catch { setDatos(null); }
    finally { setLoading(false); }
  };

  const sufijo = `${filtros.anio}${String(filtros.mes).padStart(2, '0')}`;

  const descargarExcel = () => downloadWithProgress(
    `/api/reportes/libro-sueldos?empresaId=${filtros.empresaId}&anio=${filtros.anio}&mes=${filtros.mes}`,
    { filename: `libro_sueldos_${sufijo}.xlsx`, loadingLabel: 'Generando Libro de Sueldos...' });

  const descargarTxt = () => downloadWithProgress(
    `/api/reportes/libro-sueldos?empresaId=${filtros.empresaId}&anio=${filtros.anio}&mes=${filtros.mes}&formato=txt`,
    { filename: `LSD_${sufijo}.txt`, loadingLabel: 'Generando LSD (AFIP)...' });

  const t = datos?.totales;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BookOpenIcon className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Libro de Sueldos</h1>
            <p className="text-gray-500 text-sm">Libro de Sueldos y Jornales (Ley 20.744) y LSD para AFIP</p>
          </div>
        </div>
        {datos && datos.filas.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={descargarExcel} className="btn-secondary text-sm">
              <ArrowDownTrayIcon className="w-4 h-4" /> Hojas Móviles (Excel)
            </button>
            <button onClick={descargarTxt} className="btn-secondary text-sm">
              <ArrowDownTrayIcon className="w-4 h-4" /> LSD AFIP (.txt)
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
          <select value={filtros.empresaId} onChange={e => setFiltros(f => ({ ...f, empresaId: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm min-w-[220px]">
            <option value="">Seleccionar...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
          <select value={filtros.mes} onChange={e => setFiltros(f => ({ ...f, mes: parseInt(e.target.value) }))}
            className="border rounded-lg px-3 py-2 text-sm">
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Año</label>
          <select value={filtros.anio} onChange={e => setFiltros(f => ({ ...f, anio: parseInt(e.target.value) }))}
            className="border rounded-lg px-3 py-2 text-sm">
            {aniosRecientes().map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={consultar} disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {/* Resumen de totales */}
      {t && datos.filas.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Total Haberes', t.totalHaberes, 'text-gray-900'],
            ['Total Descuentos', t.totalDescuentos, 'text-red-600'],
            ['Neto a Pagar', t.totalNeto, 'text-blue-700'],
            ['Contribuciones', t.totalContribuciones, 'text-gray-600'],
          ].map(([label, valor, cls]) => (
            <div key={label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-xl font-bold ${cls}`}>{formatCurrency(valor)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      {datos && (
        datos.filas.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center text-gray-500">
            No hay liquidaciones calculadas o confirmadas para {datos.periodo.nombre}.
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-medium text-gray-700">
                {datos.empresa.razonSocial} — {datos.periodo.nombre} — {datos.filas.length} empleados
              </h3>
              <p className="text-xs text-gray-500">CUIT: {datos.empresa.cuit} · Convenio: {datos.empresa.convenio}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Legajo</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Apellido y Nombre</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">CUIL</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Categoría</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Días</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Haberes</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Descuentos</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Neto</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">Contrib.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {datos.filas.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{f.legajo}</td>
                      <td className="px-3 py-2 font-medium">{f.nombre}</td>
                      <td className="px-3 py-2 font-mono">{f.cuil}</td>
                      <td className="px-3 py-2">{f.categoria}</td>
                      <td className="px-3 py-2 text-right">{f.diasTrabajados}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(f.totalHaberes)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatCurrency(f.totalDescuentos)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(f.totalNeto)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{formatCurrency(f.totalContribuciones)}</td>
                    </tr>
                  ))}
                </tbody>
                {t && (
                  <tfoot className="border-t-2 bg-gray-50 font-semibold">
                    <tr>
                      <td colSpan="5" className="px-3 py-2 text-right">TOTALES</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(t.totalHaberes)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatCurrency(t.totalDescuentos)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(t.totalNeto)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{formatCurrency(t.totalContribuciones)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
