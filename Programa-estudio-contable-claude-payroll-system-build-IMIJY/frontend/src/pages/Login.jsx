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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Columna Izquierda - Formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-12 xl:p-24">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center lg:text-left">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-6 shadow-lg shadow-blue-500/30">
              <CalculatorIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bienvenido a EstudioPRO</h1>
            <p className="text-gray-500">Sistema Integral para Estudios Contables</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
              Iniciar Sesión
            </h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <div className="relative">
                  <input 
                    type="email" 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-gray-800"
                    placeholder="admin@estudiodemo.com"
                    {...register('email', { required: 'Email requerido' })} 
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1.5 ml-1">{errors.email.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                <div className="relative">
                  <input 
                    type="password" 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-gray-800" 
                    placeholder="••••••••"
                    {...register('password', { required: 'Contraseña requerida' })} 
                  />
                  {errors.password && <p className="text-red-500 text-xs mt-1.5 ml-1">{errors.password.message}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 mb-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span>Recordarme</span>
                </label>
                <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              <button 
                type="submit" 
                disabled={loading} 
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors focus:ring-4 focus:ring-blue-500/20 disabled:opacity-70 flex justify-center items-center shadow-lg shadow-blue-600/20"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Ingresando...
                  </span>
                ) : 'Ingresar al sistema'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <h3 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2">Credenciales de Demo</h3>
                <div className="flex flex-col gap-1 text-sm text-blue-700 font-medium">
                  <p>Email: <span className="text-gray-900 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-sm ml-1 select-all">admin@estudiodemo.com</span></p>
                  <p>Clave: <span className="text-gray-900 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-sm ml-1 select-all">Admin1234!</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Columna Derecha - Decoración */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#1e3a5f] to-blue-900 relative items-center justify-center p-12 overflow-hidden">
        {/* Elementos decorativos de fondo */}
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-blue-500/20 blur-3xl"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-cyan-500/20 blur-3xl"></div>
        
        <div className="relative z-10 max-w-xl text-center">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-3xl shadow-2xl">
            <h2 className="text-4xl font-bold text-white mb-6 leading-tight">
              Gestión contable<br />
              <span className="text-blue-300">inteligente y segura</span>
            </h2>
            <p className="text-blue-100 text-lg mb-8 leading-relaxed">
              Optimice el tiempo de su estudio con herramientas avanzadas de liquidación, facturación y gestión integral.
            </p>
            
            <div className="grid grid-cols-2 gap-4 text-left">
              {[
                'Liquidación ágil',
                'Contabilidad integrada',
                'Facturación electrónica',
                'Actualizaciones al día'
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></div>
                  <span className="text-blue-50 font-medium text-sm">{feature}</span>
                </div>
              ))}
            </div>
          </div>
          
          <p className="text-blue-200/60 mt-12 text-sm">
            &copy; {new Date().getFullYear()} EstudioPRO. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
