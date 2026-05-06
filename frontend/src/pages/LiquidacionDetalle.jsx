import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, DocumentTextIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../api/client';
import { formatMoney, formatDate, mesNombre, estadoLiquidacionLabel, tipoLiquidacionLabel } from '../utils/format';

function ConceptoRow({ d, esDescuento }) {
  const importe = Math.abs(Number(d.importe));
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="py-2 px-4 text-sm text-gray-800">{d.descripcion}</td>
      <td className="py-2 px-4 text-sm text-right text-gray-500">
        {d.cantidad ? Number(d.cantidad).toLocaleString('es-AR') : ''}
      </td>
      <td className="py-2 px-4 text-sm text-right text-gray-500">
        {d.valorUnitario ? formatMoney(d.valorUnitario) : ''}
      </td>
      <td className={`py-2 px-4 text-sm text-right font-medium ${esDescuento ? 'text-red-600' : 'text-gray-900'}`}>
        {esDescuento ? `- ${formatMoney(importe)}` : formatMoney(importe)}
      </td>
    </tr>
  );
}

export default function LiquidacionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [liq, setLiq] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = () =>
    api.get(`/liquidaciones/${id}`)
      .then(res => setLiq(res.data))
      .finally(() => setLoading(false));

  useEffect(() => { cargar(); }, [id]);

  const confirmar = async () => {
    try {
      await api.post(`/liquidaciones/${id}/confirmar`);
      toast.success('Liquidación confirmada');
      cargar();
    } catch {
      toast.error('Error al confirmar');
    }
  };

  const abrirRecibo = () => window.open(`/api/liquidaciones/${id}/recibo`, '_blank');

  if (loading) return (
    <div className="flex justify-center p-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!liq) return <p className="text-gray-500">Liquidación no encontrada</p>;

  const emp = liq.empleado;
  const empresa = emp?.empresa;
  const haberes = liq.detalles.filter(d => d.naturaleza === 'HABER');
  const descuentos = liq.detalles.filter(d => d.naturaleza === 'DESCUENTO');
  const informativos = liq.detalles.filter(d => d.naturaleza === 'INFORMATIVO');
  const est = estadoLiquidacionLabel[liq.estado] || { label: liq.estado, cls: 'badge-gray' };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            {tipoLiquidacionLabel[liq.tipo] || liq.tipo} — {mesNombre(liq.mes)} {liq.anio}
          </h1>
          <p className="text-gray-500 text-sm">
            {emp?.apellido}, {emp?.nombre} · {emp?.cuil}
          </p>
        </div>
        <span className={est.cls}>{est.label}</span>
        {liq.estado === 'CALCULADO' && (
          <button onClick={confirmar} className="btn-success">
            <CheckCircleIcon className="w-4 h-4" /> Confirmar
          </button>
        )}
        <button onClick={abrirRecibo} className="btn-secondary">
          <DocumentTextIcon className="w-4 h-4" /> Ver recibo PDF
        </button>
      </div>

      {/* Info cabecera */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['Empresa', empresa?.razonSocial],
          ['Empleado', `${emp?.apellido}, ${emp?.nombre}`],
          ['Período', `${mesNombre(liq.mes)} ${liq.anio}`],
          ['Días trabajados', `${liq.diasTrabajados} días`],
          ['Categoría', emp?.categoria || '—'],
          ['Convenio', empresa?.convenio?.nombre || 'LCT 20.744'],
          ['Ingreso', formatDate(emp?.fechaIngreso)],
          ['Legajo N°', emp?.legajoNumero || '—'],
        ].map(([k, v]) => (
          <div key={k} className="card p-3">
            <p className="text-xs text-gray-400">{k}</p>
            <p className="font-medium text-gray-900 text-sm mt-0.5 truncate">{v}</p>
          </div>
        ))}
      </div>

      {/* Recibo visual */}
      <div className="card overflow-hidden">
        {/* Header recibo */}
        <div className="bg-[#1e3a5f] px-6 py-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white font-bold text-lg">{empresa?.razonSocial}</p>
              <p className="text-blue-300 text-sm">CUIT: {empresa?.cuit}</p>
              <p className="text-blue-300 text-xs">{empresa?.domicilio}</p>
            </div>
            <div className="text-right">
              <p className="text-white font-bold text-base">{tipoLiquidacionLabel[liq.tipo]}</p>
              <p className="text-blue-300 text-sm">{mesNombre(liq.mes)} {liq.anio}</p>
            </div>
          </div>
        </div>

        {/* Info empleado */}
        <div className="bg-blue-50 px-6 py-3 border-b border-blue-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span className="text-gray-500 text-xs">Empleado</span><p className="font-semibold text-gray-900">{emp?.apellido}, {emp?.nombre}</p></div>
          <div><span className="text-gray-500 text-xs">CUIL</span><p className="font-mono text-gray-900">{emp?.cuil}</p></div>
          <div><span className="text-gray-500 text-xs">Categoría</span><p className="text-gray-900">{emp?.categoria || '—'}</p></div>
          <div><span className="text-gray-500 text-xs">Días trab.</span><p className="text-gray-900">{liq.diasTrabajados}</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          {/* Haberes */}
          <div>
            <div className="bg-green-700 px-4 py-2">
              <p className="text-white text-xs font-bold uppercase tracking-wide">Haberes</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="py-1.5 px-4 text-xs text-left text-gray-500">Concepto</th>
                  <th className="py-1.5 px-4 text-xs text-right text-gray-500">Cant.</th>
                  <th className="py-1.5 px-4 text-xs text-right text-gray-500">V.Unit.</th>
                  <th className="py-1.5 px-4 text-xs text-right text-gray-500">Importe</th>
                </tr>
              </thead>
              <tbody>
                {haberes.map(d => <ConceptoRow key={d.id} d={d} esDescuento={false} />)}
              </tbody>
              <tfoot>
                <tr className="bg-green-50 border-t border-green-200">
                  <td colSpan={3} className="py-2 px-4 text-sm font-bold text-green-800">Total Haberes</td>
                  <td className="py-2 px-4 text-sm font-bold text-green-800 text-right">{formatMoney(liq.totalHaberes)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Descuentos */}
          <div>
            <div className="bg-red-700 px-4 py-2">
              <p className="text-white text-xs font-bold uppercase tracking-wide">Descuentos</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="py-1.5 px-4 text-xs text-left text-gray-500">Concepto</th>
                  <th className="py-1.5 px-4 text-xs text-right text-gray-500">Cant.</th>
                  <th className="py-1.5 px-4 text-xs text-right text-gray-500">V.Unit.</th>
                  <th className="py-1.5 px-4 text-xs text-right text-gray-500">Importe</th>
                </tr>
              </thead>
              <tbody>
                {descuentos.map(d => <ConceptoRow key={d.id} d={d} esDescuento={true} />)}
              </tbody>
              <tfoot>
                <tr className="bg-red-50 border-t border-red-200">
                  <td colSpan={3} className="py-2 px-4 text-sm font-bold text-red-800">Total Descuentos</td>
                  <td className="py-2 px-4 text-sm font-bold text-red-800 text-right">- {formatMoney(liq.totalDescuentos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Neto */}
        <div className="flex items-center justify-between bg-[#1e3a5f] px-6 py-4">
          <div className="text-blue-300 text-sm">
            <span>Haberes {formatMoney(liq.totalHaberes)}</span>
            <span className="mx-2">—</span>
            <span>Descuentos {formatMoney(liq.totalDescuentos)}</span>
          </div>
          <div className="text-right">
            <p className="text-blue-300 text-xs uppercase tracking-wide">Neto a cobrar</p>
            <p className="text-white text-2xl font-bold">{formatMoney(liq.totalNeto)}</p>
          </div>
        </div>

        {/* Contribuciones empleador */}
        {informativos.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contribuciones empleador (informativo)</p>
            <div className="flex flex-wrap gap-4">
              {informativos.map(d => (
                <div key={d.id} className="text-xs">
                  <span className="text-gray-500">{d.descripcion}: </span>
                  <span className="font-medium text-gray-700">{formatMoney(d.importe)}</span>
                </div>
              ))}
              <div className="text-xs font-bold">
                <span className="text-gray-500">Total contribuciones: </span>
                <span className="text-gray-900">{formatMoney(liq.totalContribuciones)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
