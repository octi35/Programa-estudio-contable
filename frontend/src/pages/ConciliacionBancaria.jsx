import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ScaleIcon, CheckCircleIcon, ArrowPathIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import api from '../api/client';
import { formatMoney } from '../utils/format';

const CONFIANZA = {
  ALTA: 'bg-green-100 text-green-700 border-green-200',
  MEDIA: 'bg-amber-100 text-amber-700 border-amber-200',
  SIN_MATCH: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function ConciliacionBancaria() {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [cuentas, setCuentas] = useState([]);
  const [cuentaId, setCuentaId] = useState('');
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmando, setConfirmando] = useState(null);

  useEffect(() => {
    api.get('/empresas', { params: { limit: 200 } }).then(r => {
      setEmpresas(r.data.data || []);
      if (r.data.data?.length) setEmpresaId(r.data.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    setCuentas([]); setCuentaId(''); setDatos(null);
    api.get('/bancos', { params: { empresaId } }).then(r => {
      const lista = r.data || [];
      setCuentas(lista);
      if (lista.length) setCuentaId(lista[0].id);
    });
  }, [empresaId]);

  const cargar = async () => {
    if (!cuentaId) return;
    setLoading(true);
    try {
      const r = await api.get(`/bancos/${cuentaId}/conciliacion`);
      setDatos(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (cuentaId) cargar(); }, [cuentaId]);

  const confirmar = async (movimientoId, candidato) => {
    setConfirmando(movimientoId);
    try {
      await api.post(`/bancos/${cuentaId}/conciliacion/confirmar`, {
        movimientoId,
        tipo: candidato.tipo,
        referenciaId: candidato.referenciaId,
      });
      toast.success('Movimiento conciliado');
      cargar();
    } catch (_) {}
    finally { setConfirmando(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScaleIcon className="w-7 h-7 text-blue-600" />
            Conciliación Bancaria
          </h1>
          <p className="text-gray-500 text-sm">
            Matcheo automático de movimientos contra comprobantes y facturas — vos solo confirmás
          </p>
        </div>
        <button onClick={cargar} disabled={loading || !cuentaId} className="btn-secondary text-sm">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <select className="input w-64" value={empresaId} onChange={e => setEmpresaId(e.target.value)}>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
        <select className="input w-72" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
          {cuentas.length === 0 && <option value="">Sin cuentas bancarias</option>}
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco} — {c.numeroCuenta}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="card p-10 text-center">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm mt-3">Buscando coincidencias...</p>
        </div>
      ) : !datos ? (
        <div className="card p-10 text-center text-gray-400 text-sm">
          Seleccioná una cuenta bancaria con movimientos importados
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Sin conciliar</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{datos.pendientes}</p>
            </div>
            <div className="card p-4 bg-green-50 border-green-200">
              <p className="text-xs text-green-700 uppercase tracking-wide font-semibold flex items-center gap-1">
                <SparklesIcon className="w-3.5 h-3.5" /> Con match sugerido
              </p>
              <p className="text-2xl font-bold text-green-800 mt-1">{datos.conMatch}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Sin sugerencia</p>
              <p className="text-2xl font-bold text-gray-500 mt-1">{datos.sinMatch}</p>
            </div>
          </div>

          {datos.sugerencias.length === 0 ? (
            <div className="card p-10 text-center">
              <CheckCircleIcon className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No hay movimientos pendientes de conciliar en esta cuenta.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {datos.sugerencias.map(s => (
                <div key={s.movimiento.id} className="card p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* Movimiento */}
                    <div className="min-w-[260px]">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${CONFIANZA[s.confianza]}`}>
                          {s.confianza === 'SIN_MATCH' ? 'SIN MATCH' : `CONFIANZA ${s.confianza}`}
                        </span>
                        <span className={`text-[10px] font-bold uppercase ${s.movimiento.sentido === 'COBRO' ? 'text-green-600' : 'text-red-500'}`}>
                          {s.movimiento.sentido}
                        </span>
                      </div>
                      <p className="font-medium text-gray-900 mt-1">{s.movimiento.descripcion}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(s.movimiento.fecha).toLocaleDateString('es-AR')}
                        {s.movimiento.referencia && ` · Ref: ${s.movimiento.referencia}`}
                      </p>
                      <p className={`text-lg font-bold mt-1 ${s.movimiento.sentido === 'COBRO' ? 'text-green-700' : 'text-red-600'}`}>
                        {s.movimiento.sentido === 'COBRO' ? '+' : '−'} {formatMoney(s.movimiento.importe)}
                      </p>
                    </div>

                    {/* Candidatos */}
                    <div className="flex-1 min-w-[300px] space-y-2">
                      {s.candidatos.length === 0 ? (
                        <p className="text-sm text-gray-400 italic py-3">
                          Sin documentos coincidentes (importe/fecha). Conciliálo manualmente desde Bancos.
                        </p>
                      ) : s.candidatos.map((c, i) => (
                        <div key={c.referenciaId} className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2 ${i === 0 ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200'}`}>
                          <div className="text-sm">
                            <p className="font-medium text-gray-800">{c.detalle.descripcion}</p>
                            <p className="text-xs text-gray-500">
                              {c.detalle.tercero}
                              {c.detalle.cuit && <span className="font-mono ml-1">({c.detalle.cuit})</span>}
                              {' · '}{new Date(c.detalle.fecha).toLocaleDateString('es-AR')}
                              {' · '}<span className="font-semibold">{formatMoney(c.detalle.importe)}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-mono text-gray-400">score {c.score}</span>
                            <button onClick={() => confirmar(s.movimiento.id, c)}
                              disabled={confirmando === s.movimiento.id}
                              className="btn-primary text-xs py-1.5">
                              <CheckCircleIcon className="w-3.5 h-3.5" /> Conciliar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
