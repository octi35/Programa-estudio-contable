// Exportación de asientos a formatos importables por software contable externo.
// Soporta: CSV genérico, Tango Gestión, Bejerman.

function fmtFecha(d, sep = '/') {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return [dd, mm, yyyy].join(sep);
}

function fmtNum(n, decimales = 2) {
  return Number(n || 0).toFixed(decimales);
}

function escapeCsv(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * CSV genérico — importable en la mayoría de los software contables.
 * Una línea por LíneaAsiento. Campos:
 *   id_asiento, fecha, numero, descripcion, glosa, cuenta_codigo, cuenta_nombre,
 *   debe, haber, linea_descripcion, origen, origen_id
 */
function aCsvGenerico(asientos) {
  const headers = [
    'id_asiento','fecha','numero','descripcion','glosa',
    'cuenta_codigo','cuenta_nombre','debe','haber',
    'linea_descripcion','origen','origen_id',
  ];
  const lines = [headers.join(',')];
  for (const a of asientos) {
    for (const l of a.lineas || []) {
      lines.push([
        a.id, fmtFecha(a.fecha, '-'), a.numero || '',
        a.descripcion, a.glosa || '',
        l.cuentaContable?.codigo || '',
        l.cuentaContable?.nombre || '',
        fmtNum(l.debe), fmtNum(l.haber),
        l.descripcion || '',
        a.origen || 'MANUAL', a.origenId || '',
      ].map(escapeCsv).join(','));
    }
  }
  return lines.join('\n');
}

/**
 * Tango Gestión — formato típico TXT separado por pipe.
 * Estructura por asiento:
 *   NRO_ASIENTO|FECHA|TIPO|CONCEPTO|TOTAL_DEBE|TOTAL_HABER
 *   Por línea:
 *   NRO_ASIENTO|CUENTA|DEBE|HABER|DETALLE
 *
 * Devuelve un objeto con dos archivos: cabeceras.txt y movimientos.txt
 */
function aTango(asientos) {
  const cabeceras = [];
  const movimientos = [];

  asientos.forEach((a, idx) => {
    const nro = a.numero || (idx + 1);
    cabeceras.push([
      nro,
      fmtFecha(a.fecha),
      a.origen === 'CIERRE' ? 'C' : a.origen === 'APERTURA' ? 'A' : 'N',
      (a.descripcion || '').slice(0, 60),
      fmtNum(a.totalDebe),
      fmtNum(a.totalHaber),
    ].join('|'));

    for (const l of a.lineas || []) {
      movimientos.push([
        nro,
        l.cuentaContable?.codigo || '',
        fmtNum(l.debe),
        fmtNum(l.haber),
        (l.descripcion || '').slice(0, 100),
      ].join('|'));
    }
  });

  return {
    'cabeceras_tango.txt': cabeceras.join('\r\n'),
    'movimientos_tango.txt': movimientos.join('\r\n'),
  };
}

/**
 * Bejerman — formato CSV con cabecera específica.
 * Una línea por línea de asiento. Encabezados similares a planilla típica.
 */
function aBejerman(asientos) {
  const headers = [
    'Fecha','Asiento','Cuenta','Descripcion_Cuenta','Debe','Haber',
    'Glosa','Centro_Costo','Comprobante',
  ];
  const lines = [headers.join(';')];
  asientos.forEach((a, idx) => {
    const nro = a.numero || (idx + 1);
    for (const l of a.lineas || []) {
      lines.push([
        fmtFecha(a.fecha),
        nro,
        l.cuentaContable?.codigo || '',
        l.cuentaContable?.nombre || '',
        fmtNum(l.debe).replace('.', ','),
        fmtNum(l.haber).replace('.', ','),
        (a.descripcion || '').replace(/;/g, ',').slice(0, 80),
        '', // Centro de costo (no usado)
        a.numero || '',
      ].map(escapeCsv).join(';'));
    }
  });
  return lines.join('\r\n');
}

function exportar(asientos, formato) {
  switch ((formato || 'csv').toLowerCase()) {
    case 'tango':
      return { tipo: 'tango', archivos: aTango(asientos) };
    case 'bejerman':
      return { tipo: 'bejerman', contenido: aBejerman(asientos), mime: 'text/csv', nombre: 'asientos_bejerman.csv' };
    case 'csv':
    default:
      return { tipo: 'csv', contenido: aCsvGenerico(asientos), mime: 'text/csv', nombre: 'asientos.csv' };
  }
}

module.exports = { exportar, aCsvGenerico, aTango, aBejerman };
