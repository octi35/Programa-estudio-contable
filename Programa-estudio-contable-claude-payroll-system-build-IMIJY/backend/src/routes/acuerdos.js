const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/acuerdos?convenioId=...&vigente=true
router.get('/', async (req, res) => {
  try {
    const { convenioId, vigente } = req.query;
    const where = {};
    if (convenioId) where.convenioId = convenioId;
    if (vigente === 'true') {
      const hoy = new Date();
      where.vigenciaDesde = { lte: hoy };
      where.OR = [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }];
    }
    const acuerdos = await prisma.acuerdoSalarial.findMany({
      where,
      include: { convenio: { select: { nombre: true, codigo: true } } },
      orderBy: [{ vigenciaDesde: 'desc' }, { cuota: 'asc' }],
    });
    res.json(acuerdos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener acuerdos' });
  }
});

// POST /api/acuerdos
router.post('/', async (req, res) => {
  try {
    const {
      convenioId, descripcion, vigenciaDesde, vigenciaHasta,
      tipo, monto, porcentaje, absorbible, cuota, totalCuotas,
    } = req.body;

    if (!descripcion || !vigenciaDesde || !tipo) {
      return res.status(400).json({ error: 'descripcion, vigenciaDesde y tipo son requeridos' });
    }

    const acuerdo = await prisma.acuerdoSalarial.create({
      data: {
        convenioId:    convenioId || null,
        descripcion,
        vigenciaDesde: new Date(vigenciaDesde),
        vigenciaHasta: vigenciaHasta ? new Date(vigenciaHasta) : null,
        tipo,
        monto:         monto     ? Number(monto)     : null,
        porcentaje:    porcentaje ? Number(porcentaje) : null,
        absorbible:    absorbible !== false,
        cuota:         cuota      ? Number(cuota)      : null,
        totalCuotas:   totalCuotas ? Number(totalCuotas) : null,
      },
    });
    res.status(201).json(acuerdo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear acuerdo' });
  }
});

// PUT /api/acuerdos/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      descripcion, vigenciaDesde, vigenciaHasta,
      tipo, monto, porcentaje, absorbible, absorbido, cuota, totalCuotas,
    } = req.body;

    const acuerdo = await prisma.acuerdoSalarial.update({
      where: { id: req.params.id },
      data: {
        descripcion,
        vigenciaDesde: vigenciaDesde ? new Date(vigenciaDesde) : undefined,
        vigenciaHasta: vigenciaHasta !== undefined ? (vigenciaHasta ? new Date(vigenciaHasta) : null) : undefined,
        tipo,
        monto:       monto     !== undefined ? (monto     ? Number(monto)      : null) : undefined,
        porcentaje:  porcentaje !== undefined ? (porcentaje ? Number(porcentaje) : null) : undefined,
        absorbible:  absorbible !== undefined ? absorbible  : undefined,
        absorbido:   absorbido  !== undefined ? absorbido   : undefined,
        cuota:       cuota      !== undefined ? (cuota      ? Number(cuota)      : null) : undefined,
        totalCuotas: totalCuotas !== undefined ? (totalCuotas ? Number(totalCuotas) : null) : undefined,
      },
    });
    res.json(acuerdo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar acuerdo' });
  }
});

// DELETE /api/acuerdos/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.acuerdoSalarial.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar acuerdo' });
  }
});

module.exports = router;
