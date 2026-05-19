import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CalculatorIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import api from '../api/client';

export default function ForgotPassword() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const onSubmit = async ({ email }) => {
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email }, { silent: true });
      setEnviado(true);
    } catch (_) {
      // Igual mostramos OK para no filtrar existencia
      setEnviado(true);
    } finally { setLoading(false); }
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Recuperar contraseña</h2>

          {enviado ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <EnvelopeIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-green-800">
                    <p className="font-semibold mb-1">Revisá tu casilla</p>
                    <p>Si el email está registrado en EstudioPRO, te enviamos un enlace para restablecer tu contraseña. El enlace expira en 60 minutos.</p>
                  </div>
                </div>
              </div>
              <Link to="/login" className="block text-center text-sm text-blue-600 hover:text-blue-800">
                ← Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <p className="text-gray-600 text-sm mb-6">
                Ingresá tu email y te enviaremos un enlace para definir una nueva contraseña.
              </p>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input" placeholder="tu@email.com"
                    {...register('email', { required: 'Email requerido' })} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>

                <div className="text-center pt-2">
                  <Link to="/login" className="text-xs text-blue-600 hover:text-blue-800">
                    ← Volver al inicio de sesión
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
