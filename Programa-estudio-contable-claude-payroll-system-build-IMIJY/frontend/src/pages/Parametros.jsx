import React, { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { formatDate } from '../utils/format';

export default function Parametros() {
  const [parametros, setParametros] = useState([]);
  const [editados, setEditados] = useState({});
  const [guardando, setGuardando] = useState(false);

  const fetchParametros = async () => {
    try {
      const { data } = await api.get('/parametros');
      setParametros(data || []);
    } catch { toast.error('Error al cargar parámetros'); }
  };

  useEffect(() => { fetchParametros(); }, []);

  const handleChange = (clave, valor) => {
    setEditados(prev => ({ ...prev, [clave]: valor }));
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      const cambios = Object.entries(editados).map(([clave, valor]) => ({
        clave,
        valor: String(valor),
        descripcion: parametros.find(p => p.clave === clave)?.descripcion,
      }));
      if (cambios.length === 0) { toast('Sin cambios para guardar'); return; }
      await api.put('/parametros', { parametros: cambios });
      toast.success(`${cambios.length} parámetros actualizados`);
      setEditados({});
      fetchParametros();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al guardar'); }
    finally { setGuardando(false); }
  };

  const grupos = {
    'Aportes y Contribuciones': parametros.filter(p => ['PORCENTAJE_SINDICATO','PORCENTAJE_CUOTA_SOLIDARIA','PORCENTAJE_ART'].includes(p.clave)),
    'Parámetros AFIP': parametros.filter(p => ['TOPE_ANSES','MINIMO_NO_IMPONIBLE'].includes(p.clave)),
    'Alícuotas IVA': parametros.filter(p => p.clave.startsWith('ALICUOTA_IVA')),
    'Liquidaciones': parametros.filter(p => p.clave.startsWith('VALOR_HORA')),
  };

  const tienesCambios = Object.keys(editados).length > 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Parámetros Fiscales</h1>
        {tienesCambios && (
          <button onClick={handleGuardar} disabled={guardando}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {guardando ? 'Guardando...' : `Guardar ${Object.keys(editados).length} cambio(s)`}
          </button>
        )}
      </div>

      {Object.entries(grupos).map(([grupo, items]) => items.length === 0 ? null : (
        <div key={grupo} className="bg-white rounded-xl border">
          <div className="px-5 py-3 border-b bg-gray-50 rounded-t-xl">
            <h2 className="font-semibold text-gray-700 text-sm">{grupo}</h2>
          </div>
          <div className="divide-y">
            {items.map(p => {
              const valor = editados[p.clave] ?? p.valor;
              const esMoneda = ['TOPE_ANSES','MINIMO_NO_IMPONIBLE'].includes(p.clave);
              const esPorcentaje = p.clave.includes('PORCENTAJE') || p.clave.includes('ALICUOTA');
              return (
                <div key={p.clave} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{p.descripcion || p.clave}</p>
                    <p className="text-xs text-gray-400 font-mono">{p.clave}</p>
                    {p.vigenciaDesde && <p className="text-xs text-gray-400">Vigente desde: {formatDate(p.vigenciaDesde)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {esMoneda && <span className="text-gray-500 text-sm">$</span>}
                    <input
                      type="number"
                      step={esPorcentaje ? '0.01' : '1'}
                      value={valor}
                      onChange={e => handleChange(p.clave, e.target.value)}
                      className={`border rounded-lg px-3 py-2 text-sm w-36 text-right focus:outline-none focus:ring-2 focus:ring-blue-500
                        ${editados[p.clave] !== undefined ? 'border-blue-400 bg-blue-50' : ''}`}
                    />
                    {esPorcentaje && <span className="text-gray-500 text-sm">%</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
        <strong>Nota:</strong> Los cambios en parámetros fiscales se registran con la fecha actual como vigencia.
        Los períodos anteriores conservan los valores históricos. Para retroliquidar, usar los parámetros vigentes al momento del período.
      </div>
    </div>
  );
}
