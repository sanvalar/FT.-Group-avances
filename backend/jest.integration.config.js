/**
 * Pruebas de integracion: levantan la app Express completa (supertest)
 * contra una base PostgreSQL real y vacia. Ver tests/integration/README.md.
 *
 *   npm run test:integration
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.integration.ts'],
  setupFiles: ['<rootDir>/tests/integration/env.ts'],
  globalSetup: '<rootDir>/tests/integration/globalSetup.ts',
  clearMocks: true,
  testTimeout: 20000,
};
