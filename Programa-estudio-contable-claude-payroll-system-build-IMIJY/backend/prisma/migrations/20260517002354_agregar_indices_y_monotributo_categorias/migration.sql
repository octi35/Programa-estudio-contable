-- CreateTable
CREATE TABLE "monotributo_categorias" (
    "id" TEXT NOT NULL,
    "estudioId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL,
    "limiteIngresos" DECIMAL(14,2) NOT NULL,
    "cuotaImpuesto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cuotaObraSocial" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cuotaJubilacion" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monotributo_categorias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monotributo_categorias_estudioId_vigenciaDesde_idx" ON "monotributo_categorias"("estudioId", "vigenciaDesde");

-- CreateIndex
CREATE UNIQUE INDEX "monotributo_categorias_estudioId_categoria_vigenciaDesde_key" ON "monotributo_categorias"("estudioId", "categoria", "vigenciaDesde");

-- CreateIndex
CREATE INDEX "asientos_fecha_idx" ON "asientos"("fecha");

-- CreateIndex
CREATE INDEX "asientos_empresaId_fecha_idx" ON "asientos"("empresaId", "fecha");

-- CreateIndex
CREATE INDEX "asientos_ejercicioId_fecha_idx" ON "asientos"("ejercicioId", "fecha");

-- CreateIndex
CREATE INDEX "asientos_anulado_idx" ON "asientos"("anulado");

-- CreateIndex
CREATE INDEX "ausentismos_empleadoId_fechaDesde_idx" ON "ausentismos"("empleadoId", "fechaDesde");

-- CreateIndex
CREATE INDEX "comprobantes_electronicos_empresaId_fechaEmision_idx" ON "comprobantes_electronicos"("empresaId", "fechaEmision");

-- CreateIndex
CREATE INDEX "comprobantes_electronicos_estudioId_fechaEmision_idx" ON "comprobantes_electronicos"("estudioId", "fechaEmision");

-- CreateIndex
CREATE INDEX "comprobantes_iva_fecha_idx" ON "comprobantes_iva"("fecha");

-- CreateIndex
CREATE INDEX "comprobantes_iva_empresaId_periodoFiscalAnio_periodoFiscalM_idx" ON "comprobantes_iva"("empresaId", "periodoFiscalAnio", "periodoFiscalMes");

-- CreateIndex
CREATE INDEX "comprobantes_iva_empresaId_tipoMovimiento_fecha_idx" ON "comprobantes_iva"("empresaId", "tipoMovimiento", "fecha");

-- CreateIndex
CREATE INDEX "comprobantes_iva_proveedorClienteId_idx" ON "comprobantes_iva"("proveedorClienteId");

-- CreateIndex
CREATE INDEX "declaraciones_iibb_empresaId_anio_mes_idx" ON "declaraciones_iibb"("empresaId", "anio", "mes");

-- CreateIndex
CREATE INDEX "declaraciones_iibb_estado_idx" ON "declaraciones_iibb"("estado");

-- CreateIndex
CREATE INDEX "documentos_empresaId_tipo_idx" ON "documentos"("empresaId", "tipo");

-- CreateIndex
CREATE INDEX "documentos_empresaId_anio_mes_idx" ON "documentos"("empresaId", "anio", "mes");

-- CreateIndex
CREATE INDEX "documentos_empleadoId_idx" ON "documentos"("empleadoId");

-- CreateIndex
CREATE INDEX "empleados_cuil_idx" ON "empleados"("cuil");

-- CreateIndex
CREATE INDEX "empleados_empresaId_activo_idx" ON "empleados"("empresaId", "activo");

-- CreateIndex
CREATE INDEX "empleados_apellido_nombre_idx" ON "empleados"("apellido", "nombre");

-- CreateIndex
CREATE INDEX "empleados_legajoNumero_idx" ON "empleados"("legajoNumero");

-- CreateIndex
CREATE INDEX "lineas_asiento_cuentaContableId_idx" ON "lineas_asiento"("cuentaContableId");

-- CreateIndex
CREATE INDEX "lineas_asiento_asientoId_idx" ON "lineas_asiento"("asientoId");

-- CreateIndex
CREATE INDEX "liquidaciones_anio_mes_idx" ON "liquidaciones"("anio", "mes");

-- CreateIndex
CREATE INDEX "liquidaciones_estado_idx" ON "liquidaciones"("estado");

-- CreateIndex
CREATE INDEX "liquidaciones_empleadoId_anio_mes_idx" ON "liquidaciones"("empleadoId", "anio", "mes");

-- CreateIndex
CREATE INDEX "liquidaciones_periodoId_estado_idx" ON "liquidaciones"("periodoId", "estado");

-- CreateIndex
CREATE INDEX "log_acciones_estudioId_createdAt_idx" ON "log_acciones"("estudioId", "createdAt");

-- CreateIndex
CREATE INDEX "log_acciones_entidad_entidadId_idx" ON "log_acciones"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "log_acciones_usuarioId_createdAt_idx" ON "log_acciones"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "log_acciones_accion_idx" ON "log_acciones"("accion");

-- CreateIndex
CREATE INDEX "movimientos_bancarios_cuentaBancariaId_fecha_idx" ON "movimientos_bancarios"("cuentaBancariaId", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_bancarios_asientoId_idx" ON "movimientos_bancarios"("asientoId");

-- CreateIndex
CREATE INDEX "movimientos_bancarios_conciliado_idx" ON "movimientos_bancarios"("conciliado");

-- CreateIndex
CREATE INDEX "novedades_empleados_empleadoId_fechaDesde_idx" ON "novedades_empleados"("empleadoId", "fechaDesde");

-- CreateIndex
CREATE INDEX "novedades_empleados_tipo_idx" ON "novedades_empleados"("tipo");

-- CreateIndex
CREATE INDEX "pagos_comprobantes_comprobanteId_idx" ON "pagos_comprobantes"("comprobanteId");

-- CreateIndex
CREATE INDEX "pagos_comprobantes_fecha_idx" ON "pagos_comprobantes"("fecha");

-- CreateIndex
CREATE INDEX "tipos_cambio_estudioId_fecha_idx" ON "tipos_cambio"("estudioId", "fecha");

-- AddForeignKey
ALTER TABLE "monotributo_categorias" ADD CONSTRAINT "monotributo_categorias_estudioId_fkey" FOREIGN KEY ("estudioId") REFERENCES "estudios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
