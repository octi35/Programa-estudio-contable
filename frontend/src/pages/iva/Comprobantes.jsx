import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { formatCurrency, formatDate } from '../../utils/format';
import toast from 'react-hot-toast';
import {
  PlusIcon, FunnelIcon, MagnifyingGlassIcon, TrashIcon, PencilIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import Modal from '../../components/Modal';
import { confirm } from '../../components/confirm';
import ImportExcelButton from '../../components/ImportExcelButton';
import ComprobanteForm from '../../components/iva/ComprobanteForm';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const TIPOS_MOV = [{ value: 'COMPRA', label: 'Compras' }, { value: 'VENTA', label: 'Ventas' }];

export default function Comprobantes() {
  const [comprobantes, setComprobantes] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    empresaId: '', tipoMovimiento: 'COMPRA',
    anio: new Date().getFullYear(), mes: new Date().getMonth() + 1,
  });
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);

  const fetchEmpresas = async () => {
    const { data } = await api.get('/empresas', { params: { limit: 200 } });
    setEmpresas(data.data || []);
    if (data.data?.length > 0 && !filters.empresaId) {
      setFilters(f => ({ ...f, empresaId: data.data[0].id }));
    }
  };

  const fetchComprobantes = useCallback(async () => {
    if (!filters.empresaId) return;
    setLoading(true);
    try {
      const { data } = await api.get('/iva/comprobantes', { params: { ...filters, page } });
      setComprobantes(data.data || []);
      setPagination(data.pagination || {});
    } catch { toast.error('Error al cargar comprobantes'); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { fetchEmpresas(); }, []);
  useEffect(() => { fetchComprobantes(); }, [fetchComprobantes]);

  const handleAnular = async (comp) => {
    const numero = comp?.numero || comp?.id;
    if (!await confirm({
      title: `Anular comprobante ${numero}`,
      message: 'El comprobante quedará marcado como ANULADO y dejará de computar en el Libro IVA y la posición fiscal.',
      details: [
        'Si tiene un asiento contable asociado, el mismo NO se anula automáticamente — debés anularlo manualmente.',
        'Esta acción es definitiva.',
      ],
      confirmText: 'Anular comprobante',
      requireText: 'ANULAR',
      danger: true,
    })) return;
    try {
      await api.delete(`/iva/comprobantes/${comp.id}`);
      toast.success('Comprobante anulado');
      fetchComprobantes();
    } catch { toast.error('Error al anular'); }
  };

  const handleExportar = async () => {
    if (!filters.empresaId) return;
    try {
      const resp = await api.get('/iva/exportar-afip', {
        params: { ...filters },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iva_${filters.tipoMovimiento.toLowerCase()}_${filters.anio}${String(filters.mes).padStart(2,'0')}.txt`;
      a.click();
    } catch { toast.error('Error al exportar'); }
  };

  const badgeTipo = (tipo) => {
    const colores = {
      FACTURA_A: 'bg-blue-100 text-blue-800', FACTURA_B: 'bg-green-100 text-green-800',
      FACTURA_C: 'bg-yellow-100 text-yellow-800', NOTA_CREDITO_A: 'bg-red-100 text-red-800',
      NOTA_CREDITO_B: 'bg-red-50 text-red-700', NOTA_DEBITO_A: 'bg-orange-100 text-orange-800',
    };
    return colores[tipo] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Comprobantes IVA</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExportar} className="btn-secondary flex items-center gap-2 text-sm px-3 py-2 border rounded-lg hover:bg-gray-50">
            <ArrowDownTrayIcon className="w-4 h-4" /> Exportar AFIP
          </button>
          {filters.empresaId && (
            <ImportExcelButton
              endpoint="/iva/comprobantes/importar"
              label="Importar Excel"
              title="Importar comprobantes IVA"
              extraData={{ empresaId: filters.empresaId }}
              columnas={[
                { nombre: 'fecha', descripcion: 'DD/MM/AAAA o YYYY-MM-DD', requerido: true },
                { nombre: 'tipo_movimiento', descripcion: 'COMPRA o VENTA', requerido: true },
                { nombre: 'tipo_comprobante', descripcion: 'FACTURA_A, FACTURA_B, NOTA_CREDITO_A...', requerido: true },
                { nombre: 'pto_venta', descripcion: 'Punto de venta (número)' },
                { nombre: 'numero', descripcion: 'Número de comprobante', requerido: true },
                { nombre: 'cuit_proveedor', descripcion: 'CUIT (se crea proveedor si no existe)' },
                { nombre: 'razon_social', descripcion: 'Razón social del proveedor/cliente' },
                { nombre: 'neto_21', descripcion: 'Neto gravado al 21%' },
                { nombre: 'neto_105', descripcion: 'Neto gravado al 10,5%' },
                { nombre: 'neto_27', descripcion: 'Neto gravado al 27%' },
                { nombre: 'iva_21 / iva_105 / iva_27', descripcion: 'IVA discriminado (opcional, se calcula desde el neto)' },
                { nombre: 'exento / no_gravado / percep_iva / percep_iibb / retencion', descripcion: 'Conceptos adicionales' },
                { nombre: 'total', descripcion: 'Total (opcional, se calcula)' },
              ]}
              ejemplo="15/05/2026, COMPRA, FACTURA_A, 1, 12345, 30712345678, ACME SA, 100000, 0, 0"
              onSuccess={() => fetchComprobantes()}
            />
          )}
          <button onClick={() => { setEditando(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <PlusIcon className="w-4 h-4" /> Nuevo
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={filters.empresaId} onChange={e => setFilters(f => ({ ...f, empresaId: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px]">
          <option value="">Todas las empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>

        <select value={filters.tipoMovimiento} onChange={e => setFilters(f => ({ ...f, tipoMovimiento: e.target.value }))}
          className="border rounded-lg px-3 py-2 text-sm">
          {TIPOS_MOV.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <select value={filters.mes} onChange={e => setFilters(f => ({ ...f, mes: parseInt(e.target.value) }))}
          className="border rounded-lg px-3 py-2 text-sm">
          {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>

        <input type="number" value={filters.anio} onChange={e => setFilters(f => ({ ...f, anio: parseInt(e.target.value) }))}
          className="border rounded-lg px-3 py-2 text-sm w-24" placeholder="Año" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : comprobantes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No hay comprobantes en este período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">Número</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Proveedor/Cliente</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 hidden lg:table-cell">Neto Grav.</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 hidden md:table-cell">IVA</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {comprobantes.map(c => {
                  const ivaTotal = parseFloat(c.iva21) + parseFloat(c.iva105) + parseFloat(c.iva27);
                  const netoTotal = parseFloat(c.netoGravado21) + parseFloat(c.netoGravado105) + parseFloat(c.netoGravado27);
                  return (
                    <tr key={c.id} className={`hover:bg-gray-50 ${c.anulado ? 'opacity-40 line-through' : ''}`}>
                      <td className="px-4 py-3 text-gray-600">{formatDate(c.fecha)}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeTipo(c.tipoComprobante)}`}>
                          {c.tipoComprobante.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono hidden md:table-cell">
                        {String(c.puntoVenta).padStart(4,'0')}-{String(c.numero).padStart(8,'0')}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{c.proveedorCliente?.razonSocial || 'Consumidor Final'}</p>
                        <p className="text-xs text-gray-400">{c.proveedorCliente?.cuit || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 hidden lg:table-cell">{formatCurrency(netoTotal)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 hidden md:table-cell">{formatCurrency(ivaTotal)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(c.total)}</td>
                      <td className="px-4 py-3 text-center">
                        {!c.anulado && (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => { setEditando(c); setShowForm(true); }}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleAnular(c)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`px-3 py-1 rounded text-sm ${p === page ? 'bg-blue-600 text-white' : 'border hover:bg-gray-50'}`}>
              {p}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)} title={editando ? 'Editar Comprobante' : 'Nuevo Comprobante'} size="xl">
          <ComprobanteForm
            comprobante={editando}
            empresas={empresas}
            defaultEmpresaId={filters.empresaId}
            defaultTipo={filters.tipoMovimiento}
            defaultAnio={filters.anio}
            defaultMes={filters.mes}
            onSave={() => { setShowForm(false); fetchComprobantes(); }}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}
    </div>
  );
}
