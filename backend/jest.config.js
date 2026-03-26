/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '../tsconfig.backend.json' }],
  },
};
