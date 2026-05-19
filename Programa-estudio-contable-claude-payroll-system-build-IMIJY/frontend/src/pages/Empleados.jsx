import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlusIcon, MagnifyingGlassIcon, UserIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';
import { formatDate, formatMoney } from '../utils/format';

function EmpleadoForm({ empleado, empresas, onSuccess, onClose }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: empleado ? {
      ...empleado,
      fechaIngreso: empleado.fechaIngreso?.split('T')[0],
      fechaNacimiento: empleado.fechaNacimiento?.split('T')[0],
    } : {},
  });

  const onSubmit = async (data) => {
    try {
      if (empleado) {
        await api.put(`/empleados/${empleado.id}`, data);
        toast.success('Empleado actualizado');
      } else {
        await api.post('/empleados', data);
        toast.success('Empleado creado exitosamente');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {!empleado && (
          <div className="col-span-2">
            <label className="label">Empresa *</label>
            <select className="input" {...register('empresaId', { required: 'Requerido' })}>
              <option value="">Seleccionar empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
            </select>
            {errors.empresaId && <p className="text-red-500 text-xs mt-1">{errors.empresaId.message}</p>}
          </div>
        )}
        <div>
          <label className="label">Apellido *</label>
          <input className="input" {...register('apellido', { required: 'Requerido' })} />
          {errors.apellido && <p className="text-red-500 text-xs mt-1">{errors.apellido.message}</p>}
        </div>
        <div>
          <label className="label">Nombre *</label>
          <input className="input" {...register('nombre', { required: 'Requerido' })} />
          {errors.nombre && <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>}
        </div>
        <div>
          <label className="label">CUIL *</label>
          <input className="input" placeholder="20-12345678-9" {...register('cuil', {
            required: 'Requerido',
            pattern: { value: /^\d{2}-\d{8}-\d{1}$/, message: 'Formato: XX-XXXXXXXX-X' }
          })} />
          {errors.cuil && <p className="text-red-500 text-xs mt-1">{errors.cuil.message}</p>}
        </div>
        <div>
          <label className="label">DNI</label>
          <input className="input" {...register('dni')} />
        </div>
        <div>
          <label className="label">Fecha de nacimiento</label>
          <input type="date" className="input" {...register('fechaNacimiento')} />
        </div>
        <div>
          <label className="label">Fecha de ingreso *</label>
          <input type="date" className="input" {...register('fechaIngreso', { required: 'Requerido' })} />
          {errors.fechaIngreso && <p className="text-red-500 text-xs mt-1">{errors.fechaIngreso.message}</p>}
        </div>
        <div>
          <label className="label">N° Legajo</label>
          <input className="input" {...register('legajoNumero')} />
        </div>
        <div>
          <label className="label">Categoría</label>
          <input className="input" placeholder="A, B, C..." {...register('categoria')} />
        </div>
        <div>
          <label className="label">Puesto</label>
          <input className="input" {...register('puesto')} />
        </div>
        <div>
          <label className="label">Básico Mensual *</label>
          <input type="number" step="0.01" className="input" {...register('basicoMensual', { required: 'Requerido', min: 0 })} />
          {errors.basicoMensual && <p className="text-red-500 text-xs mt-1">{errors.basicoMensual.message}</p>}
        </div>
        <div>
          <label className="label">Obra Social</label>
          <input className="input" {...register('obraSocialNombre')} />
        </div>
        <div>
          <label className="label">CBU</label>
          <input className="input" {...register('cbu')} />
        </div>
        <div>
          <label className="label">Sexo</label>
          <select className="input" {...register('sexo')}>
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
            <option value="X">No binario</option>
          </select>
        </div>
        <div>
          <label className="label">Modalidad contrato</label>
          <select className="input" {...register('modalidadContrato')}>
            <option value="TIEMPO_INDETERMINADO">Tiempo indeterminado</option>
            <option value="PLAZO_FIJO">Plazo fijo</option>
            <option value="EVENTUAL">Eventual</option>
            <option value="PASANTIA">Pasantía</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Guardando...' : empleado ? 'Guardar cambios' : 'Crear empleado'}
        </button>
      </div>
    </form>
  );
}

export default function Empleados() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const empresaIdFiltro = searchParams.get('empresaId');

  const [empleados, setEmpleados] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [empresaId, setEmpresaId] = useState(empresaIdFiltro || '');
  const [modalOpen, setModalOpen] = useState(false);
  const [editEmpleado, setEditEmpleado] = useState(null);

  const cargar = async () => {
    const params = {};
    if (buscar) params.buscar = buscar;
    if (empresaId) params.empresaId = empresaId;
    params.activo = true;

    const [empRes, empresasRes] = await Promise.all([
      api.get('/empleados', { params }),
      api.get('/empresas'),
    ]);
    setEmpleados(empRes.data.data);
    setEmpresas(empresasRes.data.data);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [buscar, empresaId]);

  const handleSuccess = () => { setModalOpen(false); setEditEmpleado(null); cargar(); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
          <p className="text-gray-500 text-sm">Legajos de nómina</p>
        </div>
        <button onClick={() => { setEditEmpleado(null); setModalOpen(true); }} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Nuevo empleado
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-200 flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Buscar por nombre, CUIL, legajo..."
              value={buscar} onChange={e => setBuscar(e.target.value)} />
          </div>
          <select className="input w-64" value={empresaId} onChange={e => setEmpresaId(e.target.value)}>
            <option value="">Todas las empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Empleado</th>
                <th className="px-5 py-3 text-left hidden md:table-cell">CUIL</th>
                <th className="px-5 py-3 text-left hidden lg:table-cell">Empresa</th>
                <th className="px-5 py-3 text-center">Categoría</th>
                <th className="px-5 py-3 text-right">Básico</th>
                <th className="px-5 py-3 text-center hidden md:table-cell">Antigüedad</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empleados.map(emp => (
                <tr key={emp.id} className="table-row-hover" onClick={() => navigate(`/empleados/${emp.id}`)}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 text-gray-600 font-semibold text-xs">
                        {emp.apellido[0]}{emp.nombre[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{emp.apellido}, {emp.nombre}</p>
                        <p className="text-xs text-gray-500">Leg. {emp.legajoNumero || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-500 hidden md:table-cell">{emp.cuil}</td>
                  <td className="px-5 py-3.5 text-gray-600 text-xs hidden lg:table-cell">{emp.empresa?.razonSocial}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="badge-blue">{emp.categoria || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-medium text-gray-900">
                    {formatMoney(emp.basicoMensual)}
                  </td>
                  <td className="px-5 py-3.5 text-center text-gray-600 hidden md:table-cell">
                    {emp.antiguedadAnios} año{emp.antiguedadAnios !== 1 ? 's' : ''}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button onClick={e => { e.stopPropagation(); setEditEmpleado(emp); setModalOpen(true); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {empleados.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">No se encontraron empleados</td></tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditEmpleado(null); }}
        title={editEmpleado ? 'Editar empleado' : 'Nuevo empleado'} size="lg">
        <EmpleadoForm empleado={editEmpleado} empresas={empresas} onSuccess={handleSuccess}
          onClose={() => { setModalOpen(false); setEditEmpleado(null); }} />
      </Modal>
    </div>
  );
}
