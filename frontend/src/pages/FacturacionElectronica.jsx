import React, { useState, useEffect } from 'react';
import {
  DocumentTextIcon, PlusIcon, ArrowDownTrayIcon, CogIcon,
  CheckCircleIcon, ExclamationTriangleIcon, MagnifyingGlassIcon,
  BuildingOfficeIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const fmtARS = (n) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

const TIPOS = [
  { id: 1, nombre: 'Factura A' }, { id: 6, nombre: 'Factura B' }, { id: 11, nombre: 'Factura C' },
  { id: 3, nombre: 'Nota Crédito A' }, { id: 8, nombre: 'Nota Crédito B' }, { id: 13, nombre: 'Nota Crédito C' },
  { id: 2, nombre: 'Nota Débito A' }, { id: 7, nombre: 'Nota Débito B' }, { id: 12, nombre: 'Nota Débito C' },
];
const ALICUOTAS = [{ v: 21, l: '21%' }, { v: 10.5, l: '10.5%' }, { v: 27, l: '27%' }, { v: 0, l: 'Exento' }];

function ConfigModal({ empresas = [], onClose }) {
  const [config, setConfig] = useState({ ambiente: 'SIMULADO', ptoVta: 1, certificado: '', clavePrivada: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Multi-CUIT: certificado propio por empresa
  const [empSel, setEmpSel] = useState('');
  const [empCfg, setEmpCfg] = useState(null);
  const [empForm, setEmpForm] = useState({ ptoVta: 1, certificado: '', clavePrivada: '', condicionIVA: '' });
  const [savingEmp, setSavingEmp] = useState(false);

  useEffect(() => {
    if (!empSel) { setEmpCfg(null); return; }
    api.get(`/facturacion/config-empresa/${empSel}`).then(r => {
      setEmpCfg(r.data);
      setEmpForm({ ptoVta: r.data.ptoVta || 1, certificado: '', clavePrivada: '', condicionIVA: r.data.condicionIVA || '' });
    }).catch(() => setEmpCfg(null));
  }, [empSel]);

  const guardarEmpresa = async () => {
    setSavingEmp(true);
    try {
      await api.put(`/facturacion/config-empresa/${empSel}`, empForm);
      toast.success('Configuración de la empresa guardada');
      const r = await api.get(`/facturacion/config-empresa/${empSel}`);
      setEmpCfg(r.data);
      setEmpForm(f => ({ ...f, certificado: '', clavePrivada: '' }));
    } catch (e) { toast.error(e.response?.data?.error || 'Error al guardar'); }
    finally { setSavingEmp(false); }
  };

  useEffect(() => {
    api.get('/facturacion/config').then(r => {
      setConfig(c => ({ ...c, ...r.data, certificado: '', clavePrivada: '' }));
    }).finally(() => setLoading(false));
  }, []);

  const guardar = async () => {
    setSaving(true);
    try {
      await api.put('/facturacion/config', config);
      toast.success('Configuración AFIP guardada');
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <strong>Modo SIMULADO</strong> — Genera facturas de prueba sin conectarse a AFIP. Para producción se requiere certificado digital emitido por AFIP.
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ambiente AFIP</label>
        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={config.ambiente} onChange={e => setConfig(c => ({ ...c, ambiente: e.target.value }))}>
          <option value="SIMULADO">SIMULADO (sin AFIP)</option>
          <option value="HOMOLOGACION">HOMOLOGACIÓN (pruebas AFIP)</option>
          <option value="PRODUCCION">PRODUCCIÓN (real)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Punto de Venta</label>
        <input type="number" min={1} max={9999} className="w-full border rounded-lg px-3 py-2 text-sm"
          value={config.ptoVta} onChange={e => setConfig(c => ({ ...c, ptoVta: e.target.value }))} />
      </div>

      {config.ambiente !== 'SIMULADO' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Certificado AFIP (.crt — pegar contenido)</label>
            <textarea rows={4} className="w-full border rounded-lg px-3 py-2 text-xs font-mono"
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              value={config.certificado} onChange={e => setConfig(c => ({ ...c, certificado: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Clave Privada (.key — pegar contenido)</label>
            <textarea rows={4} className="w-full border rounded-lg px-3 py-2 text-xs font-mono"
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              value={config.clavePrivada} onChange={e => setConfig(c => ({ ...c, clavePrivada: e.target.value }))} />
          </div>
        </>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t">
        <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button onClick={guardar} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>

      {/* Multi-CUIT: certificado por empresa */}
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Multi-CUIT — certificado por empresa</h3>
        <p className="text-xs text-gray-500">
          Si una empresa tiene su propio certificado de ARCA, sus comprobantes se emiten con el CUIT de la empresa.
          Sin certificado propio, se usa el del estudio.
        </p>
        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={empSel} onChange={e => setEmpSel(e.target.value)}>
          <option value="">Seleccionar empresa...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>

        {empCfg && (
          <div className="space-y-3 bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600">
              CUIT: <strong>{empCfg.cuit}</strong> ·{' '}
              {empCfg.tieneCertificado
                ? <span className="text-green-600 font-medium">✓ Certificado propio cargado (emite con su CUIT)</span>
                : <span className="text-amber-600">Sin certificado propio (emite con el CUIT del estudio)</span>}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Punto de venta</label>
                <input type="number" min={1} max={9999} className="w-full border rounded px-2 py-1.5 text-sm"
                  value={empForm.ptoVta} onChange={e => setEmpForm(f => ({ ...f, ptoVta: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Condición IVA (emisor)</label>
                <select className="w-full border rounded px-2 py-1.5 text-sm" value={empForm.condicionIVA}
                  onChange={e => setEmpForm(f => ({ ...f, condicionIVA: e.target.value }))}>
                  <option value="">—</option>
                  <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                  <option value="MONOTRIBUTISTA">Monotributista</option>
                  <option value="EXENTO">Exento</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Certificado (.crt — pegar contenido)</label>
              <textarea rows={3} className="w-full border rounded px-2 py-1.5 text-xs font-mono"
                placeholder="-----BEGIN CERTIFICATE-----"
                value={empForm.certificado} onChange={e => setEmpForm(f => ({ ...f, certificado: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Clave privada (.key — pegar contenido)</label>
              <textarea rows={3} className="w-full border rounded px-2 py-1.5 text-xs font-mono"
                placeholder="-----BEGIN PRIVATE KEY-----"
                value={empForm.clavePrivada} onChange={e => setEmpForm(f => ({ ...f, clavePrivada: e.target.value }))} />
            </div>
            <div className="flex justify-between items-center">
              {empCfg.tieneCertificado && (
                <button onClick={async () => { try { await api.put(`/facturacion/config-empresa/${empSel}`, { quitarCertificado: true }); toast.success('Certificado quitado'); setEmpCfg(c => ({ ...c, tieneCertificado: false })); } catch (e) { toast.error('Error al quitar'); } }}
                  className="text-xs text-red-500 hover:underline">Quitar certificado propio</button>
              )}
              <button onClick={guardarEmpresa} disabled={savingEmp}
                className="ml-auto px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {savingEmp ? 'Guardando...' : 'Guardar empresa'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmitirModal({ empresas, initial, onClose, onCreated }) {
  const [form, setForm] = useState({
    empresaId: '', tipoComprobante: 6,
    receptorRazonSocial: '', receptorCuit: '', receptorDomicilio: '', receptorCondicionIVA: '',
    items: [{ descripcion: '', cantidad: 1, precioUnit: '', alicuotaIva: 21 }],
    observaciones: '',
    ...(initial || {}),
  });
  const [loading, setLoading] = useState(false);
  const [buscandoPadron, setBuscandoPadron] = useState(false);
  const [proximo, setProximo] = useState(null);
  const [originales, setOriginales] = useState([]);

  // NC/ND: cargar facturas originales asociables (CbtesAsoc exigido por ARCA)
  const esNota = [2, 3, 7, 8, 12, 13].includes(Number(form.tipoComprobante));
  useEffect(() => {
    if (esNota && form.empresaId) {
      api.get(`/facturacion/originales?empresaId=${form.empresaId}&tipoNota=${form.tipoComprobante}`)
        .then(r => setOriginales(r.data.data || []))
        .catch(() => setOriginales([]));
    } else {
      setOriginales([]);
      setForm(f => ({ ...f, comprobanteAsociadoId: '' }));
    }
  }, [esNota, form.empresaId, form.tipoComprobante]);

  // Consulta el padrón de ARCA por CUIT y autocompleta el receptor
  const buscarEnPadron = async () => {
    const cuit = form.receptorCuit.replace(/[^\d]/g, '');
    if (cuit.length !== 11) { toast.error('Ingresá un CUIT válido de 11 dígitos'); return; }
    setBuscandoPadron(true);
    try {
      const r = await api.get(`/afip/padron/${cuit}`);
      const d = r.data;
      setForm(f => ({
        ...f,
        receptorRazonSocial: d.razonSocial || f.receptorRazonSocial,
        receptorDomicilio: d.domicilio || f.receptorDomicilio,
        receptorCondicionIVA: d.condicionIVA || f.receptorCondicionIVA,
        // RI recibe Factura A; monotributista/CF/exento recibe B (si no es NC/ND ya elegida)
        tipoComprobante: [1, 6].includes(f.tipoComprobante)
          ? (d.condicionIVA === 'RESPONSABLE_INSCRIPTO' ? 1 : 6)
          : f.tipoComprobante,
      }));
      toast.success(`Encontrado en ARCA: ${d.razonSocial}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'No se pudo consultar el padrón de ARCA');
    } finally { setBuscandoPadron(false); }
  };

  useEffect(() => {
    if (form.empresaId && form.tipoComprobante) {
      api.get(`/facturacion/ultimo-nro?tipoComprobante=${form.tipoComprobante}`).then(r => setProximo(r.data)).catch(() => {});
    }
  }, [form.empresaId, form.tipoComprobante]);

  const setItem = (i, field, val) => {
    setForm(f => { const items = [...f.items]; items[i] = { ...items[i], [field]: val }; return { ...f, items }; });
  };
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { descripcion: '', cantidad: 1, precioUnit: '', alicuotaIva: 21 }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const neto = form.items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0), 0);
  const iva = form.items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0) * (Number(it.alicuotaIva) / 100), 0);
  const total = neto + iva;

  const emitir = async () => {
    if (!form.empresaId) { toast.error('Seleccioná una empresa'); return; }
    if (!form.items.every(it => it.descripcion && it.precioUnit > 0)) { toast.error('Completá todos los ítems'); return; }
    setLoading(true);
    try {
      const res = await api.post('/facturacion/emitir', {
        ...form,
        items: form.items.map(it => ({ ...it, cantidad: Number(it.cantidad), precioUnit: Number(it.precioUnit), alicuotaIva: Number(it.alicuotaIva) })),
      });
      if (res.data.encolado) {
        toast(res.data.mensaje || 'ARCA no responde — comprobante en cola, se emitirá automáticamente', { icon: '⏳', duration: 6000 });
      } else {
        toast.success(`${res.data.tipoDescripcion} N° ${res.data.nroComprobante} emitida${res.data.simulado ? ' (SIMULADO)' : ''}`);
      }
      onCreated(res.data);
      onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al emitir'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empresa emisora</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.empresaId} onChange={e => setForm(f => ({ ...f, empresaId: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de comprobante</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.tipoComprobante} onChange={e => setForm(f => ({ ...f, tipoComprobante: Number(e.target.value) }))}>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
      </div>

      {proximo && (
        <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
          Próximo número: <strong>{String(proximo.proximo).padStart(8, '0')}</strong>
          {proximo.simulado && <span className="ml-2 text-amber-600">(modo simulado)</span>}
        </div>
      )}

      {esNota && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Comprobante original asociado <span className="text-red-500">*</span>
            <span className="text-gray-400 font-normal ml-1">(exigido por ARCA para NC/ND)</span>
          </label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.comprobanteAsociadoId || ''}
            onChange={e => setForm(f => ({ ...f, comprobanteAsociadoId: e.target.value }))}>
            <option value="">Seleccionar factura original...</option>
            {originales.map(o => (
              <option key={o.id} value={o.id}>
                {String(o.ptoVta).padStart(4, '0')}-{String(o.nroComprobante).padStart(8, '0')} · {new Date(o.fechaEmision).toLocaleDateString('es-AR')} · {o.receptorRazonSocial || 'CF'} · {fmtARS(o.total)}
              </option>
            ))}
          </select>
          {form.empresaId && originales.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">No hay facturas emitidas de esa letra para asociar.</p>
          )}
        </div>
      )}

      <div className="border-t pt-3">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">Receptor</h3>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">CUIT/DNI</label>
            <div className="flex gap-1">
              <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="20-12345678-9" value={form.receptorCuit} onChange={e => setForm(f => ({ ...f, receptorCuit: e.target.value }))} />
              <button onClick={buscarEnPadron} disabled={buscandoPadron} title="Buscar en padrón ARCA"
                className="px-2 border rounded bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 flex-shrink-0">
                {buscandoPadron
                  ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  : <MagnifyingGlassIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Razón Social / Nombre</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" value={form.receptorRazonSocial} onChange={e => setForm(f => ({ ...f, receptorRazonSocial: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Domicilio</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" value={form.receptorDomicilio} onChange={e => setForm(f => ({ ...f, receptorDomicilio: e.target.value }))} />
          </div>
        </div>
        {form.receptorCondicionIVA && (
          <p className="text-xs text-gray-500 mt-1.5">
            Condición IVA (padrón ARCA): <strong>{form.receptorCondicionIVA.replace(/_/g, ' ')}</strong>
          </p>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-700">Ítems</h3>
          <button onClick={addItem} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-3 h-3" /> Agregar ítem</button>
        </div>
        <div className="space-y-2">
          {form.items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5 items-end">
              <div className="col-span-5">
                {i === 0 && <label className="block text-xs text-gray-500 mb-0.5">Descripción</label>}
                <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Servicio / producto" value={it.descripcion} onChange={e => setItem(i, 'descripcion', e.target.value)} />
              </div>
              <div className="col-span-1">
                {i === 0 && <label className="block text-xs text-gray-500 mb-0.5">Cant.</label>}
                <input type="number" min={0.01} step={0.01} className="w-full border rounded px-2 py-1.5 text-sm" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} />
              </div>
              <div className="col-span-3">
                {i === 0 && <label className="block text-xs text-gray-500 mb-0.5">Precio unit.</label>}
                <input type="number" min={0} step={0.01} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="0.00" value={it.precioUnit} onChange={e => setItem(i, 'precioUnit', e.target.value)} />
              </div>
              <div className="col-span-2">
                {i === 0 && <label className="block text-xs text-gray-500 mb-0.5">IVA</label>}
                <select className="w-full border rounded px-2 py-1.5 text-sm" value={it.alicuotaIva} onChange={e => setItem(i, 'alicuotaIva', Number(e.target.value))}>
                  {ALICUOTAS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                </select>
              </div>
              <div className="col-span-1 flex justify-center">
                {form.items.length > 1 && <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><XMarkIcon className="w-4 h-4" /></button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
        <div className="flex justify-between text-gray-600"><span>Subtotal neto:</span><span>{fmtARS(neto)}</span></div>
        <div className="flex justify-between text-gray-600"><span>IVA:</span><span>{fmtARS(iva)}</span></div>
        <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-1 mt-1"><span>TOTAL:</span><span>{fmtARS(total)}</span></div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones (opcional)</label>
        <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t">
        <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
        <button onClick={emitir} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Emitiendo...' : 'Emitir comprobante'}
        </button>
      </div>
    </div>
  );
}

// Importación masiva: un comprobante por fila del Excel/CSV
function ImportarModal({ empresas, onClose, onDone }) {
  const [empresaId, setEmpresaId] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const importar = async () => {
    if (!empresaId) { toast.error('Seleccioná la empresa emisora'); return; }
    if (!archivo) { toast.error('Seleccioná un archivo Excel o CSV'); return; }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('empresaId', empresaId);
      const r = await api.post('/facturacion/importar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResultado(r.data);
      if (r.data.emitidos > 0) toast.success(`${r.data.emitidos} comprobante(s) emitido(s)`);
      if (r.data.encolados > 0) toast(`${r.data.encolados} en cola (ARCA sin responder)`, { icon: '⏳' });
      onDone();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al importar'); }
    finally { setSubiendo(false); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
        <strong>Formato esperado</strong> (primera fila = encabezados, una factura por fila):<br />
        <code className="block mt-1 bg-white rounded px-2 py-1 font-mono">cuit | razonSocial | tipo (A/B/C) | descripcion | cantidad | precioUnit | alicuotaIva</code>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Empresa emisora</label>
        <select className="w-full border rounded-lg px-3 py-2 text-sm" value={empresaId} onChange={e => setEmpresaId(e.target.value)}>
          <option value="">Seleccionar...</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Archivo (.xlsx o .csv — máx. 200 filas)</label>
        <input type="file" accept=".xlsx,.csv" className="w-full text-sm"
          onChange={e => setArchivo(e.target.files?.[0] || null)} />
      </div>

      {resultado && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
          <p><strong>{resultado.emitidos}</strong> emitidos · <strong>{resultado.encolados}</strong> en cola · <strong>{resultado.errores.length}</strong> con error (de {resultado.total})</p>
          {resultado.errores.slice(0, 5).map((e, i) => (
            <p key={i} className="text-xs text-red-600">Fila {e.fila}: {e.error}</p>
          ))}
          {resultado.errores.length > 5 && <p className="text-xs text-gray-500">…y {resultado.errores.length - 5} errores más</p>}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t">
        <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cerrar</button>
        <button onClick={importar} disabled={subiendo} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {subiendo ? 'Importando...' : 'Importar y emitir'}
        </button>
      </div>
    </div>
  );
}

export default function FacturacionElectronica() {
  const [comprobantes, setComprobantes] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [config, setConfig] = useState(null);
  const [cola, setCola] = useState([]);
  const [procesandoCola, setProcesandoCola] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [showEmitir, setShowEmitir] = useState(false);
  const [showImportar, setShowImportar] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [frase, setFrase] = useState('');
  const [interpretando, setInterpretando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [filtro, setFiltro] = useState({ empresaId: '', tipo: '' });

  const cargar = () => {
    const params = new URLSearchParams();
    if (filtro.empresaId) params.append('empresaId', filtro.empresaId);
    if (filtro.tipo) params.append('tipo', filtro.tipo);
    Promise.all([
      api.get(`/facturacion/comprobantes?${params}`),
      api.get('/empresas'),
      api.get('/facturacion/config'),
      api.get('/facturacion/cola'),
    ]).then(([comp, emp, cfg, q]) => {
      setComprobantes(comp.data.data || []);
      setEmpresas(emp.data.data || emp.data || []);
      setConfig(cfg.data);
      setCola(q.data.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [filtro]);

  // Interpreta la frase con IA y abre el formulario precargado
  const interpretarFrase = async (texto) => {
    const t = (texto ?? frase).trim();
    if (t.length < 5) { toast.error('Contame qué querés facturar, ej: "50 mil de honorarios de mayo a 30-98765432-1"'); return; }
    setInterpretando(true);
    try {
      const r = await api.post('/facturacion/interpretar', { texto: t });
      const d = r.data;
      setBorrador({
        empresaId: empresas[0]?.id || '',
        tipoComprobante: d.tipoComprobante || 6,
        receptorCuit: d.cuit || '',
        receptorRazonSocial: d.razonSocial || '',
        items: d.items.map(it => ({
          descripcion: it.descripcion || 'Servicio',
          cantidad: Number(it.cantidad) || 1,
          precioUnit: Number(it.precioUnit) || '',
          alicuotaIva: it.alicuotaIva === undefined ? 21 : Number(it.alicuotaIva),
        })),
        observaciones: d.observaciones || '',
      });
      setShowEmitir(true);
      setFrase('');
    } catch (e) { toast.error(e.response?.data?.error || 'No pude interpretar la frase'); }
    finally { setInterpretando(false); }
  };

  // Dictado por voz (Web Speech API, es-AR) — estilo "nota de voz" de Facturitas
  const dictar = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error('Tu navegador no soporta dictado por voz (probá Chrome)'); return; }
    const rec = new SR();
    rec.lang = 'es-AR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setGrabando(true);
    rec.onresult = (ev) => {
      const texto = ev.results[0][0].transcript;
      setFrase(texto);
      setGrabando(false);
      interpretarFrase(texto);
    };
    rec.onerror = () => { setGrabando(false); toast.error('No se pudo captar el audio'); };
    rec.onend = () => setGrabando(false);
    rec.start();
  };

  const procesarCola = async () => {
    setProcesandoCola(true);
    try {
      const r = await api.post('/facturacion/cola/procesar');
      if (r.data.emitidos > 0) toast.success(`${r.data.emitidos} comprobante(s) emitido(s) con CAE`);
      if (r.data.enCola > 0) toast(`ARCA sigue sin responder — ${r.data.enCola} comprobante(s) siguen en cola`, { icon: '⏳' });
      if (r.data.rechazados > 0) toast.error(`${r.data.rechazados} comprobante(s) rechazado(s) por ARCA`);
      cargar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al procesar la cola'); }
    finally { setProcesandoCola(false); }
  };

  const descargarPDF = async (id, nro) => {
    try {
      const res = await api.get(`/facturacion/comprobantes/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `comprobante_${nro}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Error al generar PDF'); }
  };

  const ambienteColor = { SIMULADO: 'amber', HOMOLOGACION: 'blue', PRODUCCION: 'green' }[config?.ambiente] || 'gray';
  const ambienteLabel = { SIMULADO: 'Simulado', HOMOLOGACION: 'Homologación AFIP', PRODUCCION: 'Producción AFIP' }[config?.ambiente] || '—';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación Electrónica AFIP</h1>
          <p className="text-gray-500 text-sm mt-1">Emisión de comprobantes electrónicos con CAE</p>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium bg-${ambienteColor}-100 text-${ambienteColor}-700 border border-${ambienteColor}-200`}>
              {ambienteLabel}
            </span>
          )}
          <button onClick={() => setShowConfig(true)} className="btn-secondary flex items-center gap-1.5 text-sm">
            <CogIcon className="w-4 h-4" /> Configuración AFIP
          </button>
          <button onClick={() => setShowImportar(true)} className="btn-secondary flex items-center gap-1.5 text-sm">
            <ArrowDownTrayIcon className="w-4 h-4 rotate-180" /> Importar Excel/CSV
          </button>
          <button onClick={() => { setBorrador(null); setShowEmitir(true); }} className="btn-primary flex items-center gap-1.5 text-sm">
            <PlusIcon className="w-4 h-4" /> Emitir comprobante
          </button>
        </div>
      </div>

      {/* Factura rápida por frase o voz (IA) */}
      <div className="card p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
        <label className="block text-xs font-semibold text-blue-900 mb-1.5">⚡ Factura rápida — escribí o dictá qué querés facturar</label>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white"
            placeholder='Ej: "Facturale 150 mil más IVA de honorarios de mayo a 30-98765432-1"'
            value={frase}
            onChange={e => setFrase(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && interpretarFrase()}
          />
          <button onClick={dictar} disabled={grabando || interpretando} title="Dictar por voz"
            className={`px-3 border rounded-lg text-sm flex-shrink-0 ${grabando ? 'bg-red-100 border-red-300 text-red-600 animate-pulse' : 'bg-white border-blue-200 text-blue-600 hover:bg-blue-50'}`}>
            {grabando ? '● Grabando…' : '🎤'}
          </button>
          <button onClick={() => interpretarFrase()} disabled={interpretando}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex-shrink-0">
            {interpretando ? 'Interpretando…' : 'Generar factura'}
          </button>
        </div>
      </div>

      {/* Cola pendiente de CAE (ARCA caído al emitir) */}
      {cola.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <strong>{cola.length} comprobante{cola.length > 1 ? 's' : ''} en cola sin CAE</strong> — ARCA no respondió al emitirlos.
              Se reintentan automáticamente cada 10 minutos.
              <span className="block text-xs mt-1 text-red-600">
                {cola.slice(0, 3).map(c => `${c.empresa?.razonSocial || ''} ${fmtARS(c.total)}`).join(' · ')}
                {cola.length > 3 ? ` · y ${cola.length - 3} más` : ''}
              </span>
            </div>
          </div>
          <button onClick={procesarCola} disabled={procesandoCola}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex-shrink-0">
            {procesandoCola ? 'Reintentando...' : 'Reintentar ahora'}
          </button>
        </div>
      )}

      {/* Info banner */}
      {config?.ambiente === 'SIMULADO' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>Modo Simulado activo</strong> — Los comprobantes se generan localmente sin conectarse a AFIP.
            Para emitir facturas válidas, configure el ambiente en <strong>Homologación</strong> (pruebas) o <strong>Producción</strong> con su certificado digital AFIP.
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">Empresa</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={filtro.empresaId} onChange={e => setFiltro(f => ({ ...f, empresaId: e.target.value }))}>
            <option value="">Todas las empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div className="w-52">
          <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}>
            <option value="">Todos</option>
            {TIPOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : comprobantes.length === 0 ? (
          <div className="p-12 text-center">
            <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay comprobantes emitidos</p>
            <p className="text-gray-400 text-sm mt-1">Hacé clic en "Emitir comprobante" para crear el primero</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Fecha','Tipo','N° Comprobante','Empresa','Receptor','Neto','IVA','Total','CAE','Acciones'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comprobantes.map(comp => {
                  const tipoNombre = TIPOS.find(t => t.id === comp.tipoComprobante)?.nombre || `Tipo ${comp.tipoComprobante}`;
                  const nroFmt = `${String(comp.ptoVta).padStart(4,'0')}-${String(comp.nroComprobante).padStart(8,'0')}`;
                  return (
                    <tr key={comp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{new Date(comp.fechaEmision).toLocaleDateString('es-AR')}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{tipoNombre}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{nroFmt}</td>
                      <td className="px-4 py-3 text-gray-700 truncate max-w-[140px]">{comp.empresa?.razonSocial}</td>
                      <td className="px-4 py-3 text-gray-600 truncate max-w-[140px]">{comp.receptorRazonSocial || 'Consumidor Final'}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtARS(comp.neto)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtARS(comp.iva)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">{fmtARS(comp.total)}</td>
                      <td className="px-4 py-3">
                        {comp.estado === 'PENDIENTE_CAE' ? (
                          <span className="text-xs text-red-600 font-medium">⏳ En cola</span>
                        ) : comp.estado === 'RECHAZADO' ? (
                          <span className="text-xs text-red-600 font-medium" title={comp.observaciones}>✗ Rechazado</span>
                        ) : comp.simulado ? (
                          <span className="text-xs text-amber-600">Simulado</span>
                        ) : (
                          <span className="text-xs font-mono text-green-700 flex items-center gap-1">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            {comp.cae?.slice(-6)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => descargarPDF(comp.id, nroFmt)} className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50" title="Descargar PDF">
                          <ArrowDownTrayIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showConfig && (
        <Modal onClose={() => setShowConfig(false)} title="Configuración AFIP — Facturación Electrónica">
          <ConfigModal empresas={empresas} onClose={() => { setShowConfig(false); cargar(); }} />
        </Modal>
      )}

      {showEmitir && (
        <Modal onClose={() => { setShowEmitir(false); setBorrador(null); }} title="Emitir Comprobante Electrónico">
          <EmitirModal empresas={empresas} initial={borrador} onClose={() => { setShowEmitir(false); setBorrador(null); }} onCreated={() => cargar()} />
        </Modal>
      )}

      {showImportar && (
        <Modal onClose={() => setShowImportar(false)} title="Importación Masiva de Facturas (Excel/CSV)">
          <ImportarModal empresas={empresas} onClose={() => setShowImportar(false)} onDone={() => cargar()} />
        </Modal>
      )}
    </div>
  );
}
