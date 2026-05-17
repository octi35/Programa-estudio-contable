-- AlterTable
ALTER TABLE "estudios" ADD COLUMN     "afipAmbiente" TEXT DEFAULT 'SIMULADO',
ADD COLUMN     "afipCertificado" TEXT,
ADD COLUMN     "afipClavePrivada" TEXT,
ADD COLUMN     "afipPtoVta" INTEGER DEFAULT 1;

-- CreateTable
CREATE TABLE "comprobantes_electronicos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "estudioId" TEXT NOT NULL,
    "tipoComprobante" INTEGER NOT NULL,
    "ptoVta" INTEGER NOT NULL DEFAULT 1,
    "nroComprobante" INTEGER NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cae" TEXT,
    "caeFchVto" TEXT,
    "receptorCuit" TEXT,
    "receptorRazonSocial" TEXT,
    "receptorDomicilio" TEXT,
    "neto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'EMITIDO',
    "simulado" BOOLEAN NOT NULL DEFAULT false,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobantes_electronicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_comprobantes_electronicos" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "precioUnit" DECIMAL(14,2) NOT NULL,
    "alicuotaIva" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "ivaImporte" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "detalles_comprobantes_electronicos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "comprobantes_electronicos" ADD CONSTRAINT "comprobantes_electronicos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes_electronicos" ADD CONSTRAINT "comprobantes_electronicos_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "estudios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_comprobantes_electronicos" ADD CONSTRAINT "detalles_comprobantes_electronicos_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes_electronicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
