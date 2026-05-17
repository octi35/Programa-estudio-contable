import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function PosicionIVA() {
  const [datos, setDatos] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [filters, setFilters] = useState({
    empresaId: '', anio: new Date().getFullYear(), mes: new Date().getMonth() + 1,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setFilters(f => ({ ...f, empresaId: data.data[0].id }));
    });
  }, []);

  const fetchPosicion = async () => {
    if (!filters.empresaId) return;
    setLoading(true);
    try {
      const { data } = await api.get('/iva/posicion', { params: filters });
      setDatos(data);
    } catch { toast.error('Error al calcular posición IVA'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Posición IVA</h1>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
          <select value={filters.empresaId} onChange={e => setFilters(f => ({ ...f, empresaId: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
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
        <button onClick={fetchPosicion} disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Calculando...' : 'Calcular'}
        </button>
      </div>

      {datos && (
        <div className={`rounded-xl border p-6 space-y-4 ${
          datos.resultado === 'A_FAVOR' ? 'bg-green-50 border-green-200' :
          datos.resultado === 'A_PAGAR' ? 'bg-red-50 border-red-200' : 'bg-gray-50'
        }`}>
          <h2 className="font-semibold text-gray-700">
            {datos.empresa?.razonSocial} — {MESES[datos.mes - 1]} {datos.anio}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-gray-500 mb-1">Débito Fiscal (IVA Ventas)</p>
              <p className="text-3xl font-bold text-red-600">{formatCurrency(datos.debitoFiscal)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm text-gray-500 mb-1">Crédito Fiscal (IVA Compras)</p>
              <p className="text-3xl font-bold text-green-600">{formatCurrency(datos.creditoFiscal)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-sm text-gray-500 mb-2">Posición del Período</p>
            <p className={`text-4xl font-bold ${
              datos.resultado === 'A_FAVOR' ? 'text-green-700' :
              datos.resultado === 'A_PAGAR' ? 'text-red-700' : 'text-gray-700'
            }`}>
              {formatCurrency(Math.abs(datos.saldo))}
            </p>
            <p className={`text-lg font-medium mt-1 ${
              datos.resultado === 'A_FAVOR' ? 'text-green-600' :
              datos.resultado === 'A_PAGAR' ? 'text-red-600' : 'text-gray-500'
            }`}>
              {datos.resultado === 'A_FAVOR' ? '✓ Saldo a Favor del Contribuyente' :
               datos.resultado === 'A_PAGAR' ? '↑ Saldo a Pagar a AFIP' :
               '= Posición Neutra'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
