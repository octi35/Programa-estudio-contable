# 💼 Sistema de Liquidación de Sueldos — Estudio Contable

**Sistema moderno de liquidación de sueldos para estudios contables argentinos**, pensado como reemplazo directo del software legado **SU2007 / SueldosV5x** (Nacional Software), con motor de cálculo alineado a la LCT 20.744 y exportaciones listas para AFIP.

[![React](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)](#)
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](#)
[![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](#)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](#)
[![Vercel](https://img.shields.io/badge/Live_Demo-000000?logo=vercel&logoColor=white)](https://programa-estudio-contable.vercel.app)

🔗 **Demo en vivo:** [programa-estudio-contable.vercel.app](https://programa-estudio-contable.vercel.app) · Login: `admin@estudiodemo.com` / `Admin1234!`

🇦🇷 [Español](#-sobre-el-proyecto) | 🇬🇧 [English](#-about-the-project)

---

## 📌 Sobre el proyecto

Este proyecto nace de un caso real: un estudio contable argentino todavía liquidaba sueldos con software DBF/NTX de los años '90, sin backups confiables, sin API y sin forma de automatizar la presentación ante AFIP. La consigna fue **modernizar ese flujo de trabajo completo** — desde la carga de legajos hasta la generación del recibo y la exportación F.931/SICOSS — manteniendo intacta la lógica laboral vigente (convenios colectivos, aportes, SAC, vacaciones).

El resultado es un sistema full-stack que cualquier estudio contable chico o mediano podría adoptar mañana mismo, con Docker Compose para levantar todo en un comando.

## ✨ Características principales

- **Gestión de empresas y empleados**: ABM completo de empresas cliente (CUIT, convenio colectivo) y empleados (CUIL, categoría, básico, obra social), con historial de altas, bajas y modificaciones salariales.
- **Motor de liquidación**: cálculo mensual automático para toda la nómina, SAC (aguinaldo) con mejor remuneración del semestre, vacaciones según antigüedad (art. 150 LCT: 14/21/28/35 días), proporcionales por días trabajados, horas extra (50%/100%), antigüedad y presentismo.
- **Normativa argentina real**: aportes del empleado (jubilación 11% + obra social 3% + PAMI 3%), contribuciones patronales, sindicato y cuota solidaria configurables por convenio. Convenios precargados: Comercio, Construcción, Gastronómico, Metalúrgico, Casas Particulares y LCT general.
- **Documentos listos para AFIP**: recibo de sueldo en PDF (original + duplicado), Libro de Sueldos Digital (LSD) en Excel y exportación F.931/SICOSS en texto plano.
- **Panel y reportes**: dashboard con estado de liquidación por empresa/período, totales de haberes/descuentos/neto y comparativo histórico.
- **Migración asistida**: ruta documentada para importar datos desde los viejos archivos DBF (EMPRESAS.DBF, LEGAJOS.DBF) del software legado.

## 🛠️ Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Tailwind CSS + Vite |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL + Prisma ORM (12 modelos) |
| Generación de PDF | PDFKit |
| Generación de Excel | ExcelJS |
| Autenticación | JWT |
| Infraestructura | Docker Compose · Frontend en Vercel · Backend en Railway |

## 🚀 Cómo correrlo

### Opción rápida — Docker

```bash
git clone https://github.com/octi35/Programa-estudio-contable.git
cd Programa-estudio-contable
docker compose up -d

# Frontend: http://localhost
# API:      http://localhost:3001
# Login:    admin@estudiodemo.com / Admin1234!
```

### Desarrollo local

```bash
# Backend
cd backend
cp .env.example .env   # completar DATABASE_URL
npm install
npx prisma migrate dev
node prisma/seed.js
npm run dev             # API en http://localhost:3001

# Frontend (otra terminal)
cd frontend
npm install
npm run dev              # App en http://localhost:5173
```

## 📁 Estructura del proyecto

```
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Esquema completo (12 modelos)
│   │   └── seed.js              # Convenios, conceptos, empresa demo
│   └── src/
│       ├── middleware/          # auth JWT, errorHandler, validate
│       ├── routes/               # empresas, empleados, convenios, liquidaciones...
│       ├── services/
│       │   ├── liquidacionService.js  # Motor de cálculo: mensual, SAC, vacaciones
│       │   ├── pdfService.js          # Recibos PDF doble hoja
│       │   └── lsdService.js          # LSD Excel + F.931 AFIP
│       └── utils/calculosLaborales.js # Fórmulas LCT completas
└── frontend/
    └── src/
            ├── pages/                # Dashboard, Empresas, Empleados, Liquidaciones...
                    └── utils/format.js
                    ```

                    ## 🔌 API REST — Endpoints principales

                    | Método | Endpoint | Descripción |
                    |---|---|---|
                    | POST | `/api/auth/login` | Autenticación → JWT |
                    | GET/POST | `/api/empresas` | Listado / alta de empresas |
                    | GET/POST | `/api/empleados` | Listado / alta de empleados (genera novedad de alta) |
                    | POST | `/api/empleados/:id/baja` | Baja con motivo y fecha |
                    | POST | `/api/liquidaciones/calcular` | Calcular liquidación individual |
                    | POST | `/api/liquidaciones/periodo` | Liquidar nómina completa de una empresa |
                    | GET | `/api/liquidaciones/:id/recibo` | PDF del recibo de sueldo |
                    | GET | `/api/documentos/lsd/:id/:anio/:mes` | Libro de Sueldos Digital (Excel AFIP) |
                    | GET | `/api/documentos/f931/:id/:anio/:mes` | Exportación F.931 / SICOSS |
                    | GET | `/api/reportes/panel-estudio` | Datos del dashboard principal |

                    ## 📄 Licencia

                    MIT

                    ---

                    ## 🇬🇧 About the project

                    This project started from a real-world case: an Argentine accounting firm was still running payroll on 1990s DBF/NTX software, with no reliable backups, no API, and no way to automate tax authority (AFIP) filings. The brief was to **modernize that entire workflow** — from employee records to payslip generation and regulatory exports — while keeping the underlying labor-law logic (collective bargaining agreements, contributions, holiday pay, vacation accrual) fully correct.

                    The result is a full-stack system any small-to-mid-size accounting firm could adopt, with a one-command Docker Compose setup.

                    ### ✨ Key features

                    - **Company & employee management**: full CRUD for client companies and employee records, with a complete history of hires, terminations and salary changes.
                    - **Payroll engine**: automatic monthly payroll for an entire company roster, 13th-month bonus (SAC) calculation, seniority-based vacation days, prorated pay, overtime (50%/100%), seniority bonus and attendance bonus.
                    - **Real Argentine labor law**: employee contributions, employer contributions, union dues — all configurable per collective bargaining agreement. Preloaded agreements for retail, construction, gastronomy, metalworking, domestic work and general labor law.
                    - **Tax-ready documents**: PDF payslips, Digital Payroll Book (Excel) and plain-text F.931/SICOSS export for the Argentine tax authority.
                    - **Dashboard & reporting**: payroll status per company/period, totals breakdown and historical comparison.
                    - **Guided migration path**: documented process to import data from the legacy DBF files.

                    ### 🛠️ Tech stack

                    React 18 + Tailwind + Vite on the frontend; Node.js + Express + PostgreSQL + Prisma on the backend; PDFKit and ExcelJS for document generation; JWT auth; Docker Compose for local/dev infra, deployed on Vercel (frontend) + Railway (backend).

                    ### 🚀 Quick start

                    See the Docker/local dev commands above — they work the same regardless of language.

                    ---

                    ## 👤 Autor / Author

                    **Octavio Fakiani** — Full Stack Developer & Analista de Sistemas

                    - 🌐 Portfolio: [octaviofakiani.vercel.app](https://octaviofakiani.vercel.app/)
                    - 💼 LinkedIn: [octavio-fakiani](https://www.linkedin.com/in/octavio-fakiani-6662b5274/)
                    - 🐙 GitHub: [@octi35](https://github.com/octi35)
                    - ✉️ Email: octifaki@gmail.com
                    
