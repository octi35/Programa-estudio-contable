import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { formatMoney, MESES } from '../utils/format';
import toast from 'react-hot-toast';
import { CalculatorIcon, CheckIcon } from '@heroicons/react/24/outline';

const ESCALA_GANANCIAS = [
  { desde: 0, hasta: 419447.06, tasa: 5, fijo: 0 },
  { desde: 419447.06, hasta: 838894.13, tasa: 9, fijo: 20972.35 },
  { desde: 838894.13, hasta: 1258341.19, tasa: 12, fijo: 58746.57 },
  { desde: 1258341.19, hasta: 1677788.26, tasa: 15, fijo: 109078.38 },
  { desde: 1677788.26, hasta: 2516682.38, tasa: 19, fijo: 172045.64 },
  { desde: 2516682.38, hasta: 3355576.51, tasa: 23, fijo: 331465.40 },
  { desde: 3355576.51, hasta: 5033364.76, tasa: 27, fijo: 524309.52 },
  { desde: 5033364.76, hasta: 6711153.01, tasa: 31, fijo: 977545.49 },
  { desde: 6711153.01, hasta: Infinity, tasa: 35, fijo: 1497614.93 },
];

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

export default function Ganancias() {
  const [empresas, setEmpresas] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [empleadoId, setEmpleadoId] = useState('');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [guardando, setGuardando] = useState(false);

  const [config, setConfig] = useState({
    conyuge: false,
    hijos: 0,
    hijosDiscapacitados: 0,
    alquiler: 0,
    hipoteca: 0,
    medicinaPrivada: 0,
    sepelio: 0,
    donaciones: 0,
    otrasDeduciones: 0,
  });

  const [calculo, setCalculo] = useState({
    mes: new Date().getMonth() + 1,
    remuneracion: '',
  });
  const [resultado, setResultado] = useState(null);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(({ data }) => {
      setEmpresas(data.data || []);
      if (data.data?.length > 0) setEmpresaId(data.data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    api.get('/empleados', { params: { empresaId, activo: true, limit: 200 } }).then(({ data }) => {
      setEmpleados(data.data || []);
      setEmpleadoId('');
    }).catch(() => {});
  }, [empresaId]);

  useEffect(() => {
    if (!empleadoId || !anio) return;
    api.get('/ganancias/config', { params: { empleadoId, anio } }).then(({ data }) => {
      if (data) {
        setConfig({
          conyuge: data.conyuge || false,
          hijos: data.hijos || 0,
          hijosDiscapacitados: data.hijosDiscapacitados || 0,
          alquiler: data.alquiler || 0,
          hipoteca: data.hipoteca || 0,
          medicinaPrivada: data.medicinaPrivada || 0,
          sepelio: data.sepelio || 0,
          donaciones: data.donaciones || 0,
          otrasDeduciones: data.otrasDeduciones || 0,
        });
      }
    }).catch(() => {});
  }, [empleadoId, anio]);

  const handleGuardar = async () => {
    if (!empleadoId) { toast.error('Seleccione un empleado'); return; }
    setGuardando(true);
    try {
      await api.post('/ganancias/config', { empleadoId, anio, ...config });
      toast.success('Configuración guardada');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const handleCalcular = async () => {
    if (!empleadoId) { toast.error('Seleccione un empleado'); return; }
    if (!calculo.remuneracion) { toast.error('Ingrese la remuneración'); return; }
    setCalculando(true);
    try {
      const { data } = await api.post('/ganancias/calcular', {
        empleadoId,
        anio,
        mes: calculo.mes,
        remuneracion: parseFloat(calculo.remuneracion),
      });
      setResultado(data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al calcular');
    } finally {
      setCalculando(false);
    }
  };

  const numField = (key, label) => (
    <div>
      <label className={lbl}>{label}</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={config[key]}
        onChange={e => setConfig(c => ({ ...c, [key]: parseFloat(e.target.value) || 0 }))}
        className={inp}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ganancias 4a Categoria</h1>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
          <option value="">Seleccionar empleado...</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>)}
        </select>
        <input
          type="number"
          value={anio}
          onChange={e => setAnio(parseInt(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm w-24"
          placeholder="Año"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Config deducciones */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Deducciones personales</h2>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="conyuge"
              checked={config.conyuge}
              onChange={e => setConfig(c => ({ ...c, conyuge: e.target.checked }))}
              className="w-4 h-4"
            />
            <label htmlFor="conyuge" className="text-sm text-gray-700">Conyuge a cargo</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Cantidad de hijos</label>
              <input
                type="number"
                min="0"
                value={config.hijos}
                onChange={e => setConfig(c => ({ ...c, hijos: parseInt(e.target.value) || 0 }))}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Hijos discapacitados</label>
              <input
                type="number"
                min="0"
                value={config.hijosDiscapacitados}
                onChange={e => setConfig(c => ({ ...c, hijosDiscapacitados: parseInt(e.target.value) || 0 }))}
                className={inp}
              />
            </div>
            {numField('alquiler', 'Alquiler mensual ($)')}
            {numField('hipoteca', 'Cuota hipoteca mensual ($)')}
            {numField('medicinaPrivada', 'Medicina privada mensual ($)')}
            {numField('sepelio', 'Sepelio anual ($)')}
            {numField('donaciones', 'Donaciones anuales ($)')}
            {numField('otrasDeduciones', 'Otras deducciones anuales ($)')}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleGuardar}
              disabled={guardando || !empleadoId}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <CheckIcon className="w-4 h-4" />
              {guardando ? 'Guardando...' : 'Guardar Configuracion'}
            </button>
          </div>
        </div>

        {/* Calcular retención */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Calcular retencion del mes</h2>
            <div>
              <label className={lbl}>Mes</label>
              <select
                value={calculo.mes}
                onChange={e => setCalculo(c => ({ ...c, mes: parseInt(e.target.value) }))}
                className={inp}
              >
                {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Remuneracion bruta mensual ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={calculo.remuneracion}
                onChange={e => setCalculo(c => ({ ...c, remuneracion: e.target.value }))}
                className={inp}
                placeholder="0.00"
              />
            </div>
            <button
              onClick={handleCalcular}
              disabled={calculando || !empleadoId}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <CalculatorIcon className="w-4 h-4" />
              {calculando ? 'Calculando...' : 'Calcular'}
            </button>
          </div>

          {resultado && (
            <div className="bg-white rounded-xl border p-6 space-y-3">
              <h2 className="font-semibold text-gray-800">Resultado</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Base imponible:</span>
                  <span className="font-medium">{formatMoney(resultado.baseImponible)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Deducciones totales:</span>
                  <span className="font-medium">{formatMoney(resultado.deduccionesTotales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Acumulado anual:</span>
                  <span className="font-medium">{formatMoney(resultado.acumuladoAnual)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-semibold text-gray-800">Retencion del mes:</span>
                  <span className="font-bold text-blue-700 text-base">{formatMoney(resultado.retencion)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Escala */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Escala de Ganancias 2024 (4a Categoria)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ganancia neta imponible desde</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Hasta</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Pagan</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Mas el % sobre excedente</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ESCALA_GANANCIAS.map((fila, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{formatMoney(fila.desde)}</td>
                  <td className="px-4 py-3 text-gray-700">{fila.hasta === Infinity ? 'En adelante' : formatMoney(fila.hasta)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatMoney(fila.fijo)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{fila.tasa}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
