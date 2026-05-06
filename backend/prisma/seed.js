const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Estudio contable demo
  const estudio = await prisma.estudio.upsert({
    where: { cuit: '20-12345678-9' },
    update: {},
    create: {
      razonSocial: 'Estudio Contable Demo S.R.L.',
      cuit: '20-12345678-9',
      matricula: 'CP 12345',
      direccion: 'Av. Corrientes 1234, Piso 3',
      localidad: 'Buenos Aires',
      email: 'admin@estudiodemo.com',
      telefono: '011-4321-5678',
    },
  });

  // Usuario admin
  const hashedPassword = await bcrypt.hash('Admin1234!', 10);
  await prisma.usuario.upsert({
    where: { email: 'admin@estudiodemo.com' },
    update: {},
    create: {
      email: 'admin@estudiodemo.com',
      password: hashedPassword,
      nombre: 'Administrador',
      rol: 'ADMIN',
      estudioId: estudio.id,
    },
  });

  // Convenios colectivos principales de Argentina
  const convenios = [
    { codigo: 'CCT-130/75', nombre: 'Comercio (Empleados de Comercio)', descripcion: 'Convenio Colectivo de Trabajo 130/75' },
    { codigo: 'CCT-76/75', nombre: 'Construcción (UOCRA)', descripcion: 'Convenio Colectivo de Trabajo 76/75' },
    { codigo: 'CCT-507/07', nombre: 'Gastronómicos', descripcion: 'Convenio Colectivo de Trabajo 507/07' },
    { codigo: 'CCT-231/94', nombre: 'Administración Pública', descripcion: 'Convenio Colectivo de Trabajo 231/94' },
    { codigo: 'DECRETO-326/56', nombre: 'Personal de Casas Particulares', descripcion: 'Régimen especial Ley 26.844' },
    { codigo: 'CCT-160/75', nombre: 'Metalúrgicos (UOM)', descripcion: 'Convenio Colectivo de Trabajo 160/75' },
    { codigo: 'LCT-20744', nombre: 'Ley de Contrato de Trabajo (sin convenio específico)', descripcion: 'Ley 20.744' },
  ];

  for (const conv of convenios) {
    await prisma.convenio.upsert({
      where: { codigo: conv.codigo },
      update: {},
      create: conv,
    });
  }

  const convenioComercio = await prisma.convenio.findUnique({ where: { codigo: 'CCT-130/75' } });
  const convenioGeneral = await prisma.convenio.findUnique({ where: { codigo: 'LCT-20744' } });

  // Conceptos base para CCT Comercio
  const conceptosComercio = [
    // Haberes
    { codigo: '001', nombre: 'Sueldo Básico', tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'IMPORTE', remunerativo: true, orden: 10 },
    { codigo: '002', nombre: 'Presentismo', tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'PORCENTAJE', porcentaje: 8.33, remunerativo: true, orden: 20, formula: 'BASICO * 0.0833' },
    { codigo: '003', nombre: 'Antigüedad', tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'PORCENTAJE', remunerativo: true, orden: 30, formula: 'BASICO * ANTIGUEDAD_PCT' },
    { codigo: '004', nombre: 'Horas Extras 50%', tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'HORAS', remunerativo: true, orden: 40, formula: 'VALOR_HORA * 1.5 * CANTIDAD' },
    { codigo: '005', nombre: 'Horas Extras 100%', tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'HORAS', remunerativo: true, orden: 50, formula: 'VALOR_HORA * 2 * CANTIDAD' },
    { codigo: '006', nombre: 'Adicional No Remunerativo', tipo: 'NO_REMUNERATIVO', naturaleza: 'HABER', unidad: 'IMPORTE', remunerativo: false, orden: 60 },
    { codigo: '007', nombre: 'Viáticos', tipo: 'NO_REMUNERATIVO', naturaleza: 'HABER', unidad: 'IMPORTE', remunerativo: false, orden: 70 },
    { codigo: '008', nombre: 'SAC (Aguinaldo)', tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'IMPORTE', remunerativo: true, orden: 80, formula: 'MEJOR_REMUNERACION_SEMESTRE / 2' },
    { codigo: '009', nombre: 'Vacaciones', tipo: 'REMUNERATIVO', naturaleza: 'HABER', unidad: 'DIAS', remunerativo: true, orden: 90, formula: 'REMUNERACION_DIARIA * DIAS_VACACIONES' },
    // Descuentos empleado
    { codigo: '100', nombre: 'Jubilación (11%)', tipo: 'DEDUCCION', naturaleza: 'DESCUENTO', unidad: 'PORCENTAJE', porcentaje: 11, remunerativo: true, orden: 100, formula: 'TOTAL_REMUNERATIVO * 0.11' },
    { codigo: '101', nombre: 'Obra Social (3%)', tipo: 'DEDUCCION', naturaleza: 'DESCUENTO', unidad: 'PORCENTAJE', porcentaje: 3, remunerativo: true, orden: 110, formula: 'TOTAL_REMUNERATIVO * 0.03' },
    { codigo: '102', nombre: 'INSSJP/PAMI (3%)', tipo: 'DEDUCCION', naturaleza: 'DESCUENTO', unidad: 'PORCENTAJE', porcentaje: 3, remunerativo: true, orden: 120, formula: 'TOTAL_REMUNERATIVO * 0.03' },
    { codigo: '103', nombre: 'Sindicato (2%)', tipo: 'DEDUCCION', naturaleza: 'DESCUENTO', unidad: 'PORCENTAJE', porcentaje: 2, remunerativo: true, orden: 130, formula: 'BASICO * 0.02' },
    { codigo: '104', nombre: 'Cuota Solidaria (1%)', tipo: 'DEDUCCION', naturaleza: 'DESCUENTO', unidad: 'PORCENTAJE', porcentaje: 1, remunerativo: true, orden: 140 },
    { codigo: '105', nombre: 'Adelanto de Sueldo', tipo: 'DEDUCCION', naturaleza: 'DESCUENTO', unidad: 'IMPORTE', remunerativo: false, orden: 150 },
    // Contribuciones empleador
    { codigo: '200', nombre: 'Contribución Jubilación (16%)', tipo: 'APORTE_EMPLEADOR', naturaleza: 'INFORMATIVO', unidad: 'PORCENTAJE', porcentaje: 16, remunerativo: true, orden: 200, imprimible: false },
    { codigo: '201', nombre: 'Contribución Obra Social (6%)', tipo: 'APORTE_EMPLEADOR', naturaleza: 'INFORMATIVO', unidad: 'PORCENTAJE', porcentaje: 6, remunerativo: true, orden: 210, imprimible: false },
    { codigo: '202', nombre: 'Contribución INSSJP (1.5%)', tipo: 'APORTE_EMPLEADOR', naturaleza: 'INFORMATIVO', unidad: 'PORCENTAJE', porcentaje: 1.5, remunerativo: true, orden: 220, imprimible: false },
    { codigo: '203', nombre: 'ART (Aseguradora de Riesgos)', tipo: 'APORTE_EMPLEADOR', naturaleza: 'INFORMATIVO', unidad: 'PORCENTAJE', porcentaje: 2.5, remunerativo: false, orden: 230, imprimible: false },
  ];

  for (const c of conceptosComercio) {
    await prisma.concepto.upsert({
      where: { convenioId_codigo: { convenioId: convenioComercio.id, codigo: c.codigo } },
      update: {},
      create: { ...c, convenioId: convenioComercio.id },
    });
  }

  // Tabla de sueldos CCT Comercio (valores de referencia 2024)
  const tablaSueldos = [
    { categoria: 'A', descripcion: 'Auxiliar Especializado A', basicoMensual: 420000 },
    { categoria: 'B', descripcion: 'Auxiliar Especializado B', basicoMensual: 450000 },
    { categoria: 'C', descripcion: 'Auxiliar Especializado C', basicoMensual: 480000 },
    { categoria: 'D', descripcion: 'Medio Especializado', basicoMensual: 520000 },
    { categoria: 'E', descripcion: 'Especializado', basicoMensual: 570000 },
    { categoria: 'F', descripcion: 'Calificado', basicoMensual: 630000 },
  ];

  for (const ts of tablaSueldos) {
    await prisma.tablaSueldo.create({
      data: {
        convenioId: convenioComercio.id,
        categoria: ts.categoria,
        descripcion: ts.descripcion,
        basicoMensual: ts.basicoMensual,
        vigenciaDesde: new Date('2024-01-01'),
      },
    }).catch(() => {});
  }

  // Empresa demo
  const empresa = await prisma.empresa.upsert({
    where: { cuit: '30-98765432-1' },
    update: {},
    create: {
      razonSocial: 'Comercial Demo S.A.',
      nombreFantasia: 'Demo Store',
      cuit: '30-98765432-1',
      domicilio: 'Av. Santa Fe 2500',
      localidad: 'Buenos Aires',
      provincia: 'Buenos Aires',
      codigoPostal: 'C1425',
      telefono: '011-4800-1234',
      email: 'rrhh@demodemo.com',
      actividadPrincipal: 'Comercio minorista',
      convenioId: convenioComercio.id,
      estudioId: estudio.id,
    },
  });

  // Empleados demo
  const empleadosDemo = [
    {
      legajoNumero: '0001',
      apellido: 'García',
      nombre: 'Juan Carlos',
      cuil: '20-25678901-3',
      dni: '25678901',
      fechaNacimiento: new Date('1985-03-15'),
      sexo: 'M',
      fechaIngreso: new Date('2018-06-01'),
      categoria: 'D',
      puesto: 'Vendedor',
      basicoMensual: 520000,
      obraSocialNombre: 'Medife',
      obraSocialCodigo: '001',
    },
    {
      legajoNumero: '0002',
      apellido: 'Rodríguez',
      nombre: 'María Laura',
      cuil: '27-32145678-4',
      dni: '32145678',
      fechaNacimiento: new Date('1992-07-22'),
      sexo: 'F',
      fechaIngreso: new Date('2020-03-10'),
      categoria: 'B',
      puesto: 'Cajera',
      basicoMensual: 450000,
      obraSocialNombre: 'OSECAC',
      obraSocialCodigo: '010',
    },
    {
      legajoNumero: '0003',
      apellido: 'Fernández',
      nombre: 'Roberto Néstor',
      cuil: '20-18901234-7',
      dni: '18901234',
      fechaNacimiento: new Date('1975-11-30'),
      sexo: 'M',
      fechaIngreso: new Date('2005-01-15'),
      categoria: 'F',
      puesto: 'Supervisor de Ventas',
      basicoMensual: 630000,
      obraSocialNombre: 'OSECAC',
      obraSocialCodigo: '010',
    },
  ];

  for (const emp of empleadosDemo) {
    await prisma.empleado.upsert({
      where: { empresaId_cuil: { empresaId: empresa.id, cuil: emp.cuil } },
      update: {},
      create: { ...emp, empresaId: empresa.id },
    });
  }

  console.log('✅ Seed completado exitosamente');
  console.log('👤 Usuario admin: admin@estudiodemo.com / Admin1234!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
