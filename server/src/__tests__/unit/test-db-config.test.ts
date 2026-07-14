// Unit tests for the test-DB config helper — guards against misconfiguration regressions.
// Covers AC 5: envSetup and globalSetup must refuse to proceed when DATABASE_URL
// does not point to the test database.
import {
  TEST_DB_NAME,
  MIGRATIONS_DB_NAME,
  ALLOWED_TEST_DBS,
  parseDbUrl,
  assertTestDbUrl,
  buildMaintenanceUrl,
  withDbName,
} from '../helpers/test-db-config'

describe('test-db-config helper', () => {
  describe('parseDbUrl', () => {
    it('extracts DB name from a canonical URL', () => {
      const result = parseDbUrl('postgresql://u:p@host:5432/timepick_test')
      expect(result).not.toBeNull()
      expect(result!.dbName).toBe('timepick_test')
    })

    it('strips trailing slash from DB name', () => {
      expect(parseDbUrl('postgresql://u:p@host/timepick_test/')!.dbName).toBe('timepick_test')
    })

    it('ignores query strings', () => {
      expect(parseDbUrl('postgresql://u:p@host/timepick_test?sslmode=require')!.dbName).toBe('timepick_test')
    })

    it('returns null for malformed URL', () => {
      expect(parseDbUrl('not-a-url')).toBeNull()
    })

    it('returns null for empty input', () => {
      expect(parseDbUrl('')).toBeNull()
      expect(parseDbUrl(undefined as unknown as string)).toBeNull()
    })
  })

  describe('assertTestDbUrl', () => {
    it('passes for exact test DB name', () => {
      expect(() => assertTestDbUrl('postgresql://u:p@host/timepick_test', 'test')).not.toThrow()
    })

    it('rejects loose substring matches (the substring-bypass bug)', () => {
      expect(() =>
        assertTestDbUrl('postgresql://u:p@host/my_timepick_test_staging', 'test')
      ).toThrow(/does not point to an allowed test database/)
    })

    it('rejects URLs where the substring appears only in a query string', () => {
      expect(() =>
        assertTestDbUrl('postgresql://u:p@host/production?app=timepick_test', 'test')
      ).toThrow(/does not point to an allowed test database/)
    })

    it('rejects dev DB', () => {
      expect(() => assertTestDbUrl('postgresql://u:p@host/timepick', 'test')).toThrow()
    })

    it('accepts the migrations DB when passed in the allowed list', () => {
      expect(() =>
        assertTestDbUrl('postgresql://u:p@host/timepick_test_migrations', 'test', ALLOWED_TEST_DBS)
      ).not.toThrow()
    })

    it('rejects the migrations DB by default (not in the default allowlist)', () => {
      expect(() =>
        assertTestDbUrl('postgresql://u:p@host/timepick_test_migrations', 'test')
      ).toThrow(/does not point to an allowed test database/)
    })

    it('rejects empty / undefined URL', () => {
      expect(() => assertTestDbUrl('', 'test')).toThrow()
      expect(() => assertTestDbUrl(undefined as unknown as string, 'test')).toThrow()
    })

    it('includes context label in the error', () => {
      expect(() => assertTestDbUrl('postgresql://u:p@host/timepick', 'customContext')).toThrow(
        /\[customContext\]/
      )
    })
  })

  describe('buildMaintenanceUrl', () => {
    it('replaces the DB name with "postgres"', () => {
      const url = buildMaintenanceUrl('postgresql://u:p@host:5432/timepick_test')
      expect(new URL(url).pathname).toBe('/postgres')
    })

    it('preserves query string parameters', () => {
      const url = buildMaintenanceUrl('postgresql://u:p@host/timepick_test?sslmode=require')
      const parsed = new URL(url)
      expect(parsed.pathname).toBe('/postgres')
      expect(parsed.searchParams.get('sslmode')).toBe('require')
    })

    it('preserves credentials', () => {
      const url = buildMaintenanceUrl('postgresql://user:pass@host/timepick_test')
      const parsed = new URL(url)
      expect(parsed.username).toBe('user')
      expect(parsed.password).toBe('pass')
    })
  })

  describe('withDbName', () => {
    it('rewrites only the database name, preserving credentials/host/port/query', () => {
      const url = withDbName('postgresql://user:pass@host:5432/timepick_test?sslmode=require', MIGRATIONS_DB_NAME)
      const parsed = new URL(url)
      expect(parsed.pathname).toBe(`/${MIGRATIONS_DB_NAME}`)
      expect(parsed.username).toBe('user')
      expect(parsed.password).toBe('pass')
      expect(parsed.host).toBe('host:5432')
      expect(parsed.searchParams.get('sslmode')).toBe('require')
    })
  })

  describe('TEST_DB_NAME constant', () => {
    it('equals "timepick_test"', () => {
      expect(TEST_DB_NAME).toBe('timepick_test')
    })
  })

  describe('MIGRATIONS_DB_NAME constant', () => {
    it('equals "timepick_test_migrations"', () => {
      expect(MIGRATIONS_DB_NAME).toBe('timepick_test_migrations')
    })
  })
})
