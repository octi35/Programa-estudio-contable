import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, CalculatorIcon, CheckCircleIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../api/client';
import DetallesEditor from '../components/DetallesEditor';
import { formatMoney, formatDate, mesNombre } from '../utils/format';

const MOTIVOS = [
  { value: 'DESPIDO_SIN_CAUSA', label: 'Despido sin causa (indemnización + preaviso)' },
  { value: 'DESPIDO_CON_CAUSA', label: 'Despido con causa (preaviso, sin indemnización)' },
  { value: 'RENUNCIA', label: 'Renuncia voluntaria' },
  { value: 'MUTUO_ACUERDO', label: 'Mutuo acuerdo (art. 241 LCT)' },
  { value: 'JUBILACION', label: 'Jubilación' },
  { value: 'FALLECIMIENTO', label: 'Fallecimiento' },
  { value: 'VENCIMIENTO_CONTRATO', label: 'Vencimiento de contrato' },
];

export default function LiquidacionFinal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const empleadoIdParam = searchParams.get('empleadoId');

  const [empresas, setEmpresas] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [empleadoId, setEmpleadoId] = useState(empleadoIdParam || '');
  const [empresaId, setEmpresaId] = useState('');
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0]);
  const [motivo, setMotivo] = useState('DESPIDO_SIN_CAUSA');
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [periodoId, setPeriodoId] = useState(null);
  const [conceptos, setConceptos] = useState([]);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    api.get('/empresas').then(r => setEmpresas(r.data?.data || r.data));
    api.get('/conceptos').then(r => setConceptos(Array.isArray(r.data) ? r.data : (r.data?.data || []))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    api.get(`/empleados?empresaId=${empresaId}&activo=true&limit=200`)
      .then(r => setEmpleados(r.data?.data || r.data));
  }, [empresaId]);

  useEffect(() => {
    if (empleadoIdParam) {
      api.get(`/empleados/${empleadoIdParam}`).then(r => {
        setEmpresaId(r.data.empresaId);
      });
    }
  }, [empleadoIdParam]);

  const calcular = async (e) => {
    e.preventDefault();
    if (!empleadoId || !fechaBaja || !motivo) { toast.error('Completá todos los campos'); return; }
    setCalculando(true);
    setResultado(null);
    setEditMode(false);
    try {
      const res = await api.post('/liquidaciones/calcular-final', { empleadoId, fechaBaja, motivo });
      setResultado(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al calcular');
    } finally {
      setCalculando(false);
    }
  };

  const guardar = async () => {
    setConfirmando(true);
    try {
      const res = await api.post('/liquidaciones/guardar-final', { empleadoId, empresaId, fechaBaja, motivo });
      toast.success('Liquidación final guardada');
      navigate(`/liquidaciones/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setConfirmando(false);
    }
  };

  // Mapea los detalles calculados (con código) a líneas editables con conceptoId real
  const detallesEditables = () => {
    const porCodigo = {};
    conceptos.forEach(c => { porCodigo[c.codigo] = c.id; });
    const fallback = conceptos[0]?.id || '';
    return (resultado?.detalles || []).map(d => ({
      conceptoId: porCodigo[d.codigo] || fallback,
      descripcion: d.descripcion,
      naturaleza: d.naturaleza,
      tipo: d.tipo || 'REMUNERATIVO',
      remunerativo: d.remunerativo ?? true,
      importe: Math.abs(Number(d.importe || 0)),
      cantidad: d.cantidad ?? null,
      valorUnitario: d.valorUnitario ?? null,
      orden: d.orden ?? 0,
    }));
  };

  // Guarda con los importes editados: crea la liquidación final y sobreescribe sus líneas
  const guardarEditado = async (detalles) => {
    setConfirmando(true);
    try {
      const res = await api.post('/liquidaciones/guardar-final', { empleadoId, empresaId, fechaBaja, motivo });
      await api.put(`/liquidaciones/${res.data.id}/conceptos`, { detalles });
      toast.success('Liquidación final guardada con tus ajustes');
      navigate(`/liquidaciones/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    } finally {
      setConfirmando(false);
    }
  };

  const emp = resultado ? empleados.find(e => e.id === empleadoId) : null;
  const haberes = resultado?.detalles?.filter(d => d.naturaleza === 'HABER') || [];
  const descuentos = resultado?.detalles?.filter(d => d.naturaleza === 'DESCUENTO') || [];
  const informativos = resultado?.detalles?.filter(d => d.naturaleza === 'INFORMATIVO') || [];

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Liquidación Final</h1>
          <p className="text-gray-500 text-sm">Calcula haberes, SAC, vacaciones e indemnización al momento de la baja</p>
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={calcular} className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Empresa *</label>
            <select className="input" value={empresaId} onChange={e => { setEmpresaId(e.target.value); setEmpleadoId(''); }} required>
              <option value="">Seleccionar empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Empleado *</label>
            <select className="input" value={empleadoId} onChange={e => setEmpleadoId(e.target.value)} required disabled={!empresaId}>
              <option value="">Seleccionar empleado...</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre} (Leg. {e.legajoNumero})</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Fecha de baja *</label>
            <input type="date" className="input" value={fechaBaja} onChange={e => setFechaBaja(e.target.value)} required />
          </div>
          <div>
            <label className="label">Motivo de egreso *</label>
            <select className="input" value={motivo} onChange={e => setMotivo(e.target.value)} required>
              {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={calculando || !empleadoId} className="btn-primary">
            <CalculatorIcon className="w-4 h-4" />
            {calculando ? 'Calculando...' : 'Calcular liquidación final'}
          </button>
        </div>
      </form>

      {/* Resultado en modo edición */}
      {resultado && editMode && (
        <DetallesEditor
          detalles={detallesEditables()}
          conceptos={conceptos}
          saving={confirmando}
          title="Ajustá los importes de la liquidación final — se guardará exactamente lo que ves"
          saveLabel="Guardar liquidación final"
          onCancel={() => setEditMode(false)}
          onSave={guardarEditado}
        />
      )}

      {/* Resultado */}
      {resultado && !editMode && (
        <div className="card overflow-hidden">
          <div className="bg-[#1e3a5f] px-6 py-4 flex justify-between items-start">
            <div>
              <p className="text-white font-bold text-lg">LIQUIDACIÓN FINAL</p>
              <p className="text-blue-300 text-sm">{mesNombre(resultado.mes)} {resultado.anio} — {MOTIVOS.find(m => m.value === motivo)?.label}</p>
            </div>
            <div className="text-right">
              <p className="text-blue-300 text-xs uppercase">Neto a cobrar</p>
              <p className="text-white text-2xl font-bold">{formatMoney(resultado.totalNeto)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* Haberes */}
            <div>
              <div className="bg-green-700 px-4 py-2">
                <p className="text-white text-xs font-bold uppercase">Haberes</p>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {haberes.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-700">{d.descripcion}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-700">{formatMoney(d.importe)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-green-50 border-t border-green-200">
                    <td className="px-4 py-2 font-bold text-green-800">Total Haberes</td>
                    <td className="px-4 py-2 text-right font-bold text-green-800">{formatMoney(resultado.totalHaberes)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Descuentos */}
            <div>
              <div className="bg-red-700 px-4 py-2">
                <p className="text-white text-xs font-bold uppercase">Descuentos</p>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {descuentos.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-700">{d.descripcion}</td>
                      <td className="px-4 py-2 text-right font-medium text-red-600">{formatMoney(Math.abs(d.importe))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-red-50 border-t border-red-200">
                    <td className="px-4 py-2 font-bold text-red-800">Total Descuentos</td>
                    <td className="px-4 py-2 text-right font-bold text-red-800">{formatMoney(resultado.totalDescuentos)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Resumen financiero */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-gray-500 text-xs">Total Haberes</p><p className="font-bold text-gray-900">{formatMoney(resultado.totalHaberes)}</p></div>
              <div><p className="text-gray-500 text-xs">Total Descuentos</p><p className="font-bold text-gray-900">{formatMoney(resultado.totalDescuentos)}</p></div>
              <div><p className="text-gray-500 text-xs">Neto a Cobrar</p><p className="font-bold text-xl text-blue-700">{formatMoney(resultado.totalNeto)}</p></div>
            </div>
          </div>

          {/* Contribuciones */}
          {informativos.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
              <span className="font-semibold uppercase">Contrib. empleador:</span>
              {informativos.map((d, i) => (
                <span key={i} className="ml-3">{d.descripcion}: {formatMoney(d.importe)}</span>
              ))}
              <span className="ml-3 font-bold text-gray-700">Total: {formatMoney(resultado.totalContribuciones)}</span>
            </div>
          )}

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button onClick={() => setResultado(null)} className="btn-secondary">Recalcular</button>
            <button onClick={() => setEditMode(true)} disabled={confirmando || conceptos.length === 0} className="btn-secondary">
              <PencilSquareIcon className="w-4 h-4" /> Editar importes
            </button>
            <button onClick={guardar} disabled={confirmando} className="btn-primary">
              <CheckCircleIcon className="w-4 h-4" />
              {confirmando ? 'Guardando...' : 'Guardar liquidación'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
