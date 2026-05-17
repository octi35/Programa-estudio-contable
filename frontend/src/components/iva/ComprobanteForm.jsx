import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, CameraIcon } from '@heroicons/react/24/outline';

const TIPOS = [
  'FACTURA_A','FACTURA_B','FACTURA_C',
  'NOTA_CREDITO_A','NOTA_CREDITO_B','NOTA_CREDITO_C',
  'NOTA_DEBITO_A','NOTA_DEBITO_B','NOTA_DEBITO_C',
  'RECIBO_A','RECIBO_B','RECIBO_C',
  'LIQUIDACION_A','LIQUIDACION_B',
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function ComprobanteForm({ comprobante, empresas, defaultEmpresaId, defaultTipo, defaultAnio, defaultMes, onSave, onCancel }) {
  const [proveedores, setProveedores] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    defaultValues: comprobante || {
      empresaId: defaultEmpresaId || '',
      tipoMovimiento: defaultTipo || 'COMPRA',
      tipoComprobante: 'FACTURA_A',
      puntoVenta: 1,
      numero: '',
      fecha: new Date().toISOString().split('T')[0],
      periodoFiscalAnio: defaultAnio || new Date().getFullYear(),
      periodoFiscalMes: defaultMes || new Date().getMonth() + 1,
      netoGravado21: 0, netoGravado105: 0, netoGravado27: 0,
      netoNoGravado: 0, exento: 0,
      iva21: 0, iva105: 0, iva27: 0,
      percepcionIVA: 0, percepcionIIBB: 0, retencion: 0,
      total: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const empresaId = watch('empresaId');
  const neto21 = parseFloat(watch('netoGravado21') || 0);
  const neto105 = parseFloat(watch('netoGravado105') || 0);
  const neto27 = parseFloat(watch('netoGravado27') || 0);
  const noGravado = parseFloat(watch('netoNoGravado') || 0);
  const exento = parseFloat(watch('exento') || 0);
  const percIVA = parseFloat(watch('percepcionIVA') || 0);
  const percIIBB = parseFloat(watch('percepcionIIBB') || 0);
  const ret = parseFloat(watch('retencion') || 0);

  // Calcula IVA automáticamente
  useEffect(() => {
    setValue('iva21', Math.round(neto21 * 0.21 * 100) / 100);
    setValue('iva105', Math.round(neto105 * 0.105 * 100) / 100);
    setValue('iva27', Math.round(neto27 * 0.27 * 100) / 100);
  }, [neto21, neto105, neto27]);

  const iva21 = parseFloat(watch('iva21') || 0);
  const iva105 = parseFloat(watch('iva105') || 0);
  const iva27 = parseFloat(watch('iva27') || 0);

  // Calcula total
  useEffect(() => {
    const total = neto21 + neto105 + neto27 + noGravado + exento + iva21 + iva105 + iva27 + percIVA + percIIBB - ret;
    setValue('total', Math.round(total * 100) / 100);
  }, [neto21, neto105, neto27, noGravado, exento, iva21, iva105, iva27, percIVA, percIIBB, ret]);

  useEffect(() => {
    if (!empresaId) return;
    api.get('/iva/proveedores', { params: { empresaId } })
      .then(({ data }) => setProveedores(data || []))
      .catch(() => {});
  }, [empresaId]);

  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      if (comprobante?.id) {
        await api.put(`/iva/comprobantes/${comprobante.id}`, data);
        toast.success('Comprobante actualizado');
      } else {
        await api.post('/iva/comprobantes', data);
        toast.success('Comprobante creado');
      }
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setGuardando(false); }
  };

  const inputClass = 'border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

  // ── OCR: extrae datos de PDF/imagen y pre-llena el formulario ──────────
  const [ocrLoading, setOcrLoading] = useState(false);
  const handleOcr = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOcrLoading(true);
    const toastId = toast.loading('Analizando comprobante con OCR...');
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const r = await api.post('/iva/comprobantes/ocr', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const { datos, requiereManual, provider, confianza, mensaje } = r.data;
      if (requiereManual) {
        toast(mensaje || 'OCR no configurado. Cargá manualmente.', { id: toastId, icon: '⚠️' });
        return;
      }
      // Pre-llenar campos detectados
      const mapeo = {
        fecha: 'fecha',
        tipo_comprobante: 'tipoComprobante',
        pto_venta: 'puntoVenta',
        numero: 'numero',
        cuit: '__cuit_proveedor', // se busca en el listado
        total: 'total',
        neto_21: 'netoGravado21',
        neto_105: 'netoGravado105',
        neto_27: 'netoGravado27',
        iva_21: 'iva21',
        iva_105: 'iva105',
        iva_27: 'iva27',
      };
      let setCount = 0;
      for (const [k, v] of Object.entries(datos)) {
        const campo = mapeo[k];
        if (!campo || v == null || v === '') continue;
        if (campo === '__cuit_proveedor') {
          const prov = proveedores.find(p => (p.cuit || '').replace(/[-\s]/g, '') === String(v).replace(/[-\s]/g, ''));
          if (prov) { setValue('proveedorClienteId', prov.id); setCount++; }
          continue;
        }
        setValue(campo, v);
        setCount++;
      }
      toast.success(`OCR (${provider}, confianza ${confianza}) · ${setCount} campos pre-llenados`, { id: toastId, duration: 5000 });
    } catch (_) {
      toast.dismiss(toastId);
    } finally { setOcrLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Subida con OCR */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between gap-3">
        <div className="text-xs text-purple-800">
          <p className="font-semibold flex items-center gap-1"><CameraIcon className="w-4 h-4" /> Carga rápida con OCR</p>
          <p className="text-purple-700">Subí el PDF o foto del comprobante y completamos los datos automáticamente.</p>
        </div>
        <label className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 cursor-pointer whitespace-nowrap">
          {ocrLoading ? 'Procesando...' : 'Subir archivo'}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleOcr} disabled={ocrLoading} className="hidden" />
        </label>
      </div>

      {/* Encabezado */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Empresa *</label>
          <select {...register('empresaId', { required: true })} className={inputClass}>
            <option value="">Seleccionar...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Tipo de movimiento *</label>
          <select {...register('tipoMovimiento')} className={inputClass}>
            <option value="COMPRA">Compra</option>
            <option value="VENTA">Venta</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Tipo de comprobante *</label>
          <select {...register('tipoComprobante')} className={inputClass}>
            {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Proveedor/Cliente</label>
          <select {...register('proveedorClienteId')} className={inputClass}>
            <option value="">Consumidor Final</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.razonSocial} ({p.cuit})</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Punto de venta *</label>
          <input type="number" {...register('puntoVenta', { required: true, min: 1 })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Número *</label>
          <input type="number" {...register('numero', { required: true, min: 1 })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Fecha *</label>
          <input type="date" {...register('fecha', { required: true })} className={inputClass} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelClass}>Mes fiscal</label>
            <select {...register('periodoFiscalMes', { valueAsNumber: true })} className={inputClass}>
              {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div className="w-24">
            <label className={labelClass}>Año fiscal</label>
            <input type="number" {...register('periodoFiscalAnio', { valueAsNumber: true })} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Importes */}
      <div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-medium text-gray-700 text-sm">Importes</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'netoGravado21', label: 'Neto Gravado 21%' },
            { key: 'iva21', label: 'IVA 21%' },
            { key: 'netoGravado105', label: 'Neto Gravado 10.5%' },
            { key: 'iva105', label: 'IVA 10.5%' },
            { key: 'netoGravado27', label: 'Neto Gravado 27%' },
            { key: 'iva27', label: 'IVA 27%' },
            { key: 'netoNoGravado', label: 'No Gravado' },
            { key: 'exento', label: 'Exento' },
            { key: 'percepcionIVA', label: 'Percep. IVA' },
            { key: 'percepcionIIBB', label: 'Percep. IIBB' },
            { key: 'retencion', label: 'Retención' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <input type="number" step="0.01" {...register(key, { valueAsNumber: true })}
                className={`${inputClass} bg-gray-50`} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-2 border-t">
          <label className="font-semibold text-gray-700 text-sm">Total:</label>
          <input type="number" step="0.01" {...register('total', { valueAsNumber: true })}
            className="border rounded-lg px-3 py-2 text-sm font-bold text-gray-900 w-48 bg-blue-50" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
          Cancelar
        </button>
        <button type="submit" disabled={guardando}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando...' : (comprobante ? 'Actualizar' : 'Crear Comprobante')}
        </button>
      </div>
    </form>
  );
}
