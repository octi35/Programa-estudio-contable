import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '../context/AuthContext';
import { CalculatorIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
      toast.success('Sesión iniciada correctamente');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <CalculatorIcon className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">EstudioPRO</h1>
          <p className="text-blue-300 mt-1">Sistema de Liquidación de Sueldos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Iniciar Sesión</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="admin@estudiodemo.com"
                {...register('email', { required: 'Email requerido' })} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Contraseña</label>
              <input type="password" className="input" placeholder="••••••••"
                {...register('password', { required: 'Contraseña requerida' })} />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Ingresando...
                </span>
              ) : 'Ingresar'}
            </button>

            <div className="text-center">
              <Link to="/forgot-password" className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>

          <div className="mt-6 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <strong>Demo:</strong> admin@estudiodemo.com / Admin1234!
          </div>
        </div>

        <p className="text-center text-blue-300 text-xs mt-6">
          Sistema de gestión para estudios contables argentinos
        </p>
      </div>
    </div>
  );
}
