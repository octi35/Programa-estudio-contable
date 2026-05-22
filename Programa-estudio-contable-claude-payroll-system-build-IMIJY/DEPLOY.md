# Guía de despliegue — Frontend en Vercel + Backend en Railway

Arquitectura en producción:

```
Navegador ──▶ Vercel (React estático)  ──HTTPS──▶  Railway (Express + cron + uploads)
                                                         │
                                                         ▼
                                                  Postgres (Neon)
```

El frontend (Vite) se sirve estático en Vercel y llama por HTTPS al backend en
Railway. La autenticación es por **token Bearer** (guardado en localStorage), así
que funciona entre dominios distintos sin depender de cookies.

---

## 1. Base de datos — Neon (Postgres gratis)

1. Entrá a https://neon.tech y creá una cuenta (podés usar tu cuenta de GitHub).
2. **Create project** → elegí región (ej. AWS `us-east-2`) → nombre `estudio-contable`.
3. Copiá la **connection string** que te muestra. Tiene esta forma:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Guardala: es tu `DATABASE_URL`. La vas a usar en Railway.

> Alternativa: Supabase (https://supabase.com) → Project Settings → Database →
> Connection string (modo "Session"). Igual de válido.

---

## 2. Backend — Railway

1. Entrá a https://railway.app e iniciá sesión con GitHub.
2. **New Project → Deploy from GitHub repo** → elegí `octi35/Programa-estudio-contable`.
3. En el servicio creado, **Settings**:
   - **Root Directory**: `Programa-estudio-contable-claude-payroll-system-build-IMIJY/backend`
   - Railway detecta el `Dockerfile` y el `railway.json` automáticamente
     (aplica migraciones y arranca; **no** corre el seed en cada deploy).
4. **Variables** (pestaña Variables) — agregá como mínimo:
   ```
   NODE_ENV=production
   DATABASE_URL=<la connection string de Neon del paso 1>
   JWT_SECRET=<un texto aleatorio largo, mínimo 32 caracteres>
   JWT_EXPIRES_IN=7d
   FRONTEND_URL=https://TU-APP.vercel.app    # se completa tras el paso 3
   PUBLIC_URL=https://TU-BACKEND.up.railway.app
   ```
   Opcionales (email, AFIP, WhatsApp, Sentry): ver `backend/.env.example`.
5. **Networking → Generate Domain** para obtener la URL pública del backend
   (ej. `https://estudio-contable-backend.up.railway.app`). Guardala.
6. Esperá a que el deploy quede en verde. Probá `https://TU-BACKEND.up.railway.app/health`
   → debe responder `{"status":"ok",...}`.

### Cargar datos iniciales (una sola vez)

El seed (usuario admin demo, convenios, plan de cuentas) **no** corre solo. Ejecutalo
una vez desde tu máquina apuntando a la base de Neon:

```bash
cd backend
DATABASE_URL="<connection string de Neon>" npm run prisma:seed
```

(En PowerShell: `$env:DATABASE_URL="..."; npm run prisma:seed`)

Esto crea el login demo: **admin@estudiodemo.com / Admin1234!** (cambialo después).

---

## 3. Frontend — Vercel

1. Entrá a https://vercel.com e iniciá sesión con GitHub.
2. **Add New → Project** → importá `octi35/Programa-estudio-contable`.
3. En la configuración del proyecto:
   - **Root Directory**: `Programa-estudio-contable-claude-payroll-system-build-IMIJY/frontend`
   - Framework Preset: **Vite** (se autodetecta por `vercel.json`).
4. **Environment Variables** → agregá:
   ```
   VITE_API_URL = https://TU-BACKEND.up.railway.app
   ```
   (la URL del paso 2.5, **sin** barra final y **sin** `/api`).
5. **Deploy**. Al terminar te da la URL `https://TU-APP.vercel.app`.

---

## 4. Conectar los dos dominios (CORS)

1. Volvé a Railway → Variables → poné en `FRONTEND_URL` la URL real de Vercel:
   ```
   FRONTEND_URL=https://TU-APP.vercel.app
   ```
   Si querés permitir también los deploys de preview de Vercel, podés listar varios
   orígenes separados por coma:
   ```
   FRONTEND_URL=https://TU-APP.vercel.app,https://TU-APP-git-main-tuuser.vercel.app
   ```
2. Railway redeploya solo. Listo: entrá a la URL de Vercel e iniciá sesión.

---

## Limitaciones conocidas en este esquema

- **Archivos subidos** (logos, adjuntos) se guardan en el disco de Railway. En el
  plan gratuito ese disco es efímero y se pierde al redeployar. Para persistirlos
  hay que agregar un **Volume** en Railway o mover los uploads a S3 / Vercel Blob.
- Los **cron jobs** corren dentro del proceso de Railway (siempre encendido), así
  que funcionan normalmente — a diferencia de un esquema 100% serverless.
- El **rate limiting** es en memoria; con varias instancias no se comparte. Para una
  instancia única (lo habitual al inicio) funciona bien.
