const express = require('express');
const router = express.Router();
const { auth, requireRol } = require('../middleware/auth');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// GET /api/admin/backup — descarga pg_dump de la base de datos
router.get('/backup', auth, requireRol('ADMIN'), async (req, res, next) => {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL no configurada' });

    const url = new URL(dbUrl);
    const host = url.hostname;
    const port = url.port || '5432';
    const dbname = url.pathname.replace('/', '');
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup_${dbname}_${timestamp}.sql`;

    const env = { ...process.env, PGPASSWORD: password };
    const cmd = `pg_dump -h ${host} -p ${port} -U ${user} -d ${dbname} --no-password --clean --if-exists`;

    const { stdout } = await execAsync(cmd, { env, maxBuffer: 200 * 1024 * 1024 });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(stdout);
  } catch (err) {
    if (err.message?.includes('pg_dump') || err.code === 127) {
      return res.status(503).json({ error: 'pg_dump no está disponible en el servidor. Instale postgresql-client.' });
    }
    next(err);
  }
});

// POST /api/admin/alertas-vencimientos/ejecutar — dispara el cron manualmente
// (sin esperar al horario programado). Útil para probar la configuración SMTP.
router.post('/alertas-vencimientos/ejecutar', auth, requireRol('ADMIN'), async (req, res, next) => {
  try {
    const { ejecutarCronAlertas } = require('../services/cronAlertas');
    const resumen = await ejecutarCronAlertas({ forzar: req.body?.forzar === true });
    res.json({ resumen, total: resumen.length });
  } catch (err) { next(err); }
});

// POST /api/admin/cierre-automatico/ejecutar — dispara el cierre automático manualmente
router.post('/cierre-automatico/ejecutar', auth, requireRol('ADMIN'), async (req, res, next) => {
  try {
    const { ejecutarCierreAutomatico } = require('../services/cronCierreAutomatico');
    const resumen = await ejecutarCierreAutomatico();
    res.json({ resumen, total: resumen.length });
  } catch (err) { next(err); }
});

module.exports = router;
