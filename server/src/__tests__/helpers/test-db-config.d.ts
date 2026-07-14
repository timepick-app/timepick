export const TEST_DB_NAME: string
export const MIGRATIONS_DB_NAME: string
export const ALLOWED_TEST_DBS: readonly string[]
export const ENV_TEST_PATH: string

export function loadEnvTest(options?: { override?: boolean }): { parsed?: Record<string, string>; error?: Error }

export interface ParsedDbUrl {
  url: URL
  dbName: string
}

export function parseDbUrl(urlString: string | undefined | null): ParsedDbUrl | null

export function assertTestDbUrl(
  urlString: string | undefined | null,
  context: string,
  allowed?: readonly string[],
): ParsedDbUrl

export function buildMaintenanceUrl(testUrlString: string): string

export function withDbName(urlString: string, dbName: string): string
