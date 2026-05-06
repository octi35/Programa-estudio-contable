import dayjs from 'dayjs';
import 'dayjs/locale/es';
dayjs.locale('es');

export const formatMoney = (n) =>
  `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (d) => d ? dayjs(d).format('DD/MM/YYYY') : '-';

export const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

export const mesNombre = (m) => MESES[(m || 1) - 1];

export const estadoLiquidacionLabel = {
  BORRADOR: { label: 'Borrador', cls: 'badge-gray' },
  CALCULADO: { label: 'Calculado', cls: 'badge-blue' },
  CONFIRMADO: { label: 'Confirmado', cls: 'badge-green' },
  ANULADO: { label: 'Anulado', cls: 'badge-red' },
};

export const tipoLiquidacionLabel = {
  MENSUAL: 'Sueldo Mensual',
  SAC_JUNIO: 'SAC 1° Sem.',
  SAC_DICIEMBRE: 'SAC 2° Sem.',
  VACACIONES: 'Vacaciones',
  LIQUIDACION_FINAL: 'Liquidación Final',
  COMPLEMENTO: 'Complemento',
};
