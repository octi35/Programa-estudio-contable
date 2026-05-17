import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BuildingOfficeIcon, UsersIcon, CalculatorIcon, CurrencyDollarIcon,
  ArrowTopRightOnSquareIcon, NewspaperIcon, ArrowPathIcon,
  LockClosedIcon, DocumentCheckIcon, ReceiptRefundIcon, IdentificationIcon,
  BanknotesIcon, ShieldCheckIcon, ClipboardDocumentListIcon,
  ExclamationTriangleIcon, BellAlertIcon, CalendarDaysIcon, UserMinusIcon,
} from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../api/client';
import { formatMoney, mesNombre } from '../utils/format';

const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── Accesos rápidos ARCA / AFIP ────────────────────────────────────────────
const AFIP_LINKS = [
  { label: 'Clave Fiscal', desc: 'Ingresar a ARCA', href: 'https://auth.afip.gob.ar/contribuyente_/login.xhtml', icon: LockClosedIcon, color: 'text-[#0A5CFF] bg-[#E9F0FF]' },
  { label: 'Mis Comprobantes', desc: 'Consultar facturas', href: 'https://comprobantes.afip.gob.ar/', icon: ReceiptRefundIcon, color: 'text-slate-900 bg-slate-100' },
  { label: 'SIRADIG 572', desc: 'Ganancias 4ª cat.', href: 'https://siradig.afip.gob.ar/', icon: DocumentCheckIcon, color: 'text-[#0A5CFF] bg-[#E9F0FF]' },
  { label: 'SICOSS / F.931', desc: 'Seg. Social', href: 'https://www.afip.gob.ar/sicoss/', icon: ClipboardDocumentListIcon, color: 'text-slate-900 bg-slate-100' },
  { label: 'Monotributo', desc: 'Régimen simplificado', href: 'https://www.afip.gob.ar/monotributo/', icon: ShieldCheckIcon, color: 'text-[#0A5CFF] bg-[#E9F0FF]' },
  { label: 'Consulta CUIT', desc: 'Constancia inscripción', href: 'https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do', icon: IdentificationIcon, color: 'text-slate-900 bg-slate-100' },
  { label: 'Facturas Electrónicas', desc: 'Comprobantes en línea', href: 'https://serviciosweb.afip.gob.ar/genericos/comprobantes/Default.aspx', icon: BanknotesIcon, color: 'text-[#0A5CFF] bg-[#E9F0FF]' },
  { label: 'ARCA — Novedades', desc: 'Noticias oficiales', href: 'https://www.argentina.gob.ar/arca', icon: NewspaperIcon, color: 'text-slate-900 bg-slate-100' },
];

// ── Nombres de tipos de dólar ──────────────────────────────────────────────
const DOLAR_LABELS = {
  oficial: { label: 'Oficial', color: 'bg-[#0A5CFF]' },
  blue: { label: 'Blue', color: 'bg-slate-800' },
  bolsa: { label: 'MEP', color: 'bg-[#0A5CFF]' },
  contadoconliqui: { label: 'CCL', color: 'bg-[#0A5CFF]' },
  tarjeta: { label: 'Tarjeta', color: 'bg-slate-700' },
  mayorista: { label: 'Mayorista', color: 'bg-[#0A5CFF]' },
  cripto: { label: 'Cripto', color: 'bg-[#0A5CFF]' },
};

const PANEL_CLASS = 'rounded-2xl border border-black/10 bg-white shadow-[0_8px_24px_rgba(2,6,23,0.06)]';

// ── Componentes de vencimientos ────────────────────────────────────────────
function calcularVencimientos() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const proximoMes = mes === 11 ? 0 : mes + 1;
  const anioProximo = mes === 11 ? anio + 1 : anio;
  const venc = (y, m, d) => {
    const fecha = new Date(y, m, d);
    const diff = Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
    let color = 'text-green-600';
    if (diff <= 0) color = 'text-gray-400';
    else if (diff <= 3) color = 'text-red-600';
    else if (diff <= 7) color = 'text-[#0A5CFF]';
    return { fecha, diff, color };
  };
  return [
    { label: 'F931 — AFIP', ...venc(anioProximo, proximoMes, 10) },
    { label: 'IVA Ventas', ...venc(anioProximo, proximoMes, 20) },
    { label: 'Ganancias Ret.', ...venc(anioProximo, proximoMes, 13) },
    { label: 'IIBB Mensual', ...venc(anioProximo, proximoMes, 15) },
    { label: 'Pago sueldos', ...venc(anio, mes, new Date(anio, mes + 1, 0).getDate()) },
  ];
}

function VencimientosWidget() {
  const items = calcularVencimientos();
  const fmt = (d) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return (
    <div className={`${PANEL_CLASS} p-5`}>
      <h3 className="font-semibold text-gray-900 mb-3 text-sm tracking-tight">Próximos vencimientos</h3>
      <div className="space-y-2">
        {items.map(({ label, fecha, diff, color }) => (
          <div key={label} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
            <span className="text-xs text-gray-600">{label}</span>
            <div className="text-right">
              <span className={`text-xs font-semibold ${color}`}>{fmt(fecha)}</span>
              <span className="text-xs text-gray-400 ml-1.5">{diff <= 0 ? 'Vencido' : `${diff}d`}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'text-[#0A5CFF] bg-[#EAF0FF] ring-[#DDE7FF]',
    green: 'text-slate-900 bg-slate-100 ring-slate-200',
    purple: 'text-[#0A5CFF] bg-[#EAF0FF] ring-[#DDE7FF]',
    orange: 'text-slate-900 bg-slate-100 ring-slate-200',
  };
  return (
    <div className={`${PANEL_CLASS} p-5 flex items-center gap-4`}>
      <div className={`${colors[color]} p-3 rounded-xl ring-1 flex-shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

function EstadoPeriodo({ periodo }) {
  if (!periodo || periodo.length === 0) return <span className="badge-gray">Sin liquidar</span>;
  const { estado } = periodo[0];
  if (estado === 'CERRADO') return <span className="badge-green">Cerrado</span>;
  if (estado === 'PROCESADO') return <span className="badge-blue">Procesado</span>;
  return <span className="badge-yellow">Abierto</span>;
}

function MiniSparkline({ positive }) {
  const path = positive
    ? 'M0 21 L16 19 L32 13 L48 15 L64 8 L80 11 L100 6'
    : 'M0 21 L14 20 L28 18 L42 15 L56 13 L70 11 L84 9 L100 8';
  return (
    <svg viewBox="0 0 100 24" className="h-6 w-20">
      <path d={path} fill="none" stroke={positive ? '#0A5CFF' : '#93A3C8'} strokeWidth="2" strokeLinecap="round" />
      <path d={`${path} L100 24 L0 24 Z`} fill={positive ? 'rgba(10,92,255,0.16)' : 'rgba(148,163,184,0.14)'} />
    </svg>
  );
}

// ── Panel Dólar ────────────────────────────────────────────────────────────
function PanelDolar() {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [timestamp, setTimestamp] = useState('');

  const cargar = async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await api.get('/externo/dolar');
      setCotizaciones(r.data.cotizaciones || []);
      setTimestamp(r.data.timestamp ? new Date(r.data.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const fmt = (n) => n != null ? `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  const priorizados = ['blue', 'oficial', 'tarjeta', 'cripto', 'bolsa', 'contadoconliqui', 'mayorista'];
  const ordenadas = cotizaciones
    .filter(c => priorizados.includes(c.casa))
    .sort((a, b) => priorizados.indexOf(a.casa) - priorizados.indexOf(b.casa));

  return (
    <div className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CurrencyDollarIcon className="w-5 h-5 text-[#0A5CFF]" />
          <h3 className="font-semibold text-slate-900 text-sm tracking-tight">Cotización del dólar</h3>
          {timestamp && <span className="text-xs text-slate-500">Act. {timestamp}</span>}
        </div>
        <div className="flex items-center gap-2">
          <a href="https://finanzasargy.com/" target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#0A5CFF] hover:underline flex items-center gap-1">
            finanzasargy.com <ArrowTopRightOnSquareIcon className="w-3 h-3" />
          </a>
          <button onClick={cargar} disabled={loading} className="p-1 text-slate-500 hover:text-slate-700 disabled:opacity-40">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-[#0A5CFF] border-t-transparent rounded-full animate-spin" /></div>}

      {error && <p className="text-xs text-red-500 text-center py-2">No se pudo obtener la cotización en este momento</p>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {ordenadas.slice(0, 4).map(c => {
            const info = DOLAR_LABELS[c.casa] || { label: c.nombre, color: 'bg-slate-600' };
            const spread = c.compra && c.venta ? (Math.abs((c.venta - c.compra) / c.compra) * 0.1).toFixed(1) : '0.0';
            const bullish = c.casa === 'cripto' || c.casa === 'bolsa';
            return (
              <div key={c.casa} className="rounded-2xl border border-[#3D414C] bg-[#4C505B] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-white/90 tracking-[0.18em] uppercase">Dólar {info.label}</p>
                  <span className={`h-2.5 w-2.5 rounded-full ${bullish ? 'bg-[#0A5CFF]' : 'bg-slate-400'}`} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-[#0B0F1C] px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-slate-400">Venta</p>
                    <p className="mt-1 text-base font-semibold text-white">{fmt(c.venta)}</p>
                  </div>
                  <div className="rounded-lg bg-[#0B0F1C] px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-slate-400">Compra</p>
                    <p className="mt-1 text-base font-semibold text-white/90">{fmt(c.compra)}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${bullish ? 'bg-[#0A5CFF] text-white' : 'bg-[#2B2F3A] text-slate-200'}`}>
                    {bullish ? '▲' : '•'} {spread}%
                  </span>
                  <MiniSparkline positive={bullish} />
                </div>

                <div className="mt-2 text-right text-[10px] text-slate-300/60">
                  Últimas 24 hs
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Panel Accesos Rápidos ARCA/AFIP ───────────────────────────────────────
function PanelARCA() {
  return (
    <div className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <img src="https://www.afip.gob.ar/imagen/logo-afip.png" alt="ARCA" className="h-5 object-contain"
          onError={e => { e.target.style.display = 'none'; }} />
        <h3 className="font-semibold text-gray-900 text-sm tracking-tight">Accesos ARCA / AFIP</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {AFIP_LINKS.map(({ label, desc, href, icon: Icon, color }) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl p-3 border border-slate-200 hover:border-[#0A5CFF]/20 hover:bg-[#F3F7FF] transition-colors group">
            <div className={`p-2 rounded-lg flex-shrink-0 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 group-hover:text-[#0A5CFF] truncate">{label}</p>
              <p className="text-xs text-gray-400 truncate">{desc}</p>
            </div>
            <ArrowTopRightOnSquareIcon className="w-3 h-3 text-gray-300 flex-shrink-0 ml-auto" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Panel Pendientes de hoy ───────────────────────────────────────────────
function PanelPendientes({ navigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = () => {
    setLoading(true);
    api.get('/dashboard/pendientes')
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  if (loading) {
    return (
      <div className={`${PANEL_CLASS} p-5`}>
        <div className="flex justify-center py-3">
          <div className="w-5 h-5 border-2 border-[#0A5CFF] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { vencimientosProximos = [], liquidacionesSinConfirmar = [], empleadosConNovedad = [], alertasMonotributo = [] } = data;
  const totalPendientes = vencimientosProximos.length + liquidacionesSinConfirmar.length + empleadosConNovedad.length + alertasMonotributo.length;

  if (totalPendientes === 0) {
    return (
      <div className={`${PANEL_CLASS} p-5`}>
        <div className="flex items-center gap-2 mb-2">
          <BellAlertIcon className="w-5 h-5 text-green-600" />
          <h3 className="font-semibold text-gray-900 text-sm">Pendientes de hoy</h3>
        </div>
        <p className="text-sm text-gray-500 py-2">Todo al día. No hay pendientes urgentes para tu estudio.</p>
      </div>
    );
  }

  const cards = [
    {
      key: 'vencimientos',
      label: 'Vencimientos próximos',
      sub: '7 días',
      count: vencimientosProximos.length,
      onClick: () => navigate('/vencimientos'),
      color: 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
      iconColor: 'bg-slate-900',
      icon: CalendarDaysIcon,
      hidden: vencimientosProximos.length === 0,
    },
    {
      key: 'liquidaciones',
      label: 'Liquidaciones sin confirmar',
      sub: 'Estado CALCULADO',
      count: liquidacionesSinConfirmar.length,
      onClick: () => navigate('/liquidaciones'),
      color: 'bg-[#F3F7FF] border-[#DDE7FF] text-[#0A5CFF] hover:bg-[#EAF0FF]',
      iconColor: 'bg-[#0A5CFF]',
      icon: CalculatorIcon,
      hidden: liquidacionesSinConfirmar.length === 0,
    },
    {
      key: 'novedades',
      label: 'Empleados con novedad',
      sub: 'Suspensión/Baja/Vacaciones',
      count: empleadosConNovedad.length,
      onClick: () => navigate('/empleados'),
      color: 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
      iconColor: 'bg-slate-900',
      icon: UserMinusIcon,
      hidden: empleadosConNovedad.length === 0,
    },
    {
      key: 'monotributo',
      label: 'Alertas Monotributo',
      sub: '≥ 80% del tope',
      count: alertasMonotributo.length,
      onClick: () => navigate('/monotributo'),
      color: 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50',
      iconColor: 'bg-slate-900',
      icon: ExclamationTriangleIcon,
      hidden: alertasMonotributo.length === 0,
    },
  ].filter(c => !c.hidden);

  return (
    <div className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BellAlertIcon className="w-5 h-5 text-[#0A5CFF]" />
          <h3 className="font-semibold text-gray-900 text-sm">Pendientes de hoy</h3>
          <span className="bg-[#EAF0FF] text-[#0A5CFF] text-xs font-semibold rounded-full px-2 py-0.5 border border-[#DDE7FF]">{totalPendientes}</span>
        </div>
        <button onClick={cargar} className="p-1 text-gray-400 hover:text-gray-600" title="Actualizar">
          <ArrowPathIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <button key={c.key} onClick={c.onClick}
              className={`flex items-center gap-3 rounded-xl p-3 border transition-colors text-left ${c.color}`}>
              <div className={`${c.iconColor} p-2 rounded-lg flex-shrink-0`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-none">{c.count}</p>
                <p className="text-xs font-medium mt-0.5">{c.label}</p>
                {c.sub && <p className="text-xs opacity-70">{c.sub}</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Panel Noticias AFIP ───────────────────────────────────────────────────
function PanelNoticias() {
  const [noticias, setNoticias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fuente, setFuente] = useState('');

  useEffect(() => {
    api.get('/externo/noticias-afip')
      .then(r => { setNoticias(r.data.items || []); setFuente(r.data.fuente || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmtFecha = (s) => {
    if (!s) return '';
    try { return new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div className={`${PANEL_CLASS} p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <NewspaperIcon className="w-5 h-5 text-[#0A5CFF]" />
          <h3 className="font-semibold text-gray-900 text-sm tracking-tight">Novedades fiscales para contadores</h3>
        </div>
        <a href="https://www.argentina.gob.ar/arca" target="_blank" rel="noopener noreferrer"
          className="text-xs text-[#0A5CFF] hover:underline flex items-center gap-1">
          Ver todo <ArrowTopRightOnSquareIcon className="w-3 h-3" />
        </a>
      </div>

      {loading && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-[#0A5CFF] border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {noticias.map((n, i) => (
            <a key={i} href={n.link || '#'} target="_blank" rel="noopener noreferrer"
              className="block p-3 rounded-xl border border-slate-200 hover:border-[#0A5CFF]/20 hover:bg-[#F3F7FF] transition-colors group">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 group-hover:text-[#0A5CFF] line-clamp-2 leading-snug">{n.title}</p>
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
              </div>
              {n.description && (
                <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{n.description}</p>
              )}
              {n.pubDate && <p className="text-xs text-gray-400 mt-2">{fmtFecha(n.pubDate)}</p>}
            </a>
          ))}
        </div>
      )}

      {!loading && fuente === 'curado' && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          Accesos útiles curados — el feed de ARCA no estuvo disponible al momento de cargar
        </p>
      )}
    </div>
  );
}

// ── Dashboard principal ───────────────────────────────────────────────────
const formatTooltipMoney = (value) =>
  `$ ${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [comparativo, setComparativo] = useState([]);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState('');
  const [mesesComp, setMesesComp] = useState(6);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/reportes/panel-estudio')
      .then(res => {
        setData(res.data);
        if (res.data.empresas?.length > 0) setEmpresaSeleccionada(res.data.empresas[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!empresaSeleccionada) return;
    api.get(`/reportes/comparativo/${empresaSeleccionada}?meses=${mesesComp}`)
      .then(res => {
        setComparativo(res.data.comparativo.map(p => ({
          periodo: `${MESES_SHORT[p.mes - 1]} ${String(p.anio).slice(2)}`,
          'Haberes': Math.round(p.totalHaberes),
          'Neto': Math.round(p.totalNeto),
        })));
      })
      .catch(() => setComparativo([]));
  }, [empresaSeleccionada, mesesComp]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#0A5CFF] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return <p className="text-gray-500">Error cargando datos</p>;

  const { resumen, empresas, periodo } = data;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 px-6 py-5 text-slate-100 shadow-[0_20px_50px_rgba(2,6,23,0.30)]">
        <div className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-[#0A5CFF]/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-8 -bottom-14 h-28 w-28 rounded-full bg-[#0A5CFF]/15 blur-3xl" />
        <p className="relative text-xs uppercase tracking-[0.14em] text-slate-300">Resumen del estudio</p>
        <h1 className="relative text-2xl font-semibold tracking-tight text-white mt-1">Panel principal</h1>
        <p className="relative text-slate-300 text-sm mt-1">Período actual: {mesNombre(periodo.mes)} {periodo.anio}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={BuildingOfficeIcon} label="Empresas activas" value={resumen.cantEmpresas} color="blue" />
        <StatCard icon={UsersIcon} label="Empleados activos" value={resumen.cantEmpleados} color="green" />
        <StatCard icon={CalculatorIcon} label="Liquidaciones del mes" value={resumen.liquidacionesMes} color="purple" />
        <StatCard icon={CurrencyDollarIcon} label="Total haberes mes" value={formatMoney(resumen.totalMensual)} color="orange" />
      </div>

      {/* Pendientes de hoy */}
      <PanelPendientes navigate={navigate} />

      {/* Cotizaciones dólar */}
      <PanelDolar />

      {/* Accesos ARCA / AFIP */}
      <PanelARCA />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Tabla empresas */}
        <div className={`${PANEL_CLASS} xl:col-span-2`}>
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight text-gray-900">Estado de empresas — {mesNombre(periodo.mes)} {periodo.anio}</h2>
            <button onClick={() => navigate('/empresas')} className="text-sm text-[#0A5CFF] hover:text-[#0848c8] font-medium">Ver todas →</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Empresa</th>
                  <th className="px-5 py-3 text-center">Empleados</th>
                  <th className="px-5 py-3 text-center">Estado período</th>
                  <th className="px-5 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {empresas.map(emp => (
                  <tr key={emp.id} className="table-row-hover cursor-pointer" onClick={() => navigate(`/empresas/${emp.id}`)}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{emp.razonSocial}</p>
                      <p className="text-xs text-gray-400">{emp.cuit}</p>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="inline-flex items-center rounded-full bg-[#EAF0FF] px-2.5 py-0.5 text-xs font-semibold text-[#0A5CFF]">
                        {emp._count.empleados}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center"><EstadoPeriodo periodo={emp.periodos} /></td>
                    <td className="px-5 py-3.5 text-center">
                      <button onClick={e => { e.stopPropagation(); navigate(`/liquidaciones?empresaId=${emp.id}`); }}
                        className="text-xs text-[#0A5CFF] hover:text-[#0848c8] font-medium">Liquidar</button>
                    </td>
                  </tr>
                ))}
                {empresas.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No hay empresas registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar derecho */}
        <div className="space-y-4">
          <div className={`${PANEL_CLASS} p-5`}>
            <h3 className="font-semibold text-gray-900 mb-3 text-sm tracking-tight">Acciones rápidas</h3>
            <div className="space-y-2">
              {[
                {
                  label: 'Nueva liquidación',
                  path: '/liquidaciones',
                  color: 'inline-flex w-full items-center justify-center rounded-xl bg-[#0A5CFF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0848c8]',
                },
                {
                  label: 'Cargar comprobante IVA',
                  path: '/iva/comprobantes',
                  color: 'inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#0A5CFF]/20 hover:bg-[#F3F7FF]',
                },
                {
                  label: 'Nuevo asiento contable',
                  path: '/contabilidad/asientos',
                  color: 'inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#0A5CFF]/20 hover:bg-[#F3F7FF]',
                },
                {
                  label: 'Ver empleados',
                  path: '/empleados',
                  color: 'inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#0A5CFF]/20 hover:bg-[#F3F7FF]',
                },
                {
                  label: 'Importar novedades',
                  path: '/importar-novedades',
                  color: 'inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#0A5CFF]/20 hover:bg-[#F3F7FF]',
                },
                {
                  label: 'Agenda de vencimientos',
                  path: '/vencimientos',
                  color: 'inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#0A5CFF]/20 hover:bg-[#F3F7FF]',
                },
              ].map(({ label, path, color }) => (
                <button key={path} onClick={() => navigate(path)} className={color}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <VencimientosWidget />
        </div>
      </div>

      {/* Noticias ARCA / AFIP */}
      <PanelNoticias />

      {/* Gráfico comparativo */}
      {empresas.length > 0 && (
        <div className={`${PANEL_CLASS} p-5`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="font-semibold tracking-tight text-gray-900">Evolución de haberes — últimos {mesesComp} meses</h2>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
                {[6, 12, 24].map(n => (
                  <button key={n} onClick={() => setMesesComp(n)}
                    className={`px-3 py-1 rounded-md font-medium transition ${mesesComp === n ? 'bg-[#0A5CFF] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {n}m
                  </button>
                ))}
              </div>
              <select className="input w-64 text-sm" value={empresaSeleccionada} onChange={e => setEmpresaSeleccionada(e.target.value)}>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
              </select>
            </div>
          </div>
          {comparativo.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={comparativo} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={formatTooltipMoney} />
                <Legend />
                <Bar dataKey="Haberes" fill="#0f172a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Neto" fill="#06b6d4" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
              Sin liquidaciones históricas para mostrar
            </div>
          )}
        </div>
      )}
    </div>
  );
}
