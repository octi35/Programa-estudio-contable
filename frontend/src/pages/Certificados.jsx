import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { formatDate, MESES } from '../utils/format';
import toast from 'react-hot-toast';
import { DocumentArrowDownIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import Modal from '../components/Modal';

const inp = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
const lbl = 'block text-xs font-medium text-gray-600 mb-1';

function usarHistorial() {
  const [historial, setHistorial] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('cert_historial') || '[]'); } catch { return []; }
  });
  const agregar = (item) => {
    setHistorial(prev => {
      const nuevo = [item, ...prev].slice(0, 20);
      sessionStorage.setItem('cert_historial', JSON.stringify(nuevo));
      return nuevo;
    });
  };
  return [historial, agregar];
}

async function descargarPdf(url, nombre) {
  const resp = await api.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(resp.data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

export default function Certificados() {
  const [empresas, setEmpresas] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [empleadoId, setEmpleadoId] = useState('');
  const [historial, agregarHistorial] = usarHistorial();

  // Modales
  const [modalTrabajo, setModalTrabajo] = useState(false);
  const [modalHaberes, setModalHaberes] = useState(false);
  const [modalRem, setModalRem] = useState(false);

  // Params haberes y remuneraciones
  const [haberesMes, setHaberesMes] = useState(new Date().getMonth() + 1);
  const [haberesAnio, setHaberesAnio] = useState(new Date().getFullYear());
  const [remAnio, setRemAnio] = useState(new Date().getFullYear());

  const [descargando, setDescargando] = useState(false);

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

  const empleadoNombre = () => {
    const e = empleados.find(x => x.id === empleadoId);
    return e ? `${e.apellido}_${e.nombre}` : 'empleado';
  };

  const handleTrabajo = async () => {
    if (!empleadoId) { toast.error('Seleccione un empleado'); return; }
    setDescargando(true);
    try {
      await descargarPdf(`/certificados/trabajo/${empleadoId}`, `cert_trabajo_${empleadoNombre()}.pdf`);
      agregarHistorial({ tipo: 'Certificado de Trabajo', empleado: empleadoNombre(), fecha: new Date().toISOString() });
      toast.success('Descargado correctamente');
      setModalTrabajo(false);
    } catch {
      toast.error('Error al generar el certificado');
    } finally {
      setDescargando(false);
    }
  };

  const handleHaberes = async () => {
    if (!empleadoId) { toast.error('Seleccione un empleado'); return; }
    setDescargando(true);
    try {
      await descargarPdf(
        `/certificados/haberes/${empleadoId}?anio=${haberesAnio}&mes=${haberesMes}`,
        `cert_haberes_${empleadoNombre()}_${haberesAnio}${String(haberesMes).padStart(2, '0')}.pdf`
      );
      agregarHistorial({ tipo: 'Certificado de Haberes', empleado: empleadoNombre(), fecha: new Date().toISOString() });
      toast.success('Descargado correctamente');
      setModalHaberes(false);
    } catch {
      toast.error('Error al generar el certificado');
    } finally {
      setDescargando(false);
    }
  };

  const handleRemuneraciones = async () => {
    if (!empleadoId) { toast.error('Seleccione un empleado'); return; }
    setDescargando(true);
    try {
      await descargarPdf(
        `/certificados/remuneraciones/${empleadoId}?anio=${remAnio}`,
        `cert_remuneraciones_${empleadoNombre()}_${remAnio}.pdf`
      );
      agregarHistorial({ tipo: 'Constancia Remuneraciones Anuales', empleado: empleadoNombre(), fecha: new Date().toISOString() });
      toast.success('Descargado correctamente');
      setModalRem(false);
    } catch {
      toast.error('Error al generar el certificado');
    } finally {
      setDescargando(false);
    }
  };

  const cardBtn = (label, sub, onClick) => (
    <button
      onClick={onClick}
      disabled={!empleadoId}
      className="bg-white rounded-xl border p-6 text-left hover:shadow-md hover:border-blue-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed group w-full"
    >
      <div className="flex items-start gap-4">
        <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
          <DocumentArrowDownIcon className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <p className="font-semibold text-gray-800">{label}</p>
          <p className="text-sm text-gray-500 mt-1">{sub}</p>
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Certificados Laborales</h1>
      </div>

      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm min-w-[220px]">
          <option value="">Seleccionar empleado...</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>)}
        </select>
      </div>

      {!empleadoId && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          Seleccione una empresa y un empleado para habilitar la generacion de certificados.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cardBtn('Certificado de Trabajo', 'Art. 80 LCT — Acredita relacion laboral, antiguedad y remuneracion', () => setModalTrabajo(true))}
        {cardBtn('Certificado de Haberes', 'Detalle de remuneraciones de un mes especifico', () => setModalHaberes(true))}
        {cardBtn('Constancia de Remuneraciones Anuales', 'Sueldos y retenciones del ano completo (F.649)', () => setModalRem(true))}
      </div>

      {/* Historial sesion */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <ClipboardDocumentListIcon className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-800">Historial de descargas (sesion)</h2>
        </div>
        {historial.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Sin descargas en esta sesion</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empleado</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {historial.map((h, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{h.tipo}</td>
                  <td className="px-4 py-3 text-gray-600">{h.empleado}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(h.fecha).toLocaleTimeString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal trabajo */}
      {modalTrabajo && (
        <Modal onClose={() => setModalTrabajo(false)} title="Certificado de Trabajo (Art. 80 LCT)">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Se generara el Certificado de Trabajo para <strong>{empleados.find(e => e.id === empleadoId)?.apellido}, {empleados.find(e => e.id === empleadoId)?.nombre}</strong>.
              Este documento acredita la relacion laboral, antiguedad y remuneracion habitual.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setModalTrabajo(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleTrabajo} disabled={descargando}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <DocumentArrowDownIcon className="w-4 h-4" />
                {descargando ? 'Generando...' : 'Descargar PDF'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal haberes */}
      {modalHaberes && (
        <Modal onClose={() => setModalHaberes(false)} title="Certificado de Haberes">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Seleccione el periodo para el certificado de haberes.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Mes</label>
                <select value={haberesMes} onChange={e => setHaberesMes(parseInt(e.target.value))} className={inp}>
                  {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Ano</label>
                <input type="number" value={haberesAnio} onChange={e => setHaberesAnio(parseInt(e.target.value))} className={inp} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setModalHaberes(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleHaberes} disabled={descargando}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <DocumentArrowDownIcon className="w-4 h-4" />
                {descargando ? 'Generando...' : 'Descargar PDF'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal remuneraciones */}
      {modalRem && (
        <Modal onClose={() => setModalRem(false)} title="Constancia de Remuneraciones Anuales">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Seleccione el ano fiscal para la constancia de remuneraciones.</p>
            <div>
              <label className={lbl}>Ano fiscal</label>
              <input type="number" value={remAnio} onChange={e => setRemAnio(parseInt(e.target.value))} className={inp} />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setModalRem(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={handleRemuneraciones} disabled={descargando}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <DocumentArrowDownIcon className="w-4 h-4" />
                {descargando ? 'Generando...' : 'Descargar PDF'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
