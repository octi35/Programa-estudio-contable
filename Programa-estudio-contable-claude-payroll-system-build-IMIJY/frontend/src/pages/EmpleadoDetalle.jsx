import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, CalculatorIcon, DocumentTextIcon, UserIcon, BriefcaseIcon, UsersIcon, ClipboardDocumentListIcon, ClockIcon, TagIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../api/client';
import Modal from '../components/Modal';
import { confirm } from '../components/confirm';
import { openAuthed } from '../utils/download';
import { formatDate, formatMoney, mesNombre, estadoLiquidacionLabel, tipoLiquidacionLabel } from '../utils/format';

const TABS = [
  { id: 'personal',  label: 'Datos Personales', icon: UserIcon },
  { id: 'laboral',   label: 'Laboral / AFIP',   icon: BriefcaseIcon },
  { id: 'familiares',label: 'Familiares',        icon: UsersIcon },
  { id: 'conceptos', label: 'Conceptos',         icon: TagIcon },
  { id: 'novedades', label: 'Novedades',         icon: ClipboardDocumentListIcon },
  { id: 'historial', label: 'Historial',         icon: ClockIcon },
];

function BajaForm({ onSuccess, onClose }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  return (
    <form onSubmit={handleSubmit(onSuccess)} className="space-y-4">
      <div>
        <label className="label">Fecha de egreso *</label>
        <input type="date" className="input" {...register('fechaEgreso', { required: 'Requerido' })} />
        {errors.fechaEgreso && <p className="text-red-500 text-xs mt-1">{errors.fechaEgreso.message}</p>}
      </div>
      <div>
        <label className="label">Motivo de egreso *</label>
        <select className="input" {...register('motivoEgreso', { required: 'Requerido' })}>
          <option value="">Seleccionar...</option>
          <option value="RENUNCIA">Renuncia</option>
          <option value="DESPIDO_SIN_CAUSA">Despido sin causa</option>
          <option value="DESPIDO_CON_CAUSA">Despido con causa</option>
          <option value="MUTUO_ACUERDO">Mutuo acuerdo</option>
          <option value="JUBILACION">Jubilación</option>
          <option value="FALLECIMIENTO">Fallecimiento</option>
          <option value="VENCIMIENTO_CONTRATO">Vencimiento de contrato</option>
        </select>
        {errors.motivoEgreso && <p className="text-red-500 text-xs mt-1">{errors.motivoEgreso.message}</p>}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-danger">
          {isSubmitting ? 'Procesando...' : 'Registrar baja'}
        </button>
      </div>
    </form>
  );
}

function FamiliarForm({ empleadoId, familiar, onSuccess, onClose }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: familiar || {},
  });

  const onSubmit = async (data) => {
    try {
      if (familiar?.id) {
        await api.put(`/familiares/${familiar.id}`, { ...data, empleadoId });
      } else {
        await api.post('/familiares', { ...data, empleadoId });
      }
      toast.success(familiar ? 'Familiar actualizado' : 'Familiar agregado');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
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
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Parentesco *</label>
          <select className="input" {...register('parentesco', { required: 'Requerido' })}>
            <option value="">Seleccionar...</option>
            <option value="CONYUGE">Cónyuge</option>
            <option value="HIJO">Hijo</option>
            <option value="HIJA">Hija</option>
            <option value="PADRE">Padre</option>
            <option value="MADRE">Madre</option>
            <option value="OTRO">Otro</option>
          </select>
          {errors.parentesco && <p className="text-red-500 text-xs mt-1">{errors.parentesco.message}</p>}
        </div>
        <div>
          <label className="label">DNI</label>
          <input className="input" placeholder="Sin puntos" {...register('dni')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">CUIL</label>
          <input className="input" placeholder="XX-XXXXXXXX-X" {...register('cuil')} />
        </div>
        <div>
          <label className="label">Fecha de nacimiento</label>
          <input type="date" className="input" {...register('fechaNacimiento')} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="discapacidad" {...register('discapacidad')} className="rounded" />
        <label htmlFor="discapacidad" className="text-sm text-gray-700">Tiene discapacidad (deducción especial AFIP)</label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function NovedadForm({ empleadoId, onSuccess, onClose }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async (data) => {
    try {
      await api.post('/empleados/novedades/masiva', {
        empleadoIds: [empleadoId],
        tipo: data.tipo,
        importe: data.importe ? Number(data.importe) : undefined,
        cantidad: data.cantidad ? Number(data.cantidad) : undefined,
        descripcion: data.descripcion,
        fechaDesde: data.fechaDesde,
        fechaHasta: data.fechaHasta || null,
      });
      toast.success('Novedad registrada');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Tipo de novedad *</label>
        <select className="input" {...register('tipo', { required: 'Requerido' })}>
          <option value="">Seleccionar...</option>
          <option value="ALTA">Alta</option>
          <option value="BAJA">Baja</option>
          <option value="CAMBIO_CATEGORIA">Cambio de categoría</option>
          <option value="CAMBIO_BASICO">Cambio de básico</option>
          <option value="HORA_EXTRA">Hora extra</option>
          <option value="ADELANTO_SUELDO">Adelanto de sueldo</option>
          <option value="LICENCIA">Licencia</option>
          <option value="SUSPENSION">Suspensión</option>
          <option value="VACACIONES">Vacaciones</option>
          <option value="DIAS_TRABAJADOS">Días trabajados</option>
          <option value="DIAS_NO_REMUNERATIVOS">Días no remunerativos</option>
          <option value="OBRA_SOCIAL_PREPAGA">Obra social prepaga</option>
          <option value="SINDICATO">Sindicato</option>
          <option value="PERSONALIZADA">Personalizada</option>
        </select>
        {errors.tipo && <p className="text-red-500 text-xs mt-1">{errors.tipo.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha desde *</label>
          <input type="date" className="input" {...register('fechaDesde', { required: 'Requerido' })} />
          {errors.fechaDesde && <p className="text-red-500 text-xs mt-1">{errors.fechaDesde.message}</p>}
        </div>
        <div>
          <label className="label">Fecha hasta</label>
          <input type="date" className="input" {...register('fechaHasta')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Importe</label>
          <input type="number" step="0.01" className="input" {...register('importe')} />
        </div>
        <div>
          <label className="label">Cantidad</label>
          <input type="number" step="0.01" className="input" {...register('cantidad')} />
        </div>
      </div>
      <div>
        <label className="label">Descripción</label>
        <input className="input" {...register('descripcion')} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

// ── Tab: Datos Personales ──────────────────────────────────────────────────────
function TabPersonal({ empleado }) {
  const fields = [
    ['N° Legajo', empleado.legajoNumero || '—'],
    ['DNI', empleado.dni || '—'],
    ['CUIL', empleado.cuil || '—'],
    ['Fecha nacimiento', formatDate(empleado.fechaNacimiento)],
    ['Sexo', empleado.sexo === 'M' ? 'Masculino' : empleado.sexo === 'F' ? 'Femenino' : empleado.sexo || '—'],
    ['Estado civil', empleado.estadoCivil || '—'],
    ['Nacionalidad', empleado.nacionalidad || '—'],
    ['Teléfono', empleado.telefono || '—'],
    ['Email', empleado.email || '—'],
    ['Domicilio', empleado.domicilio || '—'],
    ['Localidad', empleado.localidad || '—'],
    ['Provincia', empleado.provincia || '—'],
    ['Código postal', empleado.codigoPostal || '—'],
  ];

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Datos personales</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt className="text-gray-400 text-xs mb-0.5">{k}</dt>
            <dd className="font-medium text-gray-900 text-sm">{v}</dd>
          </div>
        ))}
      </div>
      {!empleado.activo && empleado.fechaEgreso && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          <p className="font-medium text-red-800">Empleado dado de baja</p>
          <p className="text-red-600">
            Fecha egreso: {formatDate(empleado.fechaEgreso)} · Motivo: {empleado.motivoEgreso?.replace(/_/g, ' ')}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Laboral / AFIP ────────────────────────────────────────────────────────
function TabLaboral({ empleado }) {
  const fields = [
    ['Empresa', empleado.empresa?.razonSocial],
    ['Sucursal', empleado.sucursal?.nombre || '—'],
    ['Convenio', empleado.convenio?.nombre || empleado.empresa?.convenio?.nombre || '—'],
    ['Fecha ingreso', formatDate(empleado.fechaIngreso)],
    ['Categoría', empleado.categoria || '—'],
    ['Puesto', empleado.puesto || '—'],
    ['Modalidad contrato', empleado.modalidadContrato?.replace(/_/g, ' ') || '—'],
    ['Jornada', empleado.jornadaTrabajo?.replace(/_/g, ' ') || '—'],
    ['Básico mensual', formatMoney(empleado.basicoMensual)],
    ['Obra social', empleado.obraSocialNombre || '—'],
    ['Código obra social', empleado.obraSocialCodigo || '—'],
    ['Sindicato', empleado.sindicatoCodigo || '—'],
    ['CBU', empleado.cbu || '—'],
    ['Banco', empleado.banco || '—'],
    ['Nro cuenta', empleado.nroCuenta || '—'],
    ['Antigüedad', `${empleado.antiguedadAnios ?? 0} años ${(empleado.antiguedadMeses ?? 0) % 12} meses`],
  ];

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Datos laborales y AFIP</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt className="text-gray-400 text-xs mb-0.5">{k}</dt>
            <dd className="font-medium text-gray-900 text-sm">{v}</dd>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Familiares ────────────────────────────────────────────────────────────
function TabFamiliares({ empleadoId }) {
  const [familiares, setFamiliares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);

  const cargar = () => {
    api.get(`/empleados/${empleadoId}/familiares`)
      .then(r => setFamiliares(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [empleadoId]);

  const eliminar = async (id) => {
    if (!await confirm({
      title: 'Eliminar familiar a cargo',
      message: 'Se eliminará al familiar de la nómina del empleado.',
      details: 'Esto puede afectar el cálculo de asignaciones familiares y deducción de Ganancias.',
      confirmText: 'Eliminar',
      danger: true,
    })) return;
    try {
      await api.delete(`/familiares/${id}`);
      toast.success('Familiar eliminado');
      cargar();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const PARENTESCO = { CONYUGE: 'Cónyuge', HIJO: 'Hijo', HIJA: 'Hija', PADRE: 'Padre', MADRE: 'Madre', OTRO: 'Otro' };

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>;

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="font-semibold text-gray-900">Familiares a cargo</h3>
        <button className="btn-primary text-xs" onClick={() => { setEditando(null); setModal(true); }}>
          + Agregar familiar
        </button>
      </div>
      {familiares.length === 0 ? (
        <p className="px-6 py-8 text-center text-gray-400">Sin familiares registrados</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-5 py-3 text-left">Apellido y nombre</th>
              <th className="px-5 py-3 text-left">Parentesco</th>
              <th className="px-5 py-3 text-left">DNI</th>
              <th className="px-5 py-3 text-left">Nacimiento</th>
              <th className="px-5 py-3 text-left">Discapacidad</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {familiares.map(f => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium">{f.apellido}, {f.nombre}</td>
                <td className="px-5 py-3">{PARENTESCO[f.parentesco] || f.parentesco}</td>
                <td className="px-5 py-3 text-gray-500">{f.dni || '—'}</td>
                <td className="px-5 py-3 text-gray-500">{formatDate(f.fechaNacimiento)}</td>
                <td className="px-5 py-3">{f.discapacidad ? <span className="badge-blue">Sí</span> : '—'}</td>
                <td className="px-5 py-3 text-right space-x-2">
                  <button className="text-blue-600 text-xs hover:underline" onClick={() => { setEditando(f); setModal(true); }}>Editar</button>
                  <button className="text-red-500 text-xs hover:underline" onClick={() => eliminar(f.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modal && (
        <Modal onClose={() => setModal(false)} title={editando ? 'Editar familiar' : 'Agregar familiar'}>
          <FamiliarForm
            empleadoId={empleadoId}
            familiar={editando}
            onSuccess={() => { setModal(false); cargar(); }}
            onClose={() => setModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Tab: Conceptos asignados ───────────────────────────────────────────────────
const TIPO_BADGE = {
  REMUNERATIVO:    'badge-green',
  NO_REMUNERATIVO: 'badge-blue',
  DEDUCCION:       'badge-red',
  APORTE_EMPLEADOR:'badge-yellow',
};

const TIPOS_CONCEPTO    = ['REMUNERATIVO','NO_REMUNERATIVO','DEDUCCION','APORTE_EMPLEADOR'];
const NATURALEZAS_CONCEPTO = ['HABER','DESCUENTO','INFORMATIVO'];
const UNIDADES_CONCEPTO = ['IMPORTE','PORCENTAJE','HORAS','DIAS','CANTIDAD'];

function NuevoConceptoInline({ convenios, onCreado, onCancelar }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting }, reset } = useForm({
    defaultValues: { tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'IMPORTE', remunerativo: true, imprimible: true, orden: 0 },
  });
  const unidad = watch('unidad');

  const onSubmit = async (data) => {
    try {
      const res = await api.post('/conceptos', {
        ...data,
        convenioId: data.convenioId || undefined,
        porcentaje: data.porcentaje ? Number(data.porcentaje) : undefined,
        importe:    data.importe    ? Number(data.importe)    : undefined,
        orden:      Number(data.orden) || 0,
      });
      toast.success('Concepto creado');
      reset();
      onCreado(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al crear concepto');
    }
  };

  return (
    <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-blue-800">Nuevo concepto</p>
        <button type="button" onClick={onCancelar} className="text-xs text-gray-400 hover:text-gray-600">✕ Cancelar</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label text-xs">Código *</label>
          <input className="input text-sm font-mono" {...register('codigo', { required: 'Requerido' })} />
          {errors.codigo && <p className="text-red-500 text-xs mt-0.5">{errors.codigo.message}</p>}
        </div>
        <div>
          <label className="label text-xs">Convenio</label>
          <select className="input text-sm" {...register('convenioId')}>
            <option value="">General</option>
            {convenios.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label text-xs">Nombre *</label>
          <input className="input text-sm" {...register('nombre', { required: 'Requerido' })} />
          {errors.nombre && <p className="text-red-500 text-xs mt-0.5">{errors.nombre.message}</p>}
        </div>
        <div>
          <label className="label text-xs">Tipo *</label>
          <select className="input text-sm" {...register('tipo', { required: true })}>
            {TIPOS_CONCEPTO.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Naturaleza *</label>
          <select className="input text-sm" {...register('naturaleza', { required: true })}>
            {NATURALEZAS_CONCEPTO.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Unidad</label>
          <select className="input text-sm" {...register('unidad')}>
            {UNIDADES_CONCEPTO.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Orden impresión</label>
          <input type="number" className="input text-sm" {...register('orden', { valueAsNumber: true })} />
        </div>
        {unidad === 'PORCENTAJE' && (
          <div>
            <label className="label text-xs">Porcentaje (%)</label>
            <input type="number" step="0.0001" className="input text-sm" {...register('porcentaje', { valueAsNumber: true })} />
          </div>
        )}
        {unidad === 'IMPORTE' && (
          <div>
            <label className="label text-xs">Importe fijo ($)</label>
            <input type="number" step="0.01" className="input text-sm" {...register('importe', { valueAsNumber: true })} />
          </div>
        )}
        <div className="col-span-2">
          <label className="label text-xs">Fórmula (opcional)</label>
          <input className="input text-sm font-mono" placeholder="Ej: BASICO * 0.08" {...register('formula')} />
        </div>
        <div className="col-span-2 flex gap-5">
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" className="rounded" {...register('remunerativo')} /> Remunerativo
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" className="rounded" {...register('imprimible')} /> Imprimible en recibo
          </label>
        </div>
      </div>
      <div className="flex justify-end pt-1">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleSubmit(onSubmit)}
          className="btn-primary text-xs py-1.5 px-4"
        >
          {isSubmitting ? 'Creando...' : 'Crear y seleccionar'}
        </button>
      </div>
    </div>
  );
}

function AsignacionForm({ empleadoId, asignacion, onSuccess, onClose }) {
  const [conceptos, setConceptos]         = useState([]);
  const [convenios, setConvenios]         = useState([]);
  const [loadingC, setLoadingC]           = useState(true);
  const [mostrarNuevo, setMostrarNuevo]   = useState(false);

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: asignacion
      ? {
          conceptoId:    asignacion.conceptoId,
          valor:         asignacion.valor ?? '',
          vigenciaDesde: asignacion.vigenciaDesde?.slice(0, 10),
          vigenciaHasta: asignacion.vigenciaHasta?.slice(0, 10) ?? '',
          observaciones: asignacion.observaciones ?? '',
        }
      : { vigenciaDesde: new Date().toISOString().slice(0, 10) },
  });

  const cargarConceptos = () =>
    api.get('/conceptos').then(r => setConceptos(r.data));

  useEffect(() => {
    Promise.all([api.get('/conceptos'), api.get('/convenios')])
      .then(([cRes, convRes]) => { setConceptos(cRes.data); setConvenios(convRes.data); })
      .finally(() => setLoadingC(false));
  }, []);

  const handleConceptoCreado = async (nuevoConcepto) => {
    await cargarConceptos();
    setValue('conceptoId', nuevoConcepto.id);
    setMostrarNuevo(false);
  };

  const onSubmit = async (data) => {
    try {
      const payload = {
        conceptoId:    data.conceptoId,
        valor:         data.valor !== '' ? Number(data.valor) : null,
        vigenciaDesde: data.vigenciaDesde,
        vigenciaHasta: data.vigenciaHasta || null,
        observaciones: data.observaciones || null,
      };
      if (asignacion) {
        await api.put(`/empleados/conceptos/${asignacion.id}`, payload);
        toast.success('Concepto actualizado');
      } else {
        await api.post(`/empleados/${empleadoId}/conceptos`, payload);
        toast.success('Concepto asignado');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label">Concepto *</label>
          {!asignacion && !mostrarNuevo && (
            <button type="button" onClick={() => setMostrarNuevo(true)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium">
              + Crear nuevo concepto
            </button>
          )}
        </div>
        {loadingC ? (
          <div className="input text-gray-400">Cargando...</div>
        ) : (
          <select className="input" {...register('conceptoId', { required: 'Requerido' })} disabled={!!asignacion}>
            <option value="">Seleccionar concepto...</option>
            {conceptos.map(c => (
              <option key={c.id} value={c.id}>
                [{c.codigo}] {c.nombre} — {c.tipo.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        )}
        {errors.conceptoId && <p className="text-red-500 text-xs mt-1">{errors.conceptoId.message}</p>}
      </div>

      {mostrarNuevo && (
        <NuevoConceptoInline
          convenios={convenios}
          onCreado={handleConceptoCreado}
          onCancelar={() => setMostrarNuevo(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Valor / Importe ($)</label>
          <input type="number" step="0.01" className="input"
            placeholder="Vacío = usa el del concepto"
            {...register('valor')} />
          <p className="text-xs text-gray-400 mt-1">Dejá vacío para usar el importe definido en el concepto</p>
        </div>
        <div />
        <div>
          <label className="label">Vigencia desde *</label>
          <input type="date" className="input" {...register('vigenciaDesde', { required: 'Requerido' })} />
          {errors.vigenciaDesde && <p className="text-red-500 text-xs mt-1">{errors.vigenciaDesde.message}</p>}
        </div>
        <div>
          <label className="label">Vigencia hasta</label>
          <input type="date" className="input" {...register('vigenciaHasta')} />
          <p className="text-xs text-gray-400 mt-1">Vacío = sin fecha de vencimiento</p>
        </div>
      </div>

      <div>
        <label className="label">Observaciones</label>
        <input className="input" placeholder="Opcional" {...register('observaciones')} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Guardando...' : asignacion ? 'Guardar cambios' : 'Asignar concepto'}
        </button>
      </div>
    </form>
  );
}

function TabConceptos({ empleadoId }) {
  const [registros, setRegistros]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [editando, setEditando]     = useState(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [convenios, setConvenios]   = useState([]);

  useEffect(() => {
    api.get('/convenios').then(r => setConvenios(r.data)).catch(() => {});
  }, []);

  const cargar = () => {
    setLoading(true);
    api.get(`/empleados/${empleadoId}/conceptos`)
       .then(r => setRegistros(r.data))
       .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [empleadoId]);

  const toggleActivo = async (r) => {
    try {
      await api.put(`/empleados/conceptos/${r.id}`, { activo: !r.activo });
      toast.success(r.activo ? 'Concepto desactivado' : 'Concepto activado');
      cargar();
    } catch { toast.error('Error al actualizar'); }
  };

  const eliminar = async (id) => {
    if (!await confirm({
      title: 'Eliminar asignación',
      message: 'Se quitará este concepto del empleado. No afecta liquidaciones ya calculadas.',
      confirmText: 'Eliminar',
      danger: true,
    })) return;
    try {
      await api.delete(`/empleados/conceptos/${id}`);
      toast.success('Asignación eliminada');
      cargar();
    } catch { toast.error('Error al eliminar'); }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>;

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-900">Conceptos asignados</h3>
          <p className="text-xs text-gray-400 mt-0.5">Se aplican automáticamente en cada liquidación según su vigencia</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={() => setModalCrear(true)}>
            + Crear concepto
          </button>
          <button className="btn-primary text-xs" onClick={() => { setEditando(null); setModal(true); }}>
            + Asignar concepto
          </button>
        </div>
      </div>

      {registros.length === 0 ? (
        <p className="px-6 py-8 text-center text-gray-400">Sin conceptos asignados. Asigná uno para que se aplique automáticamente en las liquidaciones.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-5 py-3 text-left">Código</th>
              <th className="px-5 py-3 text-left">Concepto</th>
              <th className="px-5 py-3 text-center">Tipo</th>
              <th className="px-5 py-3 text-right">Valor</th>
              <th className="px-5 py-3 text-left">Desde</th>
              <th className="px-5 py-3 text-left">Hasta</th>
              <th className="px-5 py-3 text-center">Estado</th>
              <th className="px-5 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {registros.map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 ${!r.activo ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-600">{r.concepto.codigo}</td>
                <td className="px-5 py-3 font-medium text-gray-900">{r.concepto.nombre}</td>
                <td className="px-5 py-3 text-center">
                  <span className={TIPO_BADGE[r.concepto.tipo] || 'badge-gray'}>
                    {r.concepto.tipo.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs">
                  {r.valor != null ? formatMoney(r.valor) : <span className="text-gray-400 italic">Del concepto</span>}
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(r.vigenciaDesde)}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{r.vigenciaHasta ? formatDate(r.vigenciaHasta) : <span className="text-green-600">Vigente</span>}</td>
                <td className="px-5 py-3 text-center">
                  {r.activo
                    ? <span className="badge-green">Activo</span>
                    : <span className="badge-gray">Inactivo</span>}
                </td>
                <td className="px-5 py-3 text-center space-x-2 whitespace-nowrap">
                  <button className="text-blue-600 text-xs hover:underline"
                    onClick={() => { setEditando(r); setModal(true); }}>Editar</button>
                  <button className="text-yellow-600 text-xs hover:underline"
                    onClick={() => toggleActivo(r)}>{r.activo ? 'Desactivar' : 'Activar'}</button>
                  <button className="text-red-500 text-xs hover:underline"
                    onClick={() => eliminar(r.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <Modal onClose={() => setModal(false)}
          title={editando ? 'Editar asignación' : 'Asignar concepto al empleado'}
          size="lg">
          <AsignacionForm
            empleadoId={empleadoId}
            asignacion={editando}
            onSuccess={() => { setModal(false); cargar(); }}
            onClose={() => setModal(false)}
          />
        </Modal>
      )}

      {modalCrear && (
        <Modal onClose={() => setModalCrear(false)} title="Crear nuevo concepto" size="lg">
          <NuevoConceptoInline
            convenios={convenios}
            onCreado={() => { setModalCrear(false); toast.success('Concepto creado'); }}
            onCancelar={() => setModalCrear(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Tab: Novedades ─────────────────────────────────────────────────────────────
function TabNovedades({ empleado }) {
  const [modal, setModal] = useState(false);
  const [novedades, setNovedades] = useState(empleado.novedades || []);

  const recargar = () => {
    api.get(`/empleados/${empleado.id}`).then(r => setNovedades(r.data.novedades || []));
  };

  const TIPO_LABEL = {
    ALTA: 'Alta', BAJA: 'Baja', CAMBIO_CATEGORIA: 'Cambio categoría', CAMBIO_BASICO: 'Cambio básico',
    HORA_EXTRA: 'Hora extra', ADELANTO_SUELDO: 'Adelanto sueldo', LICENCIA: 'Licencia',
    SUSPENSION: 'Suspensión', VACACIONES: 'Vacaciones', DIAS_TRABAJADOS: 'Días trabajados',
    DIAS_NO_REMUNERATIVOS: 'Días no rem.', OBRA_SOCIAL_PREPAGA: 'Obra social prepaga',
    SINDICATO: 'Sindicato', PERSONALIZADA: 'Personalizada',
  };

  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="font-semibold text-gray-900">Novedades del empleado</h3>
        <button className="btn-primary text-xs" onClick={() => setModal(true)}>+ Nueva novedad</button>
      </div>
      {novedades.length === 0 ? (
        <p className="px-6 py-8 text-center text-gray-400">Sin novedades registradas</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-5 py-3 text-left">Tipo</th>
              <th className="px-5 py-3 text-left">Descripción</th>
              <th className="px-5 py-3 text-left">Desde</th>
              <th className="px-5 py-3 text-left">Hasta</th>
              <th className="px-5 py-3 text-right">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {novedades.map(n => (
              <tr key={n.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium">{TIPO_LABEL[n.tipo] || n.tipo.replace(/_/g, ' ')}</td>
                <td className="px-5 py-3 text-gray-500">{n.descripcion || '—'}</td>
                <td className="px-5 py-3 text-gray-500">{formatDate(n.fechaDesde)}</td>
                <td className="px-5 py-3 text-gray-500">{n.fechaHasta ? formatDate(n.fechaHasta) : 'Vigente'}</td>
                <td className="px-5 py-3 text-right font-medium">{n.importe ? formatMoney(n.importe) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modal && (
        <Modal onClose={() => setModal(false)} title="Nueva novedad">
          <NovedadForm
            empleadoId={empleado.id}
            onSuccess={() => { setModal(false); recargar(); }}
            onClose={() => setModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ── Gráfico evolución salarial ─────────────────────────────────────────────────
function GraficoSalarial({ empleadoId, meses = 12 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/empleados/${empleadoId}/historial-salarial`, { params: { meses } })
      .then(r => setData(r.data.historial || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [empleadoId, meses]);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Cargando gráfico...</div>;
  if (!data.length) {
    return (
      <div className="card p-6">
        <h3 className="font-semibold text-gray-900 mb-2 text-sm">Evolución salarial</h3>
        <p className="text-gray-400 text-sm text-center py-6">Sin liquidaciones para graficar</p>
      </div>
    );
  }

  const fmt = (v) => `$${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

  return (
    <div className="card p-5">
      <div className="mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">Evolución salarial — últimos {data.length} meses</h3>
        <p className="text-xs text-gray-400 mt-0.5">Comparativa bruto / neto / aportes empleador</p>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={fmt} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="bruto" name="Sueldo Bruto" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="neto" name="Sueldo Neto" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="contribuciones" name="Aportes Empleador" stroke="#6b7280" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Tab: Historial liquidaciones ───────────────────────────────────────────────
function TabHistorial({ empleadoId, navigate }) {
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/empleados/${empleadoId}/liquidaciones`)
      .then(r => setLiquidaciones(r.data))
      .finally(() => setLoading(false));
  }, [empleadoId]);

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-5">
    <GraficoSalarial empleadoId={empleadoId} meses={12} />
    <div className="card">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Historial de liquidaciones</h3>
        <button
          onClick={() => navigate(`/liquidaciones?empleadoId=${empleadoId}`)}
          className="btn-primary text-xs py-1.5">
          <CalculatorIcon className="w-3.5 h-3.5 inline mr-1" /> Nueva liquidación
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-5 py-3 text-left">Período</th>
              <th className="px-5 py-3 text-left">Tipo</th>
              <th className="px-5 py-3 text-right">Haberes</th>
              <th className="px-5 py-3 text-right">Descuentos</th>
              <th className="px-5 py-3 text-right">Neto</th>
              <th className="px-5 py-3 text-center">Estado</th>
              <th className="px-5 py-3 text-center">Recibo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liquidaciones.map(liq => {
              const est = estadoLiquidacionLabel[liq.estado] || { label: liq.estado, cls: 'badge-gray' };
              return (
                <tr key={liq.id} className="table-row-hover cursor-pointer"
                  onClick={() => navigate(`/liquidaciones/${liq.id}`)}>
                  <td className="px-5 py-3 font-medium">{mesNombre(liq.mes)} {liq.anio}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{tipoLiquidacionLabel[liq.tipo] || liq.tipo}</td>
                  <td className="px-5 py-3 text-right text-green-700 font-medium">{formatMoney(liq.totalHaberes)}</td>
                  <td className="px-5 py-3 text-right text-red-600">{formatMoney(liq.totalDescuentos)}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">{formatMoney(liq.totalNeto)}</td>
                  <td className="px-5 py-3 text-center"><span className={est.cls}>{est.label}</span></td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        openAuthed(`/api/liquidaciones/${liq.id}/recibo`);
                      }}
                      className="text-blue-600 hover:text-blue-800">
                      <DocumentTextIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {liquidaciones.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">Sin liquidaciones registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EmpleadoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [empleado, setEmpleado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bajaModal, setBajaModal] = useState(false);
  const [tab, setTab] = useState('personal');

  const cargar = () =>
    api.get(`/empleados/${id}`)
      .then(r => setEmpleado(r.data))
      .finally(() => setLoading(false));

  useEffect(() => { cargar(); }, [id]);

  const handleBaja = async (data) => {
    if (!await confirm({
      title: 'Dar de baja al empleado',
      message: 'El empleado quedará marcado como INACTIVO y no será considerado en futuras liquidaciones.',
      details: [
        'Se registrará la fecha y motivo de baja en su legajo.',
        'Las liquidaciones anteriores no se modifican.',
        'Esta acción no se puede deshacer desde la pantalla de detalle.',
      ],
      confirmText: 'Dar de baja',
      requireText: 'BAJA',
      danger: true,
    })) return;
    try {
      await api.post(`/empleados/${id}/baja`, data);
      toast.success('Baja registrada correctamente');
      setBajaModal(false);
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al registrar baja');
    }
  };

  if (loading) return (
    <div className="flex justify-center p-12">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!empleado) return <p className="text-gray-500">Empleado no encontrado</p>;

  const antiguedadAnios = empleado.antiguedadAnios ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-secondary p-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${empleado.activo ? 'bg-blue-600' : 'bg-gray-400'}`}>
          {empleado.apellido[0]}{empleado.nombre[0]}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{empleado.apellido}, {empleado.nombre}</h1>
          <p className="text-gray-500 text-sm">
            Legajo {empleado.legajoNumero || '—'} · CUIL: {empleado.cuil} · {empleado.empresa?.razonSocial}
            {!empleado.activo && <span className="ml-2 badge-red">BAJA</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-2">
            <p className="text-2xl font-bold text-green-700">{formatMoney(empleado.basicoMensual)}</p>
            <p className="text-xs text-gray-400">{antiguedadAnios} años antigüedad</p>
          </div>
          {empleado.activo && (
            <button onClick={() => setBajaModal(true)} className="btn-danger">Registrar baja</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {tab === 'personal'  && <TabPersonal  empleado={empleado} />}
      {tab === 'laboral'   && <TabLaboral   empleado={empleado} />}
      {tab === 'familiares'&& <TabFamiliares empleadoId={id} />}
      {tab === 'conceptos' && <TabConceptos  empleadoId={id} />}
      {tab === 'novedades' && <TabNovedades  empleado={empleado} />}
      {tab === 'historial' && <TabHistorial  empleadoId={id} navigate={navigate} />}

      <Modal open={bajaModal} onClose={() => setBajaModal(false)} title="Registrar baja de empleado">
        <BajaForm onSuccess={handleBaja} onClose={() => setBajaModal(false)} />
      </Modal>
    </div>
  );
}
