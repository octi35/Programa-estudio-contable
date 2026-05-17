-- CreateEnum
CREATE TYPE "ParentescoFamiliar" AS ENUM ('CONYUGE', 'HIJO', 'HIJA', 'PADRE', 'MADRE', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('ENFERMEDAD_INCULPABLE', 'ACCIDENTE_TRABAJO', 'LICENCIA_ORDINARIA', 'LICENCIA_ESPECIAL', 'FALTA_INJUSTIFICADA', 'LICENCIA_MATERNIDAD', 'LICENCIA_PATERNIDAD', 'DUELO', 'SUSPENSION_DISCIPLINARIA', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoPersona" AS ENUM ('PROVEEDOR', 'CLIENTE', 'AMBOS');

-- CreateEnum
CREATE TYPE "CondicionIVA" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'CONSUMIDOR_FINAL', 'NO_RESPONSABLE');

-- CreateEnum
CREATE TYPE "TipoMovimientoIVA" AS ENUM ('COMPRA', 'VENTA');

-- CreateEnum
CREATE TYPE "TipoComprobanteIVA" AS ENUM ('FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C', 'NOTA_DEBITO_A', 'NOTA_DEBITO_B', 'NOTA_DEBITO_C', 'RECIBO_A', 'RECIBO_B', 'RECIBO_C', 'LIQUIDACION_A', 'LIQUIDACION_B');

-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('ACTIVO', 'PASIVO', 'PATRIMONIO_NETO', 'RESULTADO_POSITIVO', 'RESULTADO_NEGATIVO');

-- CreateEnum
CREATE TYPE "NaturalezaCuenta" AS ENUM ('DEUDORA', 'ACREEDORA');

-- CreateEnum
CREATE TYPE "EstadoEjercicio" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "OrigenAsiento" AS ENUM ('MANUAL', 'IVA_COMPRAS', 'IVA_VENTAS', 'SUELDOS', 'APERTURA', 'CIERRE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoDocumento" ADD VALUE 'LIBRO_IVA';
ALTER TYPE "TipoDocumento" ADD VALUE 'DECLARACION_IVA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoNovedad" ADD VALUE 'HORA_EXTRA';
ALTER TYPE "TipoNovedad" ADD VALUE 'ADELANTO_SUELDO';
ALTER TYPE "TipoNovedad" ADD VALUE 'SEGURO_VIDA';
ALTER TYPE "TipoNovedad" ADD VALUE 'SEPELIO';
ALTER TYPE "TipoNovedad" ADD VALUE 'CREDITO_HIPOTECARIO';
ALTER TYPE "TipoNovedad" ADD VALUE 'OBRA_SOCIAL_PREPAGA';
ALTER TYPE "TipoNovedad" ADD VALUE 'DONACION';
ALTER TYPE "TipoNovedad" ADD VALUE 'DIAS_TRABAJADOS';
ALTER TYPE "TipoNovedad" ADD VALUE 'DIAS_NO_REMUNERATIVOS';
ALTER TYPE "TipoNovedad" ADD VALUE 'PERSONALIZADA';

-- AlterTable
ALTER TABLE "conceptos" ADD COLUMN     "esAuxiliar" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "empleados" ADD COLUMN     "convenioId" TEXT,
ADD COLUMN     "nacionalidad" TEXT,
ADD COLUMN     "orden" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sindicatoCodigo" TEXT,
ADD COLUMN     "sucursalId" TEXT;

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "logo" TEXT,
ADD COLUMN     "web" TEXT;

-- CreateTable
CREATE TABLE "familiares" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "parentesco" "ParentescoFamiliar" NOT NULL,
    "cuil" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "discapacitado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "familiares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ausentismos" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoAusencia" NOT NULL,
    "descripcion" TEXT,
    "fechaDesde" TIMESTAMP(3) NOT NULL,
    "fechaHasta" TIMESTAMP(3),
    "dias" INTEGER,
    "justificado" BOOLEAN NOT NULL DEFAULT true,
    "certificado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ausentismos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "domicilio" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "telefono" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametros_fiscales" (
    "id" TEXT NOT NULL,
    "estudioId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametros_fiscales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_acciones" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "estudioId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT,
    "entidadId" TEXT,
    "detalle" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_acciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores_clientes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoPersona" NOT NULL DEFAULT 'PROVEEDOR',
    "razonSocial" TEXT NOT NULL,
    "cuit" TEXT,
    "condicionIVA" "CondicionIVA" NOT NULL DEFAULT 'RESPONSABLE_INSCRIPTO',
    "domicilio" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes_iva" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "proveedorClienteId" TEXT,
    "tipoMovimiento" "TipoMovimientoIVA" NOT NULL,
    "tipoComprobante" "TipoComprobanteIVA" NOT NULL,
    "puntoVenta" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "numeroHasta" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL,
    "periodoFiscalAnio" INTEGER NOT NULL,
    "periodoFiscalMes" INTEGER NOT NULL,
    "netoGravado21" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netoGravado105" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netoGravado27" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netoNoGravado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "exento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva21" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva105" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva27" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percepcionIVA" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percepcionIIBB" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retencion" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobantes_iva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_comprobantes_iva" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "precioUnitario" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "alicuotaIVA" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "importe" DECIMAL(14,2) NOT NULL,
    "cuentaContableId" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_comprobantes_iva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_contables" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCuenta" NOT NULL,
    "naturaleza" "NaturalezaCuenta" NOT NULL,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "cuentaPadreId" TEXT,
    "permiteMovimientos" BOOLEAN NOT NULL DEFAULT true,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_contables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ejercicios_contables" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaCierre" TIMESTAMP(3),
    "estado" "EstadoEjercicio" NOT NULL DEFAULT 'ABIERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ejercicios_contables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asientos" (
    "id" TEXT NOT NULL,
    "ejercicioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "numero" INTEGER,
    "descripcion" TEXT NOT NULL,
    "glosa" TEXT,
    "origen" "OrigenAsiento" NOT NULL DEFAULT 'MANUAL',
    "origenId" TEXT,
    "totalDebe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalHaber" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_asiento" (
    "id" TEXT NOT NULL,
    "asientoId" TEXT NOT NULL,
    "cuentaContableId" TEXT NOT NULL,
    "descripcion" TEXT,
    "debe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lineas_asiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parametros_fiscales_estudioId_clave_vigenciaDesde_key" ON "parametros_fiscales"("estudioId", "clave", "vigenciaDesde");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_contables_empresaId_codigo_key" ON "cuentas_contables"("empresaId", "codigo");

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "familiares" ADD CONSTRAINT "familiares_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausentismos" ADD CONSTRAINT "ausentismos_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametros_fiscales" ADD CONSTRAINT "parametros_fiscales_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "estudios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores_clientes" ADD CONSTRAINT "proveedores_clientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes_iva" ADD CONSTRAINT "comprobantes_iva_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes_iva" ADD CONSTRAINT "comprobantes_iva_proveedorClienteId_fkey" FOREIGN KEY ("proveedorClienteId") REFERENCES "proveedores_clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_comprobantes_iva" ADD CONSTRAINT "items_comprobantes_iva_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes_iva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_comprobantes_iva" ADD CONSTRAINT "items_comprobantes_iva_cuentaContableId_fkey" FOREIGN KEY ("cuentaContableId") REFERENCES "cuentas_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_contables" ADD CONSTRAINT "cuentas_contables_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_contables" ADD CONSTRAINT "cuentas_contables_cuentaPadreId_fkey" FOREIGN KEY ("cuentaPadreId") REFERENCES "cuentas_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejercicios_contables" ADD CONSTRAINT "ejercicios_contables_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asientos" ADD CONSTRAINT "asientos_ejercicioId_fkey" FOREIGN KEY ("ejercicioId") REFERENCES "ejercicios_contables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asientos" ADD CONSTRAINT "asientos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_asiento" ADD CONSTRAINT "lineas_asiento_asientoId_fkey" FOREIGN KEY ("asientoId") REFERENCES "asientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_asiento" ADD CONSTRAINT "lineas_asiento_cuentaContableId_fkey" FOREIGN KEY ("cuentaContableId") REFERENCES "cuentas_contables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
