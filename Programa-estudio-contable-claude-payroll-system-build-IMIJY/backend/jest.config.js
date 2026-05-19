module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/utils/**/*.js',
    'src/middleware/**/*.js',
    '!src/services/**/cron*.js', // los crons se prueban indirectamente
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Evita que los tests "huelguistas" cuelguen el CI
  testTimeout: 10000,
  verbose: true,
};
