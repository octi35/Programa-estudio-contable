import React, { useState } from 'react';
import { ArrowUpTrayIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../api/client';

const TEMPLATE_HEADERS = ['CUIL (XX-XXXXXXXX-X)', 'Legajo', 'Tipo Novedad', 'Descripción', 'Fecha Desde (YYYY-MM-DD)', 'Fecha Hasta (YYYY-MM-DD)', 'Valor/Importe'];
const TIPOS_NOVEDAD = ['ALTA','BAJA','CAMBIO_CATEGORIA','CAMBIO_BASICO','HORA_EXTRA','ADELANTO_SUELDO','LICENCIA','SUSPENSION','VACACIONES','DIAS_TRABAJADOS','DIAS_NO_REMUNERATIVOS','OBRA_SOCIAL_PREPAGA','SINDICATO','PERSONALIZADA'];

export default function ImportarNovedades() {
  const [archivo, setArchivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const importar = async () => {
    if (!archivo) { toast.error('Seleccioná un archivo Excel'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const res = await api.post('/empleados/novedades/importar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResultado(res.data);
      toast.success(`${res.data.importados} novedades importadas`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al importar');
    } finally {
      setLoading(false);
    }
  };

  const descargarTemplate = () => {
    // Genera un CSV de ejemplo
    const rows = [
      TEMPLATE_HEADERS.join(','),
      '20-25678901-3,0001,HORA_EXTRA,Horas extras mayo,2026-05-01,,1500',
      '27-32145678-4,0002,ADELANTO_SUELDO,Adelanto quincena,2026-05-10,,50000',
      '20-18901234-7,0003,CAMBIO_BASICO,Actualización salarial,2026-05-01,,680000',
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'template_novedades.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Novedades</h1>
        <p className="text-gray-500 text-sm mt-1">Cargá múltiples novedades de empleados desde un archivo Excel o CSV</p>
      </div>

      {/* Instrucciones */}
      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Formato del archivo</h2>
        <p className="text-sm text-gray-600">El archivo debe tener la primera fila como encabezados y las siguientes columnas:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-r border-gray-200">Col</th>
                <th className="px-3 py-2 text-left border-r border-gray-200">Nombre</th>
                <th className="px-3 py-2 text-left">Ejemplo / Valores válidos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['A', 'CUIL', '20-25678901-3 (identificador del empleado)'],
                ['B', 'Legajo', '0001 (alternativo al CUIL)'],
                ['C', 'Tipo Novedad', TIPOS_NOVEDAD.slice(0, 5).join(', ') + '...'],
                ['D', 'Descripción', 'Texto libre (opcional)'],
                ['E', 'Fecha Desde', '2026-05-01'],
                ['F', 'Fecha Hasta', '2026-05-31 (opcional)'],
                ['G', 'Valor/Importe', '15000 (opcional, numérico)'],
              ].map(([col, nom, ej]) => (
                <tr key={col}>
                  <td className="px-3 py-2 font-mono font-bold border-r border-gray-200">{col}</td>
                  <td className="px-3 py-2 font-medium border-r border-gray-200">{nom}</td>
                  <td className="px-3 py-2 text-gray-500">{ej}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pt-1">
          <p className="text-xs text-gray-500 mb-2">Tipos de novedad válidos:</p>
          <div className="flex flex-wrap gap-1">
            {TIPOS_NOVEDAD.map(t => (
              <span key={t} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono">{t}</span>
            ))}
          </div>
        </div>
        <button onClick={descargarTemplate} className="btn-secondary text-xs mt-2">
          Descargar template CSV de ejemplo
        </button>
      </div>

      {/* Upload */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Subir archivo</h2>
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${archivo ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setArchivo(f); }}>
          {archivo ? (
            <div className="space-y-2">
              <CheckCircleIcon className="w-10 h-10 text-green-500 mx-auto" />
              <p className="font-medium text-green-800">{archivo.name}</p>
              <p className="text-xs text-green-600">{(archivo.size / 1024).toFixed(1)} KB</p>
              <button onClick={() => setArchivo(null)} className="text-xs text-red-500 hover:underline">Quitar archivo</button>
            </div>
          ) : (
            <div className="space-y-2">
              <ArrowUpTrayIcon className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-gray-500 text-sm">Arrastrá un archivo Excel (.xlsx) o CSV aquí</p>
              <label className="btn-primary text-xs cursor-pointer">
                Seleccionar archivo
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => setArchivo(e.target.files[0])} />
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={importar} disabled={!archivo || loading} className="btn-primary">
            {loading ? 'Importando...' : 'Importar novedades'}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="w-6 h-6 text-green-600" />
            <h2 className="font-semibold text-gray-900">Resultado de la importación</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{resultado.importados}</p>
              <p className="text-xs text-green-600">Novedades importadas</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${resultado.errores?.length > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className={`text-2xl font-bold ${resultado.errores?.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>{resultado.errores?.length || 0}</p>
              <p className={`text-xs ${resultado.errores?.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>Errores</p>
            </div>
          </div>
          {resultado.errores?.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-red-700 mb-2">Filas con error:</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {resultado.errores.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 px-3 py-1.5 rounded">
                    <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span><strong>{e.fila}</strong>: {e.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
