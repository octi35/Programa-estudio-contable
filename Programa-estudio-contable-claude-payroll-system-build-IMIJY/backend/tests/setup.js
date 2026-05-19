// Setup global de tests. Se ejecuta antes de cada archivo de test.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-no-uses-en-produccion';
process.env.AFIP_AMBIENTE = 'SIMULADO';
process.env.AFIP_PRODUCTION = 'false';
process.env.OCR_PROVIDER = 'manual';

// Silenciar logger durante tests
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
