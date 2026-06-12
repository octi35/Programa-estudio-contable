const {
  emitirComprobante,
  esErrorConectividad,
  generarQRUrl,
  CONDICION_IVA_RECEPTOR,
} = require('../../src/services/afip/afipEmisionService');

describe('afipEmisionService', () => {
  describe('emitirComprobante — modo SIMULADO', () => {
    const configSimulado = { cuit: '20123456789', ambiente: 'SIMULADO' };

    it('genera CAE de 14 dígitos sin conectarse a ARCA', async () => {
      const r = await emitirComprobante(configSimulado, {
        ptoVta: 1, cbteTipo: 6, neto: 1000, iva: 210, total: 1210, docNro: '20111111112',
      });
      expect(r.simulado).toBe(true);
      expect(r.cae).toMatch(/^\d{14}$/);
      expect(r.caeFchVto).toMatch(/^\d{8}$/);
      expect(r.cbteTipo).toBe(6);
    });

    it('simula también cuando no hay certificado aunque el ambiente sea real', async () => {
      const r = await emitirComprobante({ cuit: '20123456789', ambiente: 'PRODUCCION' }, {
        ptoVta: 1, cbteTipo: 11, neto: 500, iva: 0, total: 500,
      });
      expect(r.simulado).toBe(true);
    });
  });

  describe('esErrorConectividad', () => {
    it.each([
      'connect ECONNREFUSED 10.0.0.1:443',
      'AFIP timeout',
      'getaddrinfo ENOTFOUND wsaa.afip.gov.ar',
      'Request failed with status code 503',
      'socket hang up',
      'fetch failed',
    ])('clasifica "%s" como reintenta-ble', (msg) => {
      expect(esErrorConectividad(new Error(msg))).toBe(true);
    });

    it.each([
      'CUIT informado no se encuentra autorizado a emitir',
      'El número de comprobante ya fue informado',
      'Campo CbteFch fuera de rango',
    ])('clasifica "%s" como rechazo real (no reintenta)', (msg) => {
      expect(esErrorConectividad(new Error(msg))).toBe(false);
    });
  });

  describe('generarQRUrl — RG 4892', () => {
    it('arma la URL oficial con el payload base64 correcto', () => {
      const url = generarQRUrl({
        fecha: new Date('2026-06-12T12:00:00Z'),
        cuitEmisor: '30-98765432-1',
        ptoVta: 3,
        cbteTipo: 6,
        nroComprobante: 1234,
        importe: 1210.5,
        docTipo: 80,
        docNro: '20-11111111-2',
        cae: '74123456789012',
      });
      expect(url).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/);

      const payload = JSON.parse(Buffer.from(url.split('?p=')[1], 'base64').toString());
      expect(payload).toMatchObject({
        ver: 1,
        fecha: '2026-06-12',
        cuit: 30987654321,
        ptoVta: 3,
        tipoCmp: 6,
        nroCmp: 1234,
        importe: 1210.5,
        moneda: 'PES',
        ctz: 1,
        tipoDocRec: 80,
        nroDocRec: 20111111112,
        tipoCodAut: 'E',
        codAut: 74123456789012,
      });
    });
  });

  describe('CONDICION_IVA_RECEPTOR (RG 5616)', () => {
    it('mapea las condiciones a los ids de ARCA', () => {
      expect(CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO).toBe(1);
      expect(CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL).toBe(5);
      expect(CONDICION_IVA_RECEPTOR.MONOTRIBUTISTA).toBe(6);
    });
  });
});
