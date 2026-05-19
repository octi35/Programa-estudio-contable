-- CreateTable
CREATE TABLE "conceptos_empleados" (
    "id" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "valor" DECIMAL(12,2),
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "vigenciaHasta" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conceptos_empleados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conceptos_empleados_empleadoId_activo_idx" ON "conceptos_empleados"("empleadoId", "activo");

-- AddForeignKey
ALTER TABLE "conceptos_empleados" ADD CONSTRAINT "conceptos_empleados_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conceptos_empleados" ADD CONSTRAINT "conceptos_empleados_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "conceptos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
