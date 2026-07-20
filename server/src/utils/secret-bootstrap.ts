import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Pure module — NO side-effects at import. Describes how a secret is sourced
 * (env var name, on-disk fallback file name, validation) and exposes the
 * mechanics to resolve/generate it. The side-effect entrypoint that actually
 * calls `ensureSecret()` at process boot lives in `../bootstrap-env.ts`.
 */
export interface SecretSpec {
  envVar: string
  fileName: string
  validate: (v: string) => boolean
  invalidMessage: (v: string) => string
  /** When true, `ensureSecret()` records the resolved source in module state (see `getEncryptionKeySource`). */
  trackSource?: boolean
}

export const ENCRYPTION_KEY_SPEC: SecretSpec = {
  envVar: 'ENCRYPTION_KEY',
  fileName: 'encryption.key',
  validate: (v) => /^[0-9a-fA-F]{64}$/.test(v),
  invalidMessage: (v) => `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes), got ${v.length} chars`,
  trackSource: true,
}

export const JWT_SECRET_SPEC: SecretSpec = {
  envVar: 'JWT_SECRET',
  fileName: 'jwt.secret',
  // Deliberately permissive: existing deployments/tests use arbitrary strings
  // ('dev_secret', 'test_jwt_secret_not_for_production', …). Only generation
  // produces 64-hex; validating a *provided* value stays non-empty-only.
  validate: (v) => v.length > 0,
  invalidMessage: () => 'JWT_SECRET must be a non-empty string',
}

/**
 * `process.env.DATA_DIR` override, else `<server>/data` — resolved identically
 * in dev (`src/utils/`) and prod (`dist/utils/`). This module lives one level
 * under the `src/`/`dist/` root, so it climbs two `..` to reach the server
 * package root — same technique as `getEmailUploadsRoot()`
 * (`services/storage/local-driver.ts`), which climbs three `..` because it sits
 * one level deeper under `services/storage/`.
 */
export function resolveDataDir(): string {
  return process.env.DATA_DIR ?? path.resolve(__dirname, '..', '..', 'data')
}

/** Non-reversible 12-lowercase-hex fingerprint — safe to expose over the API. */
export function fingerprintKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 12)
}

// Safe default: 'env'. If `ensureSecret(ENCRYPTION_KEY_SPEC)` never ran (e.g. tests
// import `./app`, not `./bootstrap-env`), reveal endpoints must refuse rather than
// leak whatever happens to be on disk.
let encryptionKeySource: 'env' | 'file' = 'env'

/** Source of `ENCRYPTION_KEY`, FROZEN at boot — never re-derived from `process.env`/disk. */
export function getEncryptionKeySource(): 'env' | 'file' {
  return encryptionKeySource
}

/**
 * Resolves a secret with strict precedence env > file:
 *  - env present & valid → used as-is (a divergent on-disk file is ignored + warned, never read).
 *  - env present & invalid → fail-fast throw (no secret value in the message).
 *  - env absent/empty → read `<dataDir>/<fileName>` if present (throw if malformed — NEVER
 *    regenerate over a possibly in-use secret), else generate + persist it (`wx`, re-read on
 *    `EEXIST` to survive the two-step Docker CMD race).
 * Populates `process.env[spec.envVar]` in the file branch so downstream modules (which read
 * `process.env` lazily, e.g. `encryption.service.ts`) see the resolved value.
 */
export function ensureSecret(spec: SecretSpec): 'env' | 'file' {
  const dataDir = resolveDataDir()
  const filePath = path.join(dataDir, spec.fileName)
  const envValue = process.env[spec.envVar]

  let source: 'env' | 'file'

  if (envValue) {
    if (!spec.validate(envValue)) {
      throw new Error(`[bootstrap] ${spec.invalidMessage(envValue)}`)
    }

    if (existsSync(filePath)) {
      try {
        const fileValue = readFileSync(filePath, 'utf8').trim()
        if (fileValue !== envValue) {
          console.warn(
            `[bootstrap] ${spec.envVar}: on-disk file at ${filePath} is ignored (environment variable takes precedence).`,
          )
        }
      } catch {
        // Unreadable file — irrelevant, env already wins.
      }
    }

    source = 'env'
  } else {
    source = 'file'
    let fileValue: string

    if (existsSync(filePath)) {
      fileValue = readFileSync(filePath, 'utf8').trim()
      if (!spec.validate(fileValue)) {
        throw new Error(
          `[bootstrap] ${spec.envVar}: file at ${filePath} is malformed (${fileValue.length} chars). ` +
            `Fix or delete it explicitly — it will never be regenerated automatically over a possibly in-use secret.`,
        )
      }
    } else {
      const generated = randomBytes(32).toString('hex')
      mkdirSync(dataDir, { recursive: true, mode: 0o700 })
      // mkdirSync's mode only applies on creation; tighten a pre-existing dir too
      // (e.g. a Docker volume mounted at 0o755). Best-effort — a volume owned by
      // another UID may reject this; the secret files are 0o600 regardless.
      try {
        chmodSync(dataDir, 0o700)
      } catch {
        // keep going
      }
      try {
        writeFileSync(filePath, generated, { mode: 0o600, flag: 'wx' })
        fileValue = generated
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          // Inter-process race: the two-step Docker CMD (prepare-db then index) both bootstrap.
          // The loser re-reads what the winner just wrote instead of overwriting it.
          fileValue = readFileSync(filePath, 'utf8').trim()
          if (!spec.validate(fileValue)) {
            throw new Error(
              `[bootstrap] ${spec.envVar}: file at ${filePath} is malformed after a concurrent write (${fileValue.length} chars).`,
            )
          }
        } else {
          throw err
        }
      }
    }

    process.env[spec.envVar] = fileValue
  }

  if (spec.trackSource) {
    encryptionKeySource = source
  }

  return source
}
