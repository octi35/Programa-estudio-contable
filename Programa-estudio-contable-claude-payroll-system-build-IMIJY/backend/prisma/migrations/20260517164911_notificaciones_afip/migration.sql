-- CreateTable
CREATE TABLE "notificaciones_afip" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mensajeIdAfip" TEXT,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT,
    "origen" TEXT,
    "prioridad" TEXT NOT NULL DEFAULT 'NORMAL',
    "categoria" TEXT,
    "fechaAfip" TIMESTAMP(3) NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "archivada" BOOLEAN NOT NULL DEFAULT false,
    "urlOriginal" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notificaciones_afip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_afip_empresaId_leida_idx" ON "notificaciones_afip"("empresaId", "leida");

-- CreateIndex
CREATE INDEX "notificaciones_afip_empresaId_fechaAfip_idx" ON "notificaciones_afip"("empresaId", "fechaAfip");

-- CreateIndex
CREATE INDEX "notificaciones_afip_prioridad_idx" ON "notificaciones_afip"("prioridad");

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_afip_empresaId_mensajeIdAfip_key" ON "notificaciones_afip"("empresaId", "mensajeIdAfip");

-- AddForeignKey
ALTER TABLE "notificaciones_afip" ADD CONSTRAINT "notificaciones_afip_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
