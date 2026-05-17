import React, { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, UserMinusIcon, KeyIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';
import { confirm } from '../components/confirm';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { value: 'ADMIN', label: 'Administrador', desc: 'Acceso total al sistema' },
  { value: 'CONTADOR', label: 'Contador', desc: 'Puede liquidar y contabilizar' },
  { value: 'OPERADOR', label: 'Operador', desc: 'Solo ingreso de datos' },
];

const rolBadge = { ADMIN: 'badge-red', CONTADOR: 'badge-blue', OPERADOR: 'badge-gray' };

function UsuarioForm({ usuario, onSave, onCancel }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: usuario || { rol: 'CONTADOR', activo: true },
  });

  const onSubmit = async (data) => {
    try {
      if (!data.password) delete data.password;
      if (usuario?.id) { await api.put(`/usuarios/${usuario.id}`, data); toast.success('Usuario actualizado'); }
      else { await api.post('/usuarios', data); toast.success('Usuario creado'); }
      onSave();
    } catch (e) { toast.error(e.response?.data?.error || 'Error al guardar'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nombre *</label>
          <input {...register('nombre', { required: true })} className="input" placeholder="Juan García" />
          {errors.nombre && <p className="text-red-500 text-xs mt-1">Requerido</p>}
        </div>
        <div>
          <label className="label">Email *</label>
          <input type="email" {...register('email', { required: true })} className="input" placeholder="juan@estudio.com" />
          {errors.email && <p className="text-red-500 text-xs mt-1">Email inválido</p>}
        </div>
        <div>
          <label className="label">{usuario ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
          <input type="password" {...register('password', { required: !usuario, minLength: 8 })} className="input" placeholder="Mínimo 8 caracteres" />
          {errors.password && <p className="text-red-500 text-xs mt-1">Mínimo 8 caracteres</p>}
        </div>
        <div>
          <label className="label">Rol *</label>
          <select {...register('rol', { required: true })} className="input">
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {usuario && (
          <div className="flex items-center gap-2 col-span-2">
            <input type="checkbox" {...register('activo')} id="activo" className="rounded" />
            <label htmlFor="activo" className="text-sm text-gray-700">Usuario activo</label>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Guardando...' : (usuario ? 'Actualizar' : 'Crear usuario')}
        </button>
      </div>
    </form>
  );
}

export default function Usuarios() {
  const { usuario: usuarioActual } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { tipo: 'form'|'password', usuario }
  const [passwordData, setPasswordData] = useState({ nuevo: '', confirmar: '' });

  const cargar = () => {
    setLoading(true);
    api.get('/usuarios')
      .then(r => setUsuarios(r.data))
      .catch(() => toast.error('Sin permisos para ver usuarios'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const desactivar = async (u) => {
    if (!await confirm({
      title: `Desactivar usuario ${u.nombre}`,
      message: 'El usuario no podrá iniciar sesión hasta que un administrador lo vuelva a activar.',
      details: 'No se eliminan sus datos ni sus acciones del log.',
      confirmText: 'Desactivar',
      danger: true,
    })) return;
    try {
      await api.delete(`/usuarios/${u.id}`);
      toast.success('Usuario desactivado');
      cargar();
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  const cambiarPassword = async () => {
    if (passwordData.nuevo !== passwordData.confirmar) { toast.error('Las contraseñas no coinciden'); return; }
    if (passwordData.nuevo.length < 8) { toast.error('Mínimo 8 caracteres'); return; }
    try {
      await api.put(`/usuarios/${modal.usuario.id}`, { password: passwordData.nuevo });
      toast.success('Contraseña actualizada');
      setModal(null);
      setPasswordData({ nuevo: '', confirmar: '' });
    } catch (e) { toast.error(e.response?.data?.error || 'Error'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios del Estudio</h1>
          <p className="text-gray-500 text-sm">Gestión de accesos y roles</p>
        </div>
        <button onClick={() => setModal({ tipo: 'form', usuario: null })} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Nuevo usuario
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="p-10 text-center"><div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Usuario</th>
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Rol</th>
                <th className="px-5 py-3 text-left">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {u.nombre[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{u.nombre}</p>
                        {u.id === usuarioActual?.id && <p className="text-xs text-blue-600">Tú</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={rolBadge[u.rol] || 'badge-gray'}>{ROLES.find(r => r.value === u.rol)?.label || u.rol}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={u.activo ? 'badge-green' : 'badge-gray'}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setModal({ tipo: 'form', usuario: u })}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Editar">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setModal({ tipo: 'password', usuario: u }); setPasswordData({ nuevo: '', confirmar: '' }); }}
                        className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded" title="Cambiar contraseña">
                        <KeyIcon className="w-4 h-4" />
                      </button>
                      {u.id !== usuarioActual?.id && u.activo && (
                        <button onClick={() => desactivar(u)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Desactivar">
                          <UserMinusIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">Sin usuarios registrados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal?.tipo === 'form' && (
        <Modal onClose={() => setModal(null)} title={modal.usuario ? 'Editar usuario' : 'Nuevo usuario'}>
          <UsuarioForm usuario={modal.usuario} onSave={() => { setModal(null); cargar(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {modal?.tipo === 'password' && (
        <Modal onClose={() => setModal(null)} title={`Cambiar contraseña — ${modal.usuario.nombre}`}>
          <div className="space-y-4">
            <div>
              <label className="label">Nueva contraseña *</label>
              <input type="password" className="input" value={passwordData.nuevo}
                onChange={e => setPasswordData(p => ({ ...p, nuevo: e.target.value }))} placeholder="Mínimo 8 caracteres" />
            </div>
            <div>
              <label className="label">Confirmar contraseña *</label>
              <input type="password" className="input" value={passwordData.confirmar}
                onChange={e => setPasswordData(p => ({ ...p, confirmar: e.target.value }))} placeholder="Repetir contraseña" />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
              <button onClick={cambiarPassword} className="btn-primary">Actualizar contraseña</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
