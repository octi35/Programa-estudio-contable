import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, MagnifyingGlassIcon, BuildingOfficeIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';
import { formatDate } from '../utils/format';
import { useAfipPadron } from '../hooks/useAfipPadron';

function EmpresaForm({ empresa, convenios, onSuccess, onClose }) {
  const { register, handleSubmit, setValue, getValues, formState: { errors, isSubmitting } } = useForm({
    defaultValues: empresa || {},
  });
  const { consultar: consultarPadron, loading: loadingPadron } = useAfipPadron();

  // onBlur del CUIT → consulta padrón AFIP y autocompleta.
  // Sólo pre-llena los campos que estén vacíos (no pisa lo que el usuario tipeó).
  const autocompletarDesdeAfip = async (e) => {
    const cuit = e.target.value;
    if (!/^\d{2}-?\d{8}-?\d{1}$/.test(cuit)) return;
    const datos = await consultarPadron(cuit);
    if (!datos) return;
    const map = {
      razonSocial: datos.razonSocial,
      domicilio: datos.domicilio,
      localidad: datos.localidad,
      provincia: datos.provincia,
      codigoPostal: datos.codigoPostal,
      nombreFantasia: datos.nombreFantasia,
    };
    for (const [k, v] of Object.entries(map)) {
      if (v && !getValues(k)) setValue(k, v, { shouldDirty: true });
    }
  };

  const onSubmit = async (data) => {
    try {
      if (empresa) {
        await api.put(`/empresas/${empresa.id}`, data);
        toast.success('Empresa actualizada');
      } else {
        await api.post('/empresas', data);
        toast.success('Empresa creada exitosamente');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Razón Social *</label>
          <input className="input" {...register('razonSocial', { required: 'Requerido' })} />
          {errors.razonSocial && <p className="text-red-500 text-xs mt-1">{errors.razonSocial.message}</p>}
        </div>
        <div>
          <label className="label">Nombre Fantasía</label>
          <input className="input" {...register('nombreFantasia')} />
        </div>
        <div>
          <label className="label flex items-center gap-1">
            CUIT *
            {loadingPadron && <span className="text-xs text-blue-600 inline-flex items-center gap-1"><SparklesIcon className="w-3 h-3 animate-pulse" /> Consultando AFIP...</span>}
          </label>
          <input
            className="input"
            placeholder="30-12345678-9"
            {...register('cuit', {
              required: 'Requerido',
              pattern: { value: /^\d{2}-?\d{8}-?\d{1}$/, message: 'Formato: XX-XXXXXXXX-X' },
              onBlur: autocompletarDesdeAfip,
            })}
          />
          {errors.cuit && <p className="text-red-500 text-xs mt-1">{errors.cuit.message}</p>}
          <p className="text-xs text-gray-400 mt-1">Tip: al salir del campo, se autocompleta desde el padrón AFIP</p>
        </div>
        <div className="col-span-2">
          <label className="label">Domicilio</label>
          <input className="input" {...register('domicilio')} />
        </div>
        <div>
          <label className="label">Localidad</label>
          <input className="input" {...register('localidad')} />
        </div>
        <div>
          <label className="label">Provincia</label>
          <input className="input" {...register('provincia')} />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input className="input" {...register('telefono')} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" {...register('email')} />
        </div>
        <div>
          <label className="label">Actividad Principal</label>
          <input className="input" {...register('actividadPrincipal')} />
        </div>
        <div>
          <label className="label">Convenio Colectivo</label>
          <select className="input" {...register('convenioId')}>
            <option value="">Sin convenio específico</option>
            {convenios.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Guardando...' : empresa ? 'Guardar cambios' : 'Crear empresa'}
        </button>
      </div>
    </form>
  );
}

export default function Empresas() {
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState([]);
  const [convenios, setConvenios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editEmpresa, setEditEmpresa] = useState(null);

  const cargar = async () => {
    const params = buscar ? { buscar } : {};
    const [empRes, convRes] = await Promise.all([
      api.get('/empresas', { params }),
      api.get('/convenios'),
    ]);
    setEmpresas(empRes.data.data);
    setConvenios(convRes.data);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [buscar]);

  const handleSuccess = () => { setModalOpen(false); setEditEmpresa(null); cargar(); };
  const handleEdit = (e, empresa) => { e.stopPropagation(); setEditEmpresa(empresa); setModalOpen(true); };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
          <p className="text-gray-500 text-sm">Clientes del estudio contable</p>
        </div>
        <button onClick={() => { setEditEmpresa(null); setModalOpen(true); }} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Nueva empresa
        </button>
      </div>

      <div className="card">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Buscar por razón social, CUIT..."
              value={buscar} onChange={e => setBuscar(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Empresa</th>
                <th className="px-5 py-3 text-left">CUIT</th>
                <th className="px-5 py-3 text-left hidden md:table-cell">Convenio</th>
                <th className="px-5 py-3 text-center">Empleados</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empresas.map(emp => (
                <tr key={emp.id} className="table-row-hover" onClick={() => navigate(`/empresas/${emp.id}`)}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BuildingOfficeIcon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{emp.razonSocial}</p>
                        {emp.nombreFantasia && <p className="text-xs text-gray-500">{emp.nombreFantasia}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600 font-mono text-xs">{emp.cuit}</td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <span className="text-xs text-gray-600">{emp.convenio?.nombre || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="badge-blue">{emp._count.empleados}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={emp.activa ? 'badge-green' : 'badge-red'}>
                      {emp.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <button onClick={e => handleEdit(e, emp)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium mr-3">
                      Editar
                    </button>
                    <button onClick={e => { e.stopPropagation(); navigate(`/liquidaciones?empresaId=${emp.id}`); }}
                      className="text-xs text-green-600 hover:text-green-800 font-medium">
                      Liquidar
                    </button>
                  </td>
                </tr>
              ))}
              {empresas.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No se encontraron empresas</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditEmpresa(null); }}
        title={editEmpresa ? 'Editar empresa' : 'Nueva empresa'} size="lg">
        <EmpresaForm empresa={editEmpresa} convenios={convenios} onSuccess={handleSuccess}
          onClose={() => { setModalOpen(false); setEditEmpresa(null); }} />
      </Modal>
    </div>
  );
}
