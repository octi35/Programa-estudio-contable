import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowUpTrayIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import api from '../api/client';
import Modal from './Modal';

/**
 * Botón reutilizable de importación desde Excel.
 *
 * Props:
 *  - endpoint:    URL del endpoint que recibe FormData con `archivo` (string)
 *  - label:       texto del botón disparador
 *  - title:       título del modal
 *  - extraData:   { campos extra } que se agregan al FormData (ej: empresaId)
 *  - columnas:    array de { nombre, descripcion, requerido? } para mostrar el formato esperado
 *  - ejemplo:     string opcional con una fila de ejemplo
 *  - onSuccess:   callback al terminar exitosamente
 *  - variant:     "primary" | "secondary"
 */
export default function ImportExcelButton({
  endpoint, label = 'Importar Excel', title = 'Importar desde Excel',
  extraData = {}, columnas = [], ejemplo, onSuccess, variant = 'secondary',
}) {
  const [open, setOpen] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef();

  const reset = () => { setArchivo(null); setResultado(null); setEnviando(false); };

  const cerrar = () => {
    if (enviando) return;
    setOpen(false);
    setTimeout(reset, 200);
  };

  const subir = async () => {
    if (!archivo) { toast.error('Seleccioná un archivo'); return; }
    setEnviando(true);
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      Object.entries(extraData).forEach(([k, v]) => { if (v != null && v !== '') fd.append(k, v); });
      const r = await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResultado(r.data);
      if (r.data.exitosos > 0) {
        toast.success(`${r.data.exitosos} registros importados`);
        onSuccess?.(r.data);
      }
    } catch (_) { /* interceptor */ }
    finally { setEnviando(false); }
  };

  const btnClass = variant === 'primary' ? 'btn-primary' : 'btn-secondary';

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${btnClass} text-sm`}>
        <ArrowUpTrayIcon className="w-4 h-4" /> {label}
      </button>

      {open && (
        <Modal open onClose={cerrar} title={title} size="lg">
          {resultado ? (
            <div className="space-y-4">
              <div className={`rounded-lg p-4 border ${resultado.exitosos > 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="flex gap-3">
                  <CheckCircleIcon className={`w-6 h-6 flex-shrink-0 ${resultado.exitosos > 0 ? 'text-green-600' : 'text-yellow-600'}`} />
                  <div className="text-sm">
                    <p className="font-semibold">Importación finalizada</p>
                    <p className="text-gray-700 mt-1">
                      Total filas: <b>{resultado.total}</b> · Exitosos: <b className="text-green-700">{resultado.exitosos}</b> · Fallidos: <b className="text-red-700">{resultado.fallidos}</b>
                    </p>
                  </div>
                </div>
              </div>

              {resultado.errores?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-64 overflow-y-auto">
                  <p className="font-semibold text-red-800 mb-2 text-sm">Errores ({resultado.errores.length}):</p>
                  <ul className="text-xs text-red-700 space-y-1 font-mono">
                    {resultado.errores.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        {e.fila && `Fila ${e.fila}: `}
                        {e.numero && `Nº ${e.numero}: `}
                        {e.cuil && `CUIL ${e.cuil}: `}
                        {e.razonSocial && `${e.razonSocial}: `}
                        {e.error}
                      </li>
                    ))}
                    {resultado.errores.length > 50 && <li>...y {resultado.errores.length - 50} más</li>}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button onClick={reset} className="btn-secondary">Importar otro</button>
                <button onClick={cerrar} className="btn-primary">Cerrar</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {columnas.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                  <p className="font-semibold text-blue-900 mb-2">Formato esperado del Excel</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left border-b border-blue-200">
                          <th className="py-1 pr-3 font-medium">Columna</th>
                          <th className="py-1 font-medium">Descripción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {columnas.map(c => (
                          <tr key={c.nombre} className="border-b border-blue-100/50">
                            <td className="py-1 pr-3 font-mono text-blue-800">
                              {c.nombre}{c.requerido && <span className="text-red-500">*</span>}
                            </td>
                            <td className="py-1 text-gray-600">{c.descripcion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {ejemplo && (
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <p className="text-blue-900 font-medium">Ejemplo de fila:</p>
                      <code className="block bg-white p-2 rounded mt-1 break-all">{ejemplo}</code>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="label">Archivo Excel (.xlsx)</label>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setArchivo(e.target.files?.[0])}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border file:border-gray-300 file:bg-white file:text-gray-700 file:hover:bg-gray-50"
                />
                {archivo && (
                  <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                    <CheckCircleIcon className="w-4 h-4 text-green-600" />
                    {archivo.name} · {(archivo.size / 1024).toFixed(1)} KB
                    <button onClick={() => { setArchivo(null); inputRef.current.value = ''; }} className="text-red-500 hover:text-red-700 ml-1">
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button onClick={cerrar} disabled={enviando} className="btn-secondary">Cancelar</button>
                <button onClick={subir} disabled={!archivo || enviando} className="btn-primary">
                  {enviando ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
