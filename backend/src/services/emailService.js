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

module.exports = { enviarRecibo, verificarConexion, enviarPasswordReset };
