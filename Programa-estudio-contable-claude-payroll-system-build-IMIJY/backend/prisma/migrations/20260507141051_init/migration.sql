-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'CONTADOR', 'OPERADOR');

-- CreateEnum
CREATE TYPE "ModalidadContrato" AS ENUM ('TIEMPO_INDETERMINADO', 'PLAZO_FIJO', 'EVENTUAL', 'PASANTIA', 'APRENDIZAJE');

-- CreateEnum
CREATE TYPE "TipoJornada" AS ENUM ('COMPLETA', 'PART_TIME', 'TIEMPO_PARCIAL');

-- CreateEnum
CREATE TYPE "MotivoEgreso" AS ENUM ('RENUNCIA', 'DESPIDO_SIN_CAUSA', 'DESPIDO_CON_CAUSA', 'MUTUO_ACUERDO', 'JUBILACION', 'FALLECIMIENTO', 'VENCIMIENTO_CONTRATO');

-- CreateEnum
CREATE TYPE "TipoNovedad" AS ENUM ('ALTA', 'BAJA', 'MODIFICACION_SUELDO', 'CAMBIO_CATEGORIA', 'LICENCIA', 'VACACIONES', 'SUSPENSION', 'EMBARGO');

-- CreateEnum
CREATE TYPE "TipoConcepto" AS ENUM ('REMUNERATIVO', 'NO_REMUNERATIVO', 'DEDUCCION', 'APORTE_EMPLEADOR');

-- CreateEnum
CREATE TYPE "NaturalezaConcepto" AS ENUM ('HABER', 'DESCUENTO', 'INFORMATIVO');

-- CreateEnum
CREATE TYPE "UnidadConcepto" AS ENUM ('IMPORTE', 'PORCENTAJE', 'HORAS', 'DIAS', 'CANTIDAD');

-- CreateEnum
CREATE TYPE "TipoLiquidacion" AS ENUM ('MENSUAL', 'SAC_JUNIO', 'SAC_DICIEMBRE', 'VACACIONES', 'LIQUIDACION_FINAL', 'COMPLEMENTO', 'RETROACTIVO');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('ABIERTO', 'PROCESADO', 'CERRADO');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('BORRADOR', 'CALCULADO', 'CONFIRMADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('RECIBO_SUELDO', 'LSD', 'F931', 'ALTA_EMPLEADO', 'BAJA_EMPLEADO', 'CONTRATO', 'DNI', 'CUIL', 'CERTIFICADO_TRABAJO', 'ART80_LCT', 'OTRO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'CONTADOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "estudioId" TEXT,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estudios" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "matricula" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estudios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convenios" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "convenios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tablas_sueldo" (
    "id" TEXT NOT NULL,
    "convenioId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT,
    "basicoMensual" DECIMAL(12,2) NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tablas_sueldo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreFantasia" TEXT,
    "cuit" TEXT NOT NULL,
    "domicilio" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "actividadPrincipal" TEXT,
    "convenioId" TEXT,
    "estudioId" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fechaInicio" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleados" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "legajoNumero" TEXT,
    "apellido" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuil" TEXT NOT NULL,
    "dni" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "sexo" TEXT,
    "estadoCivil" TEXT,
    "domicilio" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "cbu" TEXT,
    "banco" TEXT,
    "fechaIngreso" TIMESTAMP(3) NOT NULL,
    "fechaEgreso" TIMESTAMP(3),
    "motivoEgreso" "MotivoEgreso",
    "categoria" TEXT,
    "puesto" TEXT,
    "modalidadContrato" "ModalidadContrato" NOT NULL DEFAULT 'TIEMPO_INDETERMINADO',
    "jornadaTrabajo" "TipoJornada" NOT NULL DEFAULT 'COMPLETA',
    "horasSemanales" DECIMAL(5,2),
    "basicoMensual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "obraSocialCodigo" TEXT,
    "obraSocialNombre" TEXT,
    "afiliado" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novedades_empleados" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoNovedad" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fechaDesde" TIMESTAMP(3) NOT NULL,
    "fechaHasta" TIMESTAMP(3),
    "valor" DECIMAL(12,2),
    "documentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novedades_empleados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conceptos" (
    "id" TEXT NOT NULL,
    "convenioId" TEXT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "TipoConcepto" NOT NULL,
    "naturaleza" "NaturalezaConcepto" NOT NULL,
    "unidad" "UnidadConcepto" NOT NULL DEFAULT 'IMPORTE',
    "formula" TEXT,
    "porcentaje" DECIMAL(8,4),
    "importe" DECIMAL(12,2),
    "imprimible" BOOLEAN NOT NULL DEFAULT true,
    "remunerativo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos_liquidacion" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipo" "TipoLiquidacion" NOT NULL DEFAULT 'MENSUAL',
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'ABIERTO',
    "fechaCierre" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodos_liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipo" "TipoLiquidacion" NOT NULL,
    "diasTrabajados" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "diasNoTrabajados" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "horasTrabajadas" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "totalHaberes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDescuentos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalNeto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalContribuciones" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "reciboPdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_liquidaciones" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,4),
    "valorUnitario" DECIMAL(12,2),
    "importe" DECIMAL(12,2) NOT NULL,
    "naturaleza" "NaturalezaConcepto" NOT NULL,
    "tipo" "TipoConcepto" NOT NULL,
    "remunerativo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detalle_liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "empleadoId" TEXT,
    "tipo" "TipoDocumento" NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "tamanio" INTEGER,
    "anio" INTEGER,
    "mes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "estudios_cuit_key" ON "estudios"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "convenios_codigo_key" ON "convenios"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cuit_key" ON "empresas"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "empleados_empresaId_cuil_key" ON "empleados"("empresaId", "cuil");

-- CreateIndex
CREATE UNIQUE INDEX "conceptos_convenioId_codigo_key" ON "conceptos"("convenioId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_liquidacion_empresaId_anio_mes_tipo_key" ON "periodos_liquidacion"("empresaId", "anio", "mes", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_periodoId_empleadoId_key" ON "liquidaciones"("periodoId", "empleadoId");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "estudios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tablas_sueldo" ADD CONSTRAINT "tablas_sueldo_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "estudios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedades_empleados" ADD CONSTRAINT "novedades_empleados_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedades_empleados" ADD CONSTRAINT "novedades_empleados_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conceptos" ADD CONSTRAINT "conceptos_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos_liquidacion" ADD CONSTRAINT "periodos_liquidacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "periodos_liquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_liquidaciones" ADD CONSTRAINT "detalle_liquidaciones_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "liquidaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_liquidaciones" ADD CONSTRAINT "detalle_liquidaciones_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
