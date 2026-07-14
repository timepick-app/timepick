/** @type {import('ts-jest').JestConfigWithTsJest} */

// Config commune aux deux projets Jest.
const baseProject = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 10000,
  // ts-jest compile AUSSI les fichiers de test ; contrairement à `tsc`, il ne
  // respecte pas l'`exclude` des __tests__ de tsconfig.json. Or P4 (chasse au
  // code mort) y a activé `noUnusedLocals` pour verrouiller les locals morts de
  // `src`. On pointe donc ts-jest sur tsconfig.test.json (qui désactive ce flag)
  // afin de préserver la tolérance historique de la suite (locals de scaffolding
  // non lus) sans relâcher la vérification stricte de `src` (couverte par `tsc`).
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
}

// Tests qui jouent des cycles forward/rollback de migrations sur le schéma/seed.
// Isolés dans le projet « migrations » (base dédiée timepick_test_migrations) pour que
// leurs rollbacks (DROP TABLE email_templates, etc.) n'altèrent jamais la base des
// suites de rendu. Toute autre suite reste dans le projet « main » (timepick_test).
const SCHEMA_MUTATING_TESTS = [
  '<rootDir>/src/__tests__/integration/migrate-runner.test.ts',
  '<rootDir>/src/__tests__/integration/email-refactoring-migration.test.ts',
]

module.exports = {
  maxWorkers: 1, // Exécution séquentielle (y compris entre projets) — borne les connexions pg.
  // Force Jest to exit après les tests même si des handles sont ouverts (pool PostgreSQL).
  forceExit: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  projects: [
    {
      ...baseProject,
      displayName: 'main',
      testMatch: ['**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: [
        '/node_modules/',
        'integration/migrate-runner\\.test\\.ts$',
        'integration/email-refactoring-migration\\.test\\.ts$',
      ],
      globalSetup: '<rootDir>/src/__tests__/globalSetup.js',
      globalTeardown: '<rootDir>/src/__tests__/globalTeardown.js',
      setupFiles: ['<rootDir>/src/__tests__/envSetup.js'],
    },
    {
      ...baseProject,
      displayName: 'migrations',
      testMatch: SCHEMA_MUTATING_TESTS,
      globalSetup: '<rootDir>/src/__tests__/globalSetup.migrations.js',
      globalTeardown: '<rootDir>/src/__tests__/globalTeardown.js',
      setupFiles: ['<rootDir>/src/__tests__/envSetup.migrations.js'],
    },
  ],
}
