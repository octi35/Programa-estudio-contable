# Sistema de Liquidación de Sueldos — Estudio Contable

Sistema moderno para gestión de sueldos en estudios contables argentinos.
Reemplaza al software **SU2007/SueldosV5x** de Nacional Software.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Tailwind CSS + Vite |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL + Prisma ORM |
| PDF | PDFKit |
| Excel | ExcelJS |
| Auth | JWT |

## Funcionalidades implementadas

### Gestión
- ABM de empresas (clientes del estudio) con CUIT, convenio colectivo
- ABM de empleados (legajos) con CUIL, categoría, básico, obra social
- Historial de altas, bajas y modificaciones salariales
- ABM de conceptos de liquidación configurables por convenio

### Liquidaciones
- Liquidación mensual automática para toda la nómina de una empresa
- SAC (aguinaldo) 1° y 2° semestre con mejor remuneración del semestre
- Vacaciones según antigüedad (LCT art. 150: 14/21/28/35 días hábiles)
- Cálculo proporcional por días trabajados
- Horas extras 50% (días hábiles) y 100% (feriados/domingos)
- Antigüedad (1% por año completo, máximo 100%)
- Presentismo (8.33% del básico proporcional)

### Normativa argentina (LCT 20.744)
- Aportes empleado: jubilación 11% + obra social 3% + INSSJP/PAMI 3% = 17%
- Contribuciones empleador: jubilación 16% + OS 6% + INSSJP 1.5% + ART + Fondo desempleo
- Sindicato 2% + cuota solidaria (configurable por convenio)
- Convenios cargados: Comercio (130/75), Construcción (76/75), Gastronómico (507/07),
  Metalúrgico (160/75), Casas Particulares (Decreto 326/56), LCT general

### Documentos y exportaciones
- Recibo de sueldo en PDF (formato doble: original + duplicado)
- Libro de Sueldos Digital (LSD) en Excel formato AFIP
- Exportación F.931 / SICOSS en texto plano para presentación AFIP
- Carga de documentos adjuntos (contratos, DNI, certificados)

### Panel y reportes
- Dashboard con estado de liquidación por empresa y período
- Resumen de totales (haberes, descuentos, neto, contribuciones empleador)
- Comparativo histórico de períodos

## Inicio rápido con Docker

```bash
git clone <repo>
cd Programa-estudio-contable
docker compose up -d

# Frontend: http://localhost
# API:      http://localhost:3001
# Login:    admin@estudiodemo.com  /  Admin1234!
```

## Desarrollo local

**Backend**
```bash
cd backend
cp .env.example .env          # completar DATABASE_URL
npm install
npx prisma migrate dev
node prisma/seed.js
npm run dev                   # API en http://localhost:3001
```

**Frontend**
```bash
cd frontend
npm install
npm run dev                   # App en http://localhost:5173
```

## Estructura del proyecto

```
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # Esquema completo (12 modelos)
│   │   └── seed.js                 # Datos iniciales: convenios, conceptos, empresa demo
│   └── src/
│       ├── middleware/             # auth JWT, errorHandler, validate
│       ├── routes/                 # empresas, empleados, convenios, conceptos,
│       │                           # liquidaciones, documentos, reportes
│       ├── services/
│       │   ├── liquidacionService.js   # Motor de cálculo: mensual, SAC, vacaciones
│       │   ├── pdfService.js           # Recibos PDF doble hoja con PDFKit
│       │   └── lsdService.js           # LSD Excel (ExcelJS) + F.931 AFIP
│       └── utils/
│           └── calculosLaborales.js    # Fórmulas LCT: antigüedad, SAC, vacaciones,
│                                       # aportes, contribuciones, horas extras
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.jsx           # Panel con estado por empresa y período
        │   ├── Empresas.jsx / EmpresaDetalle.jsx
        │   ├── Empleados.jsx / EmpleadoDetalle.jsx
        │   ├── Liquidaciones.jsx       # Listado + cálculo masivo por período
        │   ├── LiquidacionDetalle.jsx  # Recibo visual interactivo
        │   └── Conceptos.jsx           # ABM conceptos por convenio
        └── utils/format.js             # Helpers de formato monetario y fechas
```

## API REST — Endpoints principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/login` | Autenticación → JWT |
| GET | `/api/empresas` | Listado paginado y buscable |
| POST | `/api/empresas` | Crear empresa |
| GET | `/api/empleados` | Listado filtrable por empresa |
| POST | `/api/empleados` | Crear empleado (genera novedad de alta) |
| POST | `/api/empleados/:id/baja` | Baja con motivo y fecha |
| POST | `/api/liquidaciones/calcular` | Calcular liquidación individual |
| POST | `/api/liquidaciones/periodo` | Liquidar nómina completa de una empresa |
| POST | `/api/liquidaciones/:id/confirmar` | Confirmar liquidación |
| GET | `/api/liquidaciones/:id/recibo` | PDF del recibo de sueldo |
| GET | `/api/documentos/lsd/:id/:anio/:mes` | LSD en Excel para AFIP |
| GET | `/api/documentos/f931/:id/:anio/:mes` | F.931 / SICOSS |
| GET | `/api/reportes/panel-estudio` | Datos del dashboard principal |

## Migración desde archivos DBF (Nacional Software)

1. Exportar EMPRESAS.DBF y LEGAJOS.DBF a CSV con un lector dBASE
2. Usar los endpoints REST en lote para importar empresas y empleados
3. Los archivos LSD históricos (.xlsx) pueden cargarse como documentos adjuntos

## Licencia

MIT