module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.e2e.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }]
  },
  testTimeout: 30000
};
