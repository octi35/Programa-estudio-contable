import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { CalculatorIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import api from '../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const uid = params.get('uid');
  const token = params.get('token');

  const [verificando, setVerificando] = useState(true);
  const [valido, setValido] = useState(false);
  const [usuario, setUsuario] = useState(null);
  const [exito, setExito] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const passwordNuevo = watch('passwordNuevo');

  useEffect(() => {
    if (!uid || !token) { setVerificando(false); setValido(false); return; }
    api.get('/auth/reset-password/verify', { params: { uid, token }, silent: true })
      .then(r => {
        setValido(r.data.valido);
        if (r.data.valido) setUsuario({ nombre: r.data.nombre, email: r.data.email });
      })
      .catch(() => setValido(false))
      .finally(() => setVerificando(false));
  }, [uid, token]);

  const onSubmit = async ({ passwordNuevo }) => {
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { uid, token, passwordNuevo });
      setExito(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (_) { /* interceptor */ }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <CalculatorIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">EstudioPRO</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {verificando ? (
            <div className="text-center py-6">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-500 mt-3">Verificando enlace...</p>
            </div>
          ) : !valido ? (
            <div className="text-center space-y-4">
              <XCircleIcon className="w-12 h-12 text-red-500 mx-auto" />
              <h2 className="text-lg font-semibold text-gray-900">Enlace inválido o expirado</h2>
              <p className="text-sm text-gray-600">El enlace de recuperación no es válido o ya expiró. Solicitá uno nuevo.</p>
              <Link to="/forgot-password" className="btn-primary inline-flex">Solicitar nuevo enlace</Link>
            </div>
          ) : exito ? (
            <div className="text-center space-y-4">
              <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto" />
              <h2 className="text-lg font-semibold text-gray-900">Contraseña actualizada</h2>
              <p className="text-sm text-gray-600">Ya podés iniciar sesión con tu nueva contraseña. Te redirigimos en 3 segundos...</p>
              <Link to="/login" className="btn-primary inline-flex">Ir al login</Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Nueva contraseña</h2>
              <p className="text-sm text-gray-600 mb-6">
                Hola <b>{usuario?.nombre}</b>, definí tu nueva contraseña.
              </p>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="label">Nueva contraseña</label>
                  <input type="password" className="input" placeholder="Mínimo 8 caracteres"
                    {...register('passwordNuevo', {
                      required: 'Requerido',
                      minLength: { value: 8, message: 'Mínimo 8 caracteres' },
                    })} />
                  {errors.passwordNuevo && <p className="text-red-500 text-xs mt-1">{errors.passwordNuevo.message}</p>}
                </div>
                <div>
                  <label className="label">Repetir nueva contraseña</label>
                  <input type="password" className="input"
                    {...register('confirmar', {
                      required: 'Requerido',
                      validate: v => v === passwordNuevo || 'No coinciden',
                    })} />
                  {errors.confirmar && <p className="text-red-500 text-xs mt-1">{errors.confirmar.message}</p>}
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
                  {loading ? 'Guardando...' : 'Restablecer contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
