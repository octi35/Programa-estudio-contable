let nodemailer;
try { nodemailer = require('nodemailer'); } catch (_) { nodemailer = null; }

function getTransporter() {
  if (!nodemailer) throw new Error('nodemailer no instalado. Ejecute: npm install nodemailer en backend/');
  if (!process.env.SMTP_HOST) throw new Error('SMTP no configurado. Agregue SMTP_HOST, SMTP_USER y SMTP_PASS al archivo .env');

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function enviarRecibo(destinatario, nombre, pdfBuffer, nombreArchivo) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatario,
    subject: `Recibo de sueldo — ${nombre}`,
    html: `<p>Estimado/a <b>${nombre}</b>,</p><p>Adjuntamos su recibo de sueldo.</p><p>Saludos cordiales.</p>`,
    attachments: [{ filename: nombreArchivo, content: pdfBuffer, contentType: 'application/pdf' }],
  });
}

async function verificarConexion() {
  const transporter = getTransporter();
  await transporter.verify();
  return true;
}

async function enviarPasswordReset(destinatario, nombre, resetUrl) {
  const transporter = getTransporter();
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f5f7fa">
      <div style="background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
        <h2 style="margin:0 0 16px;color:#0f172a">Restablecer contraseña</h2>
        <p style="color:#374151">Hola <b>${nombre}</b>,</p>
        <p style="color:#374151">Recibimos una solicitud para restablecer tu contraseña en EstudioPRO.</p>
        <p style="color:#374151">Hacé clic en el siguiente botón para definir una nueva contraseña:</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${resetUrl}" style="background:#0a5cff;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Restablecer contraseña
          </a>
        </p>
        <p style="color:#6b7280;font-size:12px">El enlace expira en 60 minutos. Si no solicitaste este cambio, ignorá este mensaje.</p>
        <p style="color:#6b7280;font-size:12px;word-break:break-all;margin-top:24px">Si el botón no funciona, copiá esta URL en tu navegador:<br/>${resetUrl}</p>
      </div>
    </div>`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatario,
    subject: 'Restablecer contraseña — EstudioPRO',
    html,
  });
}

async function enviarAlertaVencimientos(destinatario, nombre, estudio, vencimientos) {
  const transporter = getTransporter();

  // Agrupa por empresa
  const porEmpresa = {};
  for (const v of vencimientos) {
    const key = v.empresa?.razonSocial || 'Sin empresa';
    (porEmpresa[key] = porEmpresa[key] || []).push(v);
  }

  const TIPO_COLOR = { F931: '#0a5cff', IVA: '#10b981', IIBB: '#f59e0b', MONOTRIBUTO: '#8b5cf6', GANANCIAS: '#ef4444', SUELDOS: '#06b6d4' };
  const fmtFecha = (f) => new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const colorDias = (n) => n <= 1 ? '#dc2626' : n <= 3 ? '#ea580c' : n <= 7 ? '#ca8a04' : '#6b7280';

  let html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f5f7fa">
      <div style="background:#0f172a;color:#fff;border-radius:8px 8px 0 0;padding:20px 24px">
        <h2 style="margin:0;font-size:18px">📅 Vencimientos próximos — ${estudio.razonSocial}</h2>
        <p style="margin:4px 0 0;color:#cbd5e1;font-size:13px">${vencimientos.length} vencimientos en los próximos 7 días</p>
      </div>
      <div style="background:#fff;border-radius:0 0 8px 8px;padding:24px;border:1px solid #e5e7eb;border-top:0">
        <p style="margin:0 0 16px;color:#374151;font-size:14px">Hola <b>${nombre}</b>,</p>
        <p style="margin:0 0 20px;color:#374151;font-size:14px">Te recordamos los vencimientos pendientes:</p>`;

  for (const [empresa, items] of Object.entries(porEmpresa)) {
    html += `
      <div style="margin-bottom:20px">
        <h3 style="margin:0 0 8px;font-size:14px;color:#0f172a;border-bottom:2px solid #e5e7eb;padding-bottom:6px">${empresa}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">`;
    for (const v of items) {
      const color = TIPO_COLOR[v.tipo] || '#6b7280';
      html += `
          <tr>
            <td style="padding:6px 0;width:90px">
              <span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">${v.tipo}</span>
            </td>
            <td style="padding:6px 0;color:#374151">${v.descripcion}</td>
            <td style="padding:6px 0;text-align:right;color:${colorDias(v.diasRestantes)};font-weight:600;white-space:nowrap">
              ${fmtFecha(v.fecha)}<br/>
              <span style="font-size:11px;font-weight:400">${v.diasRestantes <= 0 ? 'VENCIDO' : `en ${v.diasRestantes}d`}</span>
            </td>
          </tr>`;
    }
    html += '</table></div>';
  }

  html += `
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
          <p style="margin:0">Este es un resumen automático del sistema EstudioPRO.</p>
          <p style="margin:8px 0 0">Para deshabilitar estas alertas, agregá el parámetro fiscal <code>ALERTAS_EMAIL_VENCIMIENTOS</code> = <code>false</code> en la configuración del estudio.</p>
        </div>
      </div>
    </div>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatario,
    subject: `📅 ${vencimientos.length} vencimientos próximos — ${estudio.razonSocial}`,
    html,
  });
}

module.exports = { enviarRecibo, verificarConexion, enviarPasswordReset, enviarAlertaVencimientos };
