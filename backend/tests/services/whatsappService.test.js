// Tests del provider mock + normalización de teléfonos.

describe('whatsappService', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.WHATSAPP_PROVIDER = 'mock';
  });

  describe('normalizarTelefono', () => {
    const { normalizarTelefono } = require('../../src/services/whatsappService');

    test.each([
      ['+5491145678901', '+5491145678901'],
      ['5491145678901', '+5491145678901'],
      ['01145678901', '+541145678901'],
      ['1145678901', '+541145678901'],
      ['+54 9 11 4567-8901', '+5491145678901'],
      ['(11) 4567-8901', '+541145678901'],
    ])('normaliza %s → %s', (input, expected) => {
      expect(normalizarTelefono(input)).toBe(expected);
    });

    test('teléfono vacío devuelve vacío', () => {
      expect(normalizarTelefono('')).toBe('');
      expect(normalizarTelefono(null)).toBe('');
    });
  });

  describe('enviarMensaje (mock)', () => {
    test('mock provider devuelve ok con providerId', async () => {
      const { enviarMensaje } = require('../../src/services/whatsappService');
      const r = await enviarMensaje({
        telefono: '+5491145678901',
        mensaje: 'Hola',
      });
      expect(r.ok).toBe(true);
      expect(r.provider).toBe('mock');
      expect(r.providerId).toMatch(/^mock-/);
    });

    test('rechaza teléfono vacío', async () => {
      const { enviarMensaje } = require('../../src/services/whatsappService');
      await expect(enviarMensaje({ telefono: '', mensaje: 'x' })).rejects.toThrow(/inválido/);
    });
  });

  describe('Twilio config validation', () => {
    test('lanza error si faltan credenciales Twilio', async () => {
      process.env.WHATSAPP_PROVIDER = 'twilio';
      delete process.env.TWILIO_ACCOUNT_SID;
      const { enviarMensaje } = require('../../src/services/whatsappService');
      await expect(
        enviarMensaje({ telefono: '+5491145678901', mensaje: 'test' })
      ).rejects.toThrow(/Twilio no configurado/);
    });
  });

  describe('Meta config validation', () => {
    test('lanza error si faltan credenciales Meta', async () => {
      process.env.WHATSAPP_PROVIDER = 'meta';
      delete process.env.META_WHATSAPP_TOKEN;
      const { enviarMensaje } = require('../../src/services/whatsappService');
      await expect(
        enviarMensaje({ telefono: '+5491145678901', mensaje: 'test' })
      ).rejects.toThrow(/Meta WhatsApp no configurado/);
    });
  });
});
