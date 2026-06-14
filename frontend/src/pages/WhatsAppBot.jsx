import React, { useEffect, useState } from 'react';
import {
  ChatBubbleLeftRightIcon, QrCodeIcon, ArrowPathIcon,
  CheckCircleIcon, XCircleIcon, PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import api from '../api/client';

const ESTADOS = {
  open: { label: 'Conectado', color: 'text-green-600', icon: CheckCircleIcon },
  connecting: { label: 'Conectando…', color: 'text-amber-600', icon: ArrowPathIcon },
  close: { label: 'Desconectado', color: 'text-red-600', icon: XCircleIcon },
  no_configurado: { label: 'No configurado', color: 'text-gray-500', icon: XCircleIcon },
};

function normalizarQR(qr) {
  if (!qr) return null;
  const base = qr.base64 || qr.qrcode || qr.code || qr;
  if (typeof base !== 'string') return null;
  if (base.startsWith('data:image')) return base;
  if (base.startsWith('iVBOR') || base.length > 200) return `data:image/png;base64,${base}`;
  return null; // es un código tipo "2@..." → no es imagen
}

export default function WhatsAppBot() {
  const [estado, setEstado] = useState(null);
  const [qr, setQr] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState('');
  const [config, setConfig] = useState({ waNumero: '', waOperadores: '' });
  const [prueba, setPrueba] = useState('');

  const cargarEstado = async () => {
    try {
      const r = await api.get('/whatsapp/estado');
      setEstado(r.data);
      setConfig({ waNumero: r.data.numero || '', waOperadores: r.data.operadores || '' });
    } catch (e) {
      setEstado({ conexion: 'error', error: e.response?.data?.error || e.message });
    }
  };

  useEffect(() => { cargarEstado(); }, []);

  // Auto-refresh del estado mientras se está conectando o esperando el QR.
  useEffect(() => {
    if (!estado) return;
    if (['open', 'no_configurado', 'error'].includes(estado.conexion)) return;
    const t = setInterval(cargarEstado, 4000);
    return () => clearInterval(t);
  }, [estado?.conexion]);

  // Mientras no esté conectado, pollear el QR en vivo (Evolution lo renueva cada ~20s).
  useEffect(() => {
    if (!estado?.habilitado) return;
    if (estado.conexion === 'open') { setQr(null); return; }
    let activo = true;
    const traer = async () => {
      try {
        const r = await api.get('/whatsapp/qr');
        const img = normalizarQR(r.data.qr);
        if (activo && img) setQr(img);
      } catch { /* silencioso */ }
    };
    traer();
    const t = setInterval(traer, 6000);
    return () => { activo = false; clearInterval(t); };
  }, [estado?.conexion, estado?.habilitado]);

  const conectar = async () => {
    setCargando(true); setMsg('');
    try {
      const r = await api.post('/whatsapp/conectar', {});
      setQr(normalizarQR(r.data.qr));
      setMsg('Instancia creada. Escaneá el QR desde WhatsApp → Dispositivos vinculados.');
      cargarEstado();
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    } finally { setCargando(false); }
  };

  const refrescarQR = async () => {
    setCargando(true);
    try {
      const r = await api.get('/whatsapp/qr');
      setQr(normalizarQR(r.data.qr));
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    } finally { setCargando(false); }
  };

  const guardarConfig = async () => {
    setCargando(true); setMsg('');
    try {
      await api.put('/whatsapp/config', config);
      setMsg('Configuración guardada.');
      cargarEstado();
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    } finally { setCargando(false); }
  };

  const enviarPrueba = async () => {
    if (!prueba) return;
    setCargando(true); setMsg('');
    try {
      await api.post('/whatsapp/enviar-prueba', { telefono: prueba });
      setMsg(`Mensaje de prueba enviado a ${prueba}.`);
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    } finally { setCargando(false); }
  };

  const info = ESTADOS[estado?.conexion] || ESTADOS.close;
  const Icono = info.icon;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <ChatBubbleLeftRightIcon className="w-8 h-8 text-green-600" />
        <div>
          <h1 className="text-xl font-semibold">Bot de WhatsApp</h1>
          <p className="text-sm text-gray-500">Atención automática a empleados y facturación por chat (Evolution API).</p>
        </div>
      </div>

      {/* Estado de conexión */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icono className={`w-6 h-6 ${info.color}`} />
          <div>
            <div className={`font-medium ${info.color}`}>{info.label}</div>
            <div className="text-xs text-gray-500">
              Instancia: {estado?.instance || '—'} · Provider: {estado?.provider || '—'}
              {estado?.error ? ` · ${estado.error}` : ''}
            </div>
          </div>
        </div>
        <button onClick={cargarEstado} className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
          <ArrowPathIcon className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {estado && !estado.habilitado && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
          Evolution API no está configurada. En el backend seteá <code>WHATSAPP_PROVIDER=evolution</code>,
          <code> EVOLUTION_API_URL</code> y <code>EVOLUTION_API_KEY</code>. Guía completa en <code>whatsapp/README.md</code>.
        </div>
      )}

      {/* Conexión / QR */}
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="font-medium flex items-center gap-2"><QrCodeIcon className="w-5 h-5" /> Conectar número</h2>
        <div className="flex gap-2">
          <button onClick={conectar} disabled={cargando || !estado?.habilitado}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm">
            {estado?.conexion === 'open' ? 'Reconectar' : 'Conectar / Generar QR'}
          </button>
          {qr && (
            <button onClick={refrescarQR} disabled={cargando}
              className="px-4 py-2 border rounded hover:bg-gray-50 text-sm flex items-center gap-1">
              <ArrowPathIcon className="w-4 h-4" /> Refrescar QR
            </button>
          )}
        </div>
        {qr && estado?.conexion !== 'open' && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <img src={qr} alt="QR de WhatsApp" className="w-56 h-56 border rounded" />
            <p className="text-xs text-gray-500">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
          </div>
        )}
        {estado?.conexion === 'open' && (
          <p className="text-sm text-green-700">✅ Número vinculado y escuchando mensajes.</p>
        )}
      </div>

      {/* Configuración */}
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="font-medium">Configuración</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-gray-600">Número del bot</span>
            <input value={config.waNumero} onChange={e => setConfig({ ...config, waNumero: e.target.value })}
              placeholder="+54 9 3513 45-3579"
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-sm">
            <span className="text-gray-600">Operadores autorizados a facturar (coma)</span>
            <input value={config.waOperadores} onChange={e => setConfig({ ...config, waOperadores: e.target.value })}
              placeholder="5493513453579, 5491122334455"
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm" />
          </label>
        </div>
        <button onClick={guardarConfig} disabled={cargando}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-50 text-sm">
          Guardar configuración
        </button>
      </div>

      {/* Prueba */}
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="font-medium">Enviar mensaje de prueba</h2>
        <div className="flex gap-2">
          <input value={prueba} onChange={e => setPrueba(e.target.value)}
            placeholder="Número destino, ej: 5493513453579"
            className="flex-1 border rounded px-2 py-1.5 text-sm" />
          <button onClick={enviarPrueba} disabled={cargando || estado?.conexion !== 'open'}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm flex items-center gap-1">
            <PaperAirplaneIcon className="w-4 h-4" /> Enviar
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-gray-700 bg-gray-50 border rounded p-3">{msg}</div>}
    </div>
  );
}
