import React, { useState, useEffect, useRef } from 'react';
import { BuildingOfficeIcon, PhotoIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function PerfilEstudio() {
  const [estudio, setEstudio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const fileRef = useRef();
  const { register, handleSubmit, reset, formState: { isSubmitting, isDirty } } = useForm();

  const cargar = async () => {
    try {
      const { data } = await api.get('/estudio');
      setEstudio(data);
      reset(data);
    } catch { toast.error('Error al cargar datos del estudio'); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const guardar = async (data) => {
    try {
      const { data: updated } = await api.put('/estudio', data);
      setEstudio(updated);
      reset(updated);
      toast.success('Datos actualizados');
    } catch (e) { toast.error(e.response?.data?.error || 'Error al guardar'); }
  };

  const subirLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('El archivo no puede superar 2 MB'); return; }

    setSubiendoLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const { data } = await api.post('/estudio/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEstudio(prev => ({ ...prev, logo: data.logo }));
      toast.success('Logo actualizado');
    } catch (e) { toast.error(e.response?.data?.error || 'Error al subir logo'); }
    finally { setSubiendoLogo(false); }
  };

  if (loading) return (
    <div className="flex justify-center p-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Perfil del Estudio</h1>
        <p className="text-gray-500 text-sm">Datos del estudio contable y configuración general</p>
      </div>

      {/* Logo */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Logo del estudio</h2>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden flex-shrink-0">
            {estudio?.logo ? (
              <img src={`/uploads/${estudio.logo}`} alt="Logo" className="w-full h-full object-contain p-2" />
            ) : (
              <PhotoIcon className="w-10 h-10 text-gray-300" />
            )}
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">El logo aparece en los recibos de sueldo en PDF.</p>
            <p className="text-xs text-gray-400 mb-3">Formato: JPG, PNG o SVG · Máximo 2 MB · Recomendado: 200×80 px</p>
            <button onClick={() => fileRef.current?.click()} disabled={subiendoLogo}
              className="btn-secondary text-sm flex items-center gap-2">
              <ArrowUpTrayIcon className="w-4 h-4" />
              {subiendoLogo ? 'Subiendo...' : 'Subir logo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={subirLogo} />
          </div>
        </div>
      </div>

      {/* Datos del estudio */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Datos del estudio</h2>
        <form onSubmit={handleSubmit(guardar)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Razón social *</label>
              <input {...register('razonSocial', { required: true })} className="input" />
            </div>
            <div>
              <label className="label">CUIT *</label>
              <input {...register('cuit', { required: true })} className="input" placeholder="XX-XXXXXXXX-X" />
            </div>
            <div>
              <label className="label">Matrícula profesional</label>
              <input {...register('matricula')} className="input" placeholder="CP 12345" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Dirección</label>
              <input {...register('direccion')} className="input" placeholder="Av. Corrientes 1234, Piso 3, CABA" />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input {...register('telefono')} className="input" placeholder="011-4321-5678" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" {...register('email')} className="input" placeholder="estudio@ejemplo.com" />
            </div>
          </div>
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button type="submit" disabled={isSubmitting || !isDirty} className="btn-primary">
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>

      {/* Info de la cuenta */}
      <div className="card p-6 bg-gray-50">
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <BuildingOfficeIcon className="w-5 h-5 text-gray-500" /> Información del sistema
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><p className="text-gray-500 text-xs">ID del estudio</p><p className="font-mono text-gray-700 text-xs truncate">{estudio?.id}</p></div>
          <div><p className="text-gray-500 text-xs">CUIT registrado</p><p className="font-medium text-gray-900">{estudio?.cuit}</p></div>
          <div><p className="text-gray-500 text-xs">Versión del sistema</p><p className="font-medium text-gray-900">EstudioPRO 1.0</p></div>
        </div>
      </div>
    </div>
  );
}
