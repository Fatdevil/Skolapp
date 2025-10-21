/** @type {import('@stryker-mutator/api/core').StrykerOptions} */
module.exports = {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/auth/**/*.ts',
    'src/routes/auth/**/*.ts',
    'src/auth/session/**/*.ts',
    'src/repos/**/*users*.ts'
  ],
  reporters: ['progress', 'clear-text', 'html'],
  tempDirName: '.stryker-tmp',
  commandRunner: {
    command: 'npm run test:ci'
  },
  vitest: {
    configFile: 'vitest.config.ts',
    enableFindRelatedTests: true
  },
  checkers: ['typescript'],
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
  thresholds: { high: 80, low: 70, break: 60 }
};
