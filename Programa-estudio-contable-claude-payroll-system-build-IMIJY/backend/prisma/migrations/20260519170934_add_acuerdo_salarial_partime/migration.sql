-- AlterTable
ALTER TABLE "convenios" ADD COLUMN     "horasSemanales" INTEGER NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "acuerdos_salariales" (
    "id" TEXT NOT NULL,
    "convenioId" TEXT,
    "descripcion" TEXT NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "tipo" "TipoConcepto" NOT NULL,
    "monto" DECIMAL(12,2),
    "porcentaje" DECIMAL(8,4),
    "absorbible" BOOLEAN NOT NULL DEFAULT true,
    "absorbido" BOOLEAN NOT NULL DEFAULT false,
    "cuota" INTEGER,
    "totalCuotas" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acuerdos_salariales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acuerdos_salariales_convenioId_vigenciaDesde_idx" ON "acuerdos_salariales"("convenioId", "vigenciaDesde");

-- CreateIndex
CREATE INDEX "acuerdos_salariales_vigenciaDesde_absorbido_idx" ON "acuerdos_salariales"("vigenciaDesde", "absorbido");

-- AddForeignKey
ALTER TABLE "acuerdos_salariales" ADD CONSTRAINT "acuerdos_salariales_convenioId_fkey" FOREIGN KEY ("convenioId") REFERENCES "convenios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
