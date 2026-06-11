-- CreateEnum
CREATE TYPE "BaseContribucion" AS ENUM ('REMUNERATIVO', 'BRUTO', 'PRESTACION_DINERARIA', 'FIJO');

-- CreateTable
CREATE TABLE "tipos_contribucion" (
    "id" TEXT NOT NULL,
    "estudioId" TEXT NOT NULL,
    "empresaId" TEXT,
    "convenioId" TEXT,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alicuota" DECIMAL(7,4) NOT NULL,
    "base" "BaseContribucion" NOT NULL DEFAULT 'REMUNERATIVO',
    "cuentaContableId" TEXT,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_contribucion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tipos_contribucion_estudioId_vigenciaDesde_idx" ON "tipos_contribucion"("estudioId", "vigenciaDesde");

-- CreateIndex
CREATE INDEX "tipos_contribucion_empresaId_idx" ON "tipos_contribucion"("empresaId");

-- CreateIndex
CREATE INDEX "tipos_contribucion_convenioId_idx" ON "tipos_contribucion"("convenioId");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_contribucion_estudioId_codigo_empresaId_convenioId_vi_key" ON "tipos_contribucion"("estudioId", "codigo", "empresaId", "convenioId", "vigenciaDesde");

-- AddForeignKey
ALTER TABLE "tipos_contribucion" ADD CONSTRAINT "tipos_contribucion_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "estudios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
