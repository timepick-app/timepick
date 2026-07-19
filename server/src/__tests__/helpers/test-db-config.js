'use strict'

const path = require('path')
const dotenv = require('dotenv')

const TEST_DB_NAME = 'timepick_test'
// Base dédiée aux tests mutateurs de schéma (projet Jest « migrations ») : leurs cycles
// forward/rollback de migrations n'altèrent jamais la base des suites de rendu.
const MIGRATIONS_DB_NAME = 'timepick_test_migrations'
// Bases de test autorisées — toute autre cible est refusée par assertTestDbUrl
// (garde-fou : ne JAMAIS cibler une base de dev/prod).
const ALLOWED_TEST_DBS = [TEST_DB_NAME, MIGRATIONS_DB_NAME]
const ENV_TEST_PATH = path.resolve(__dirname, '../../../.env.test')

// Défauts sûrs appliqués quand server/.env.test est absent : `npm test` fonctionne
// dès le clone + une instance PostgreSQL locale, sans configuration manuelle.
// Pour surcharger (identifiants PostgreSQL non standard), créer server/.env.test avec
// uniquement les clés à changer. Le nom de base par défaut porte le suffixe `_test`
// donc il passe toujours assertTestDbUrl (jamais la base de dev/prod).
const TEST_ENV_DEFAULTS = {
  DATABASE_URL: `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}`,
  JWT_SECRET: 'test_jwt_secret_not_for_production',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  EMAIL_FROM: 'noreply@test.local',
  ALLOW_TEST_ROUTES: 'true',
}

function loadEnvTest(options = {}) {
  const result = dotenv.config({ path: ENV_TEST_PATH, override: options.override !== false })
  // server/.env.test est un OVERRIDE optionnel : on ne remplace jamais une valeur déjà
  // présente (fichier chargé ci-dessus, ou déjà positionnée dans l'environnement).
  for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
    if (!process.env[key]) process.env[key] = value
  }
  return result
}

function parseDbUrl(urlString) {
  if (!urlString) return null
  try {
    const u = new URL(urlString)
    const dbName = u.pathname.replace(/^\//, '').replace(/\/$/, '')
    return { url: u, dbName }
  } catch {
    return null
  }
}

function assertTestDbUrl(urlString, context, allowed = [TEST_DB_NAME]) {
  const parsed = parseDbUrl(urlString)
  if (!parsed || !allowed.includes(parsed.dbName)) {
    throw new Error(
      `[${context}] DATABASE_URL "${urlString}" does not point to an allowed test database ` +
      `(${allowed.join(', ')}) (got "${parsed ? parsed.dbName : 'null'}"). ` +
      `Fix server/.env.test — see server/.env.example for template.`
    )
  }
  return parsed
}

function buildMaintenanceUrl(testUrlString) {
  const u = new URL(testUrlString)
  u.pathname = '/postgres'
  return u.toString()
}

// Réécrit le nom de base d'une URL Postgres (ex. timepick_test → timepick_test_migrations)
// en préservant hôte/port/credentials/query. Sert à dériver l'URL d'un projet depuis .env.test.
function withDbName(urlString, dbName) {
  const u = new URL(urlString)
  u.pathname = `/${dbName}`
  return u.toString()
}

module.exports = {
  TEST_DB_NAME,
  MIGRATIONS_DB_NAME,
  ALLOWED_TEST_DBS,
  ENV_TEST_PATH,
  loadEnvTest,
  parseDbUrl,
  assertTestDbUrl,
  buildMaintenanceUrl,
  withDbName,
}
