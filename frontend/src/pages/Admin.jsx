import React, { useState } from 'react';
import { CircleStackIcon, ArrowDownTrayIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function Admin() {
  const [descargando, setDescargando] = useState(false);

  const descargarBackup = async () => {
    setDescargando(true);
    try {
      const response = await api.get('/admin/backup', { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers['content-disposition'];
      const filename = disposition?.match(/filename="(.+)"/)?.[1] || 'backup.sql';
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup descargado exitosamente');
    } catch (e) {
      const errorMsg = await e.response?.data?.text?.() || '';
      let parsed;
      try { parsed = JSON.parse(errorMsg); } catch { parsed = {}; }
      toast.error(parsed?.error || 'Error al generar backup. Verifique que pg_dump esté disponible.');
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Administración del Sistema</h1>
        <p className="text-gray-500 text-sm">Herramientas de mantenimiento y backup</p>
      </div>

      {/* Backup */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="bg-blue-100 p-3 rounded-xl flex-shrink-0">
            <CircleStackIcon className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-800">Backup de la base de datos</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Descarga un archivo SQL con toda la base de datos usando <code className="bg-gray-100 px-1 rounded">pg_dump</code>.
              El archivo puede restaurarse con <code className="bg-gray-100 px-1 rounded">psql</code>.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
              <strong>Requisito:</strong> <code>pg_dump</code> debe estar instalado en el servidor backend (postgresql-client).
              En Windows: instalar PostgreSQL y agregar al PATH.
            </div>
            <button onClick={descargarBackup} disabled={descargando} className="btn-primary flex items-center gap-2">
              <ArrowDownTrayIcon className="w-4 h-4" />
              {descargando ? 'Generando backup...' : 'Descargar backup SQL'}
            </button>
          </div>
        </div>
      </div>

      {/* Seguridad */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="bg-green-100 p-3 rounded-xl flex-shrink-0">
            <ShieldCheckIcon className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-800">Estado del sistema</h2>
            <div className="mt-3 space-y-2 text-sm">
              {[
                ['Autenticación JWT', 'Activa', 'green'],
                ['Rate limiting API', 'Activo (200 req/15min)', 'green'],
                ['Validación CUIL/CBU', 'Activa', 'green'],
                ['Log de auditoría', 'Activo', 'green'],
                ['Multi-tenant isolation', 'Activo por estudioId', 'green'],
              ].map(([label, value, color]) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-gray-600">{label}</span>
                  <span className={`badge-${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
