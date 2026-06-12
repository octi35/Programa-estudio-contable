import React, { useEffect, useRef, useState } from 'react';
import {
  SparklesIcon, PaperAirplaneIcon, WrenchIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import api from '../api/client';

const SUGERENCIAS = [
  '¿Qué empresas tienen empleados sin liquidar este mes?',
  '¿Cuánto cobró de aguinaldo García?',
  'Mostrame la masa salarial de este mes por empresa',
  '¿Cómo viene la posición de IVA de este período?',
];

// Render mínimo de markdown (negritas y tablas simples) sin dependencias
function Md({ texto }) {
  const lineas = texto.split('\n');
  const out = [];
  let tabla = [];

  const flushTabla = (key) => {
    if (tabla.length === 0) return;
    const filas = tabla.filter(l => !/^\s*\|[\s:-]+\|/.test(l));
    out.push(
      <table key={key} className="my-2 text-xs border border-gray-200 rounded">
        <tbody>
          {filas.map((l, i) => (
            <tr key={i} className={i === 0 ? 'bg-gray-100 font-semibold' : 'border-t border-gray-100'}>
              {l.split('|').filter(c => c.trim() !== '').map((c, j) => (
                <td key={j} className="px-2 py-1">{c.trim().replace(/\*\*/g, '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
    tabla = [];
  };

  lineas.forEach((l, i) => {
    if (l.trim().startsWith('|')) { tabla.push(l); return; }
    flushTabla(`t${i}`);
    if (l.trim() === '') return;
    const partes = l.split(/\*\*(.+?)\*\*/g);
    out.push(
      <p key={i} className="my-0.5">
        {partes.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
      </p>
    );
  });
  flushTabla('tfin');
  return <div>{out}</div>;
}

export default function AsistenteIA() {
  const [habilitado, setHabilitado] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const finRef = useRef(null);

  useEffect(() => {
    api.get('/asistente/estado').then(r => setHabilitado(r.data.habilitado)).catch(() => setHabilitado(false));
  }, []);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, cargando]);

  const enviar = async (texto) => {
    const pregunta = (texto ?? input).trim();
    if (!pregunta || cargando) return;
    setInput('');
    const nuevos = [...mensajes, { role: 'user', content: pregunta }];
    setMensajes(nuevos);
    setCargando(true);
    try {
      const r = await api.post('/asistente/chat', {
        mensajes: nuevos.map(({ role, content }) => ({ role, content })),
      }, { timeout: 90000 });
      setMensajes(m => [...m, { role: 'assistant', content: r.data.respuesta, tools: r.data.herramientasUsadas }]);
    } catch (_) {
      setMensajes(m => [...m, { role: 'assistant', content: 'Hubo un error procesando la consulta. Probá de nuevo.', error: true }]);
    } finally { setCargando(false); }
  };

  if (habilitado === false) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-4">
          <SparklesIcon className="w-7 h-7 text-violet-600" /> Asistente IA
        </h1>
        <div className="card p-8 text-center space-y-3">
          <SparklesIcon className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-gray-700 font-medium">El asistente no está configurado</p>
          <p className="text-sm text-gray-500">
            Creá una API key gratuita en <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">console.groq.com</a> y
            agregala como <span className="font-mono bg-gray-100 px-1 rounded">GROQ_API_KEY</span> en las variables de entorno del backend.
            No requiere tarjeta de crédito.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <SparklesIcon className="w-7 h-7 text-violet-600" /> Asistente IA
          </h1>
          <p className="text-gray-500 text-sm">Preguntale a tus datos: sueldos, liquidaciones, IVA, empresas</p>
        </div>
        {mensajes.length > 0 && (
          <button onClick={() => setMensajes([])} className="btn-secondary text-xs">
            <TrashIcon className="w-3.5 h-3.5" /> Limpiar
          </button>
        )}
      </div>

      {/* Conversación */}
      <div className="card flex-1 overflow-y-auto p-4 space-y-3">
        {mensajes.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <p className="text-gray-400 text-sm">Probá con una de estas:</p>
            <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGERENCIAS.map(s => (
                <button key={s} onClick={() => enviar(s)}
                  className="text-left text-sm border border-gray-200 hover:border-violet-300 hover:bg-violet-50 rounded-lg px-3 py-2 text-gray-600 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === 'user'
                ? 'bg-violet-600 text-white rounded-br-sm'
                : m.error ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              {m.role === 'assistant' ? <Md texto={m.content} /> : m.content}
              {m.tools?.length > 0 && (
                <p className="mt-1.5 text-[10px] text-gray-400 flex items-center gap-1">
                  <WrenchIcon className="w-3 h-3" /> consultó: {[...new Set(m.tools)].join(', ')}
                </p>
              )}
            </div>
          </div>
        ))}

        {cargando && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(d => (
                  <span key={d} className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={finRef} />
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); enviar(); }} className="mt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder='Ej: "¿cuánto le pagamos a Pérez en mayo?"'
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={cargando}
          autoFocus
        />
        <button type="submit" disabled={cargando || !input.trim()} className="btn-primary">
          <PaperAirplaneIcon className="w-4 h-4" />
        </button>
      </form>
      <p className="text-[10px] text-gray-400 mt-1 text-center">
        El asistente consulta solo los datos de tu estudio. Verificá los números importantes antes de usarlos.
      </p>
    </div>
  );
}
