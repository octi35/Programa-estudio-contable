-- Multi-CUIT: certificado AFIP propio por empresa (fallback al del estudio)
ALTER TABLE "empresas" ADD COLUMN "condicionIVA" "CondicionIVA";
ALTER TABLE "empresas" ADD COLUMN "afipPtoVta" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "empresas" ADD COLUMN "afipCertificado" TEXT;
ALTER TABLE "empresas" ADD COLUMN "afipClavePrivada" TEXT;

-- NC/ND asociadas al comprobante original (CbtesAsoc de ARCA)
ALTER TABLE "comprobantes_electronicos" ADD COLUMN "comprobanteAsociadoId" TEXT;
ALTER TABLE "comprobantes_electronicos" ADD CONSTRAINT "comprobantes_electronicos_comprobanteAsociadoId_fkey"
  FOREIGN KEY ("comprobanteAsociadoId") REFERENCES "comprobantes_electronicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
