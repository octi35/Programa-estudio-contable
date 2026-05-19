-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "reciboColor" TEXT,
ADD COLUMN     "reciboFirma" TEXT,
ADD COLUMN     "reciboLayout" TEXT DEFAULT 'CLASICO',
ADD COLUMN     "reciboMostrarDuplicado" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reciboMostrarQR" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "estudios" ADD COLUMN     "webhookSecret" TEXT;

-- CreateTable
CREATE TABLE "coeficientes_cm" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "jurisdiccion" TEXT NOT NULL,
    "coeficiente" DECIMAL(8,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coeficientes_cm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coeficientes_cm_empresaId_anio_idx" ON "coeficientes_cm"("empresaId", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "coeficientes_cm_empresaId_anio_jurisdiccion_key" ON "coeficientes_cm"("empresaId", "anio", "jurisdiccion");

-- AddForeignKey
ALTER TABLE "coeficientes_cm" ADD CONSTRAINT "coeficientes_cm_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
