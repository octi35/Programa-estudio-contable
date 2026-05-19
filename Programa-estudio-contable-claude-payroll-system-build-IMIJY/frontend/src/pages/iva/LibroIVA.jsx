import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { formatCurrency, formatDate } from '../../utils/format';
import toast from 'react-hot-toast';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function LibroIVA() {
  const [datos, setDatos] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    empresaId: '', tipoMovimiento: 'COMPRA',
    anio: new Date().getFullYear(), mes: new Date().getMonth() + 1,
  });

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } })
      .then(({ data }) => {
        setEmpresas(data.data || []);
        if (data.data?.length > 0) setFilters(f => ({ ...f, empresaId: data.data[0].id }));
      });
  }, []);

  const fetchLibro = async () => {
    if (!filters.empresaId) return;
    setLoading(true);
    try {
      const { data } = await api.get('/iva/libro', { params: filters });
      setDatos(data);
    } catch { toast.error('Error al cargar el libro IVA'); }
    finally { setLoading(false); }
  };

  const exportarAFIP = async () => {
    if (!filters.empresaId) return;
    try {
      const resp = await api.get('/iva/exportar-afip-zip', { params: filters, responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      const tipo = filters.tipoMovimiento === 'COMPRA' ? 'compras' : 'ventas';
      a.href = url;
      a.download = `iva_${tipo}_${filters.anio}${String(filters.mes).padStart(2,'0')}.zip`;
      a.click();
    } catch { toast.error('Error al exportar'); }
  };

  const posicion = datos?.posicionIVA;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Libro IVA</h1>
        <button onClick={exportarAFIP} className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm bg-white hover:bg-gray-50 shadow-sm transition-all focus:ring-2 focus:ring-indigo-500">
          <ArrowDownTrayIcon className="w-5 h-5 text-indigo-600" /> <span className="font-medium text-gray-700">Exportar AFIP (.zip)</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
          <select value={filters.empresaId} onChange={e => setFilters(f => ({ ...f, empresaId: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
            <option value="">Seleccionar...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
          <select value={filters.tipoMovimiento} onChange={e => setFilters(f => ({ ...f, tipoMovimiento: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="COMPRA">Compras</option>
            <option value="VENTA">Ventas</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
          <select value={filters.mes} onChange={e => setFilters(f => ({ ...f, mes: parseInt(e.target.value) }))}
            className="border rounded-lg px-3 py-2 text-sm">
            {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Año</label>
          <input type="number" value={filters.anio} onChange={e => setFilters(f => ({ ...f, anio: parseInt(e.target.value) }))}
            className="border rounded-lg px-3 py-2 text-sm w-24" />
        </div>
        <button onClick={fetchLibro} disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Cargando...' : 'Consultar'}
        </button>
      </div>

      {/* Posición IVA */}
      {posicion && (
        <div className={`rounded-xl border p-4 ${posicion.resultado === 'A_FAVOR' ? 'bg-green-50 border-green-200' : posicion.resultado === 'A_PAGAR' ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}>
          <h2 className="font-semibold text-gray-700 mb-3">Posición IVA — {MESES[filters.mes - 1]} {filters.anio}</h2>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-gray-500">Débito Fiscal</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(posicion.debitoFiscal)}</p>
            </div>
            <div>
              <p className="text-gray-500">Crédito Fiscal</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(posicion.creditoFiscal)}</p>
            </div>
            <div className="border-l pl-6">
              <p className="text-gray-500">Saldo</p>
              <p className={`text-xl font-bold ${posicion.resultado === 'A_FAVOR' ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(Math.abs(posicion.saldo))}
                <span className="ml-2 text-sm font-normal">
                  {posicion.resultado === 'A_FAVOR' ? '✓ A Favor' : posicion.resultado === 'A_PAGAR' ? '↑ A Pagar' : '= Neutro'}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de comprobantes */}
      {datos && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-medium text-gray-700">
              Libro IVA {filters.tipoMovimiento === 'COMPRA' ? 'Compras' : 'Ventas'} — {datos.comprobantes.length} registros
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Número</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Razón Social</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">CUIT</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Neto 21%</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Neto 10.5%</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">IVA 21%</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">IVA 10.5%</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">No Grav.</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Perc. IVA</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Perc. IIBB</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {datos.comprobantes.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 ${c.anulado ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-2">{formatDate(c.fecha)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.tipoComprobante.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 font-mono">{String(c.puntoVenta).padStart(4,'0')}-{String(c.numero).padStart(8,'0')}</td>
                    <td className="px-3 py-2">{c.proveedorCliente?.razonSocial || 'Consumidor Final'}</td>
                    <td className="px-3 py-2 font-mono">{c.proveedorCliente?.cuit || ''}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.netoGravado21)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.netoGravado105)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.iva21)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.iva105)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.netoNoGravado)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.percepcionIVA)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.percepcionIIBB)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(c.total)}</td>
                  </tr>
                ))}
              </tbody>
              {datos.totales && (
                <tfoot className="border-t-2 bg-gray-50 font-semibold">
                  <tr>
                    <td colSpan="5" className="px-3 py-2 text-right text-sm">TOTALES</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(datos.totales.base21)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(datos.totales.base105)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(datos.totales.iva21)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(datos.totales.iva105)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(datos.totales.netoNoGravado)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(datos.totales.percepcionIVA)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(datos.totales.percepcionIIBB)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(datos.totales.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
