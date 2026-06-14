-- Bot de WhatsApp (Evolution API): instancia por estudio + sesiones conversacionales

ALTER TABLE "estudios" ADD COLUMN "waInstance" TEXT;
ALTER TABLE "estudios" ADD COLUMN "waNumero" TEXT;
ALTER TABLE "estudios" ADD COLUMN "waOperadores" TEXT;

CREATE TABLE "sesiones_whatsapp" (
    "id" TEXT NOT NULL,
    "estudioId" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'DESCONOCIDO',
    "estado" TEXT NOT NULL DEFAULT 'INICIO',
    "contexto" JSONB NOT NULL DEFAULT '{}',
    "empleadoId" TEXT,
    "pushName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sesiones_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sesiones_whatsapp_estudioId_telefono_key" ON "sesiones_whatsapp"("estudioId", "telefono");
CREATE INDEX "sesiones_whatsapp_telefono_idx" ON "sesiones_whatsapp"("telefono");

ALTER TABLE "sesiones_whatsapp" ADD CONSTRAINT "sesiones_whatsapp_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "estudios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
