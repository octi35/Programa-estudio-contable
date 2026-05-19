-- CreateEnum
CREATE TYPE "EstadoDeclaracion" AS ENUM ('BORRADOR', 'PRESENTADA', 'PAGADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "TipoCuentaBancaria" AS ENUM ('CUENTA_CORRIENTE', 'CAJA_AHORRO', 'PLAZO_FIJO');

-- CreateEnum
CREATE TYPE "EstadoFacturaHonorarios" AS ENUM ('PENDIENTE', 'ENVIADA', 'COBRADA', 'ANULADA');

-- CreateTable
CREATE TABLE "ganancias_empleados" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "conyuge" BOOLEAN NOT NULL DEFAULT false,
    "hijos" INTEGER NOT NULL DEFAULT 0,
    "hijosDiscapacitados" INTEGER NOT NULL DEFAULT 0,
    "alquiler" DECIMAL(12,2),
    "hipoteca" DECIMAL(12,2),
    "medicinaPrivada" DECIMAL(12,2),
    "sepelio" DECIMAL(12,2),
    "donaciones" DECIMAL(12,2),
    "otrasDeducciones" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ganancias_empleados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaraciones_iibb" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "jurisdiccion" TEXT NOT NULL,
    "regimen" TEXT NOT NULL DEFAULT 'DIRECTO',
    "baseImponible" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "alicuota" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "impuesto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retenciones" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percepciones" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoDeclaracion" NOT NULL DEFAULT 'BORRADOR',
    "fechaVencimiento" TIMESTAMP(3),
    "fechaPresentacion" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declaraciones_iibb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_comprobantes" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,
    "medioPago" TEXT,
    "referencia" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_bancarias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "sucursal" TEXT,
    "tipoCuenta" "TipoCuentaBancaria" NOT NULL DEFAULT 'CUENTA_CORRIENTE',
    "numeroCuenta" TEXT NOT NULL,
    "cbu" TEXT,
    "alias" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_bancarios" (
    "id" TEXT NOT NULL,
    "cuentaBancariaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "referencia" TEXT,
    "debe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "haber" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "asientoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_bancarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_cambio" (
    "id" TEXT NOT NULL,
    "estudioId" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'OFICIAL',
    "compra" DECIMAL(10,4) NOT NULL,
    "venta" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_cambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "honorarios_clientes" (
    "id" TEXT NOT NULL,
    "estudioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "periodicidad" TEXT NOT NULL DEFAULT 'MENSUAL',
    "importe" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "honorarios_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas_honorarios" (
    "id" TEXT NOT NULL,
    "estudioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estado" "EstadoFacturaHonorarios" NOT NULL DEFAULT 'PENDIENTE',
    "fechaCobro" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facturas_honorarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monotributo_clientes" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "categoriaActual" TEXT NOT NULL,
    "fechaUltimaCategoria" TIMESTAMP(3),
    "ingresosBrutosMensual" DECIMAL(12,2),
    "cuotaMensual" DECIMAL(12,2),
    "vencimientoCuota" INTEGER NOT NULL DEFAULT 20,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monotributo_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_presupuesto" (
    "id" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "cuentaContableId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ganancias_empleados_empleadoId_anio_key" ON "ganancias_empleados"("empleadoId", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "declaraciones_iibb_empresaId_anio_mes_jurisdiccion_key" ON "declaraciones_iibb"("empresaId", "anio", "mes", "jurisdiccion");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_cambio_estudioId_moneda_fecha_tipo_key" ON "tipos_cambio"("estudioId", "moneda", "fecha", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "monotributo_clientes_empresaId_key" ON "monotributo_clientes"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "presupuestos_empresaId_anio_key" ON "presupuestos"("empresaId", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "items_presupuesto_presupuestoId_cuentaContableId_mes_key" ON "items_presupuesto"("presupuestoId", "cuentaContableId", "mes");

-- AddForeignKey
ALTER TABLE "ganancias_empleados" ADD CONSTRAINT "ganancias_empleados_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaraciones_iibb" ADD CONSTRAINT "declaraciones_iibb_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_comprobantes" ADD CONSTRAINT "pagos_comprobantes_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes_iva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_bancarias" ADD CONSTRAINT "cuentas_bancarias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_cuentaBancariaId_fkey" FOREIGN KEY ("cuentaBancariaId") REFERENCES "cuentas_bancarias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monotributo_clientes" ADD CONSTRAINT "monotributo_clientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_presupuesto" ADD CONSTRAINT "items_presupuesto_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "presupuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_presupuesto" ADD CONSTRAINT "items_presupuesto_cuentaContableId_fkey" FOREIGN KEY ("cuentaContableId") REFERENCES "cuentas_contables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
