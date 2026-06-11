# EstudioPRO — Gestión integral para estudios contables argentinos

![CI](https://github.com/octi35/Programa-estudio-contable/actions/workflows/ci.yml/badge.svg)
![Node](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

Sistema web completo para estudios contables: **sueldos, IVA, contabilidad, impuestos, facturación electrónica e integraciones con ARCA (ex AFIP)** — pensado para reemplazar software de escritorio de los 2000 (SU2007/SueldosV5x) con una plataforma moderna, multiempresa y automatizada.

> 🧪 **Demo:** `admin@estudiodemo.com` / `Admin1234!`

---

## ✨ Lo que lo hace distinto

| Diferencial | Qué automatiza |
|---|---|
| 🛡️ **Control pre-cierre inteligente** | Antes de cerrar el período, detecta solo: netos negativos, variaciones >25% vs mes anterior, empleados activos sin liquidar, descuentos sobre el tope LCT art. 133, conceptos duplicados y recibos sin aportes de ley. Semáforo apto/no apto. |
| 👤 **Portal del empleado** | El estudio genera un link seguro (token firmado, 30 días) y el empleado ve sus recibos, los descarga en PDF y **firma conformidad** (queda fecha + IP). Se acabó el ida y vuelta de recibos por email. |
| 🧮 **Simulador de costo laboral** | "¿Cuánto me cuesta contratar a alguien de $X?" — bruto, bolsillo, contribuciones, provisión de SAC y costo anual en un clic. Ideal para responderle al cliente en el momento. |
| 📲 **Recibos por WhatsApp** | Envío masivo de recibos PDF a toda la nómina por WhatsApp con un clic. |
| 🤖 **Cierre automático y alertas** | Crons que cierran períodos, avisan vencimientos por email y revisan E-Ventanilla de ARCA. |
| 🧾 **Integración ARCA (ex AFIP)** | Facturación electrónica (WSFE) individual y masiva, Padrón A13 (consulta de CUIT real), E-Ventanilla, F.931/SICOSS y Libro de Sueldos Digital. |
| 📚 **Asientos automáticos** | Cada liquidación confirmada genera su asiento contable; exportación a Excel/formatos contables. |

## 📦 Módulos

- **Sueldos**: liquidación mensual/SAC/vacaciones/final según LCT 20.744, convenios (Comercio, UOCRA, gastronómicos, metalúrgicos, casas particulares), antigüedad, presentismo, horas extras, contribuciones patronales configurables con vigencias (Dec. 814/01), recibos PDF doble, LSD, F.931.
- **IVA**: libro compras/ventas, posición mensual, comprobantes con OCR (scaffold), proveedores/clientes.
- **Contabilidad**: plan de cuentas, asientos (manuales y automáticos), mayor, balance de sumas y saldos, estado de resultados, balance general, ejercicios.
- **Impuestos**: IIBB (convenio multilateral, coeficientes), Ganancias 4ª categoría, Monotributo (categorías y recategorización), agenda de vencimientos con alertas.
- **Finanzas**: cuentas bancarias con webhooks de movimientos, cuentas corrientes, presupuestos, tipos de cambio (dólar en vivo vía dolarapi).
- **Estudio**: honorarios y facturación a clientes, certificados laborales, usuarios con roles, log de auditoría completo, multi-tenant por estudio.

## 🏗️ Arquitectura

```
┌─────────────┐     /api (rewrite)     ┌──────────────┐      ┌─────────────┐
│   Frontend   │ ─────────────────────▶ │   Backend    │ ───▶ │ PostgreSQL  │
│ React+Vite   │                        │ Node+Express │      │  (Prisma)   │
│  (Vercel)    │                        │   (Render)   │      │ (Supabase)  │
└─────────────┘                        └──────┬───────┘      └─────────────┘
                                              │
                              ┌───────────────┼────────────────┐
                              ▼               ▼                ▼
                          ARCA (WSFE,     WhatsApp API     SMTP/Sentry
                          Padrón A13,     (recibos)        (alertas/
                          E-Ventanilla)                    observabilidad)
```

**Stack:** Node 20 + Express + Prisma 6 / React 18 + Tailwind + Vite / PostgreSQL 16 / Jest (120+ tests) / Docker Compose / GitHub Actions.

## 🚀 Inicio rápido

### Con Docker (recomendado)
```bash
git clone https://github.com/octi35/Programa-estudio-contable.git
cd Programa-estudio-contable
docker compose up -d
# Frontend: http://localhost — API: http://localhost:3001
```

### Desarrollo local
```bash
# Base de datos
docker compose up -d postgres

# Backend (http://localhost:3001)
cd backend && cp .env.example .env && npm install
npx prisma migrate dev && node prisma/seed.js && npm run dev

# Frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

### Tests
```bash
cd backend && npm test        # 120+ tests de motor de cálculo, contribuciones y controles
```

## ☁️ Deploy (gratis)

| Capa | Servicio | Config |
|---|---|---|
| Base de datos | [Supabase](https://supabase.com) free | crear proyecto, copiar la URL del *Session pooler* |
| Backend | [Render](https://render.com) free | New → Blueprint → este repo (usa `render.yaml`); setear `DATABASE_URL` y `FRONTEND_URL` |
| Frontend | [Vercel](https://vercel.com) free | importar repo, root `frontend/` (el rewrite de `vercel.json` apunta a Render) |

El contenedor del backend corre `prisma migrate deploy` + seed al arrancar: la primera levantada deja la base lista.

## 🔌 Integraciones ARCA (opcionales, por variables de entorno)

| Variable | Para qué |
|---|---|
| `AFIP_CUIT`, `AFIP_CERT`, `AFIP_KEY` | WSFE (facturación electrónica), Padrón A13, E-Ventanilla |
| `AFIP_PRODUCTION=true` | Cambia de homologación a producción |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Envío de recibos por WhatsApp (Meta Cloud API) |
| `SMTP_*` | Alertas de vencimientos por email |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Observabilidad backend / frontend |

Sin estas variables el sistema funciona igual: las integraciones se desactivan con degradación elegante.

## 📄 Licencia

MIT
