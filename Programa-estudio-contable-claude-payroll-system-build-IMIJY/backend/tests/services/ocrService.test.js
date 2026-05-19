describe('ocrService', () => {
  let originalProvider;

  beforeEach(() => {
    originalProvider = process.env.OCR_PROVIDER;
    jest.resetModules();
  });

  afterEach(() => {
    process.env.OCR_PROVIDER = originalProvider;
  });

  test('provider manual devuelve requiereManual', async () => {
    process.env.OCR_PROVIDER = 'manual';
    const { extraerDatosComprobante } = require('../../src/services/ocrService');
    const r = await extraerDatosComprobante(Buffer.from('contenido'));
    expect(r.requiereManual).toBe(true);
    expect(r.provider).toBe('none');
    expect(r.datos).toEqual({});
  });

  test('provider aws cae a manual si no está instalada la dep', async () => {
    process.env.OCR_PROVIDER = 'aws';
    const { extraerDatosComprobante } = require('../../src/services/ocrService');
    const r = await extraerDatosComprobante(Buffer.from('x'));
    expect(r.requiereManual).toBe(true);
  });

  test('provider tesseract cae a manual si no está instalada', async () => {
    process.env.OCR_PROVIDER = 'tesseract';
    const { extraerDatosComprobante } = require('../../src/services/ocrService');
    const r = await extraerDatosComprobante(Buffer.from('x'));
    expect(r.requiereManual).toBe(true);
  });

  test('provider desconocido cae a manual', async () => {
    process.env.OCR_PROVIDER = 'invalido';
    const { extraerDatosComprobante } = require('../../src/services/ocrService');
    const r = await extraerDatosComprobante(Buffer.from('x'));
    expect(r.requiereManual).toBe(true);
  });
});
