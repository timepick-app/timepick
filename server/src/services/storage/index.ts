import { StorageDriver, StorageConfigError } from './storage-driver'
import { LocalDriver } from './local-driver'
import { S3Driver, readS3Config } from './s3-driver'

export { StorageConfigError, PathOutsideUploadsRootError } from './storage-driver'
export type { StorageDriver } from './storage-driver'

/**
 * Resolved storage wiring, discriminated on `mode` so `s3PublicOrigin` is a
 * guaranteed `string` under `s3` and absent under `local` — an incoherent state
 * (s3 without an origin) is unrepresentable. `deleteDrivers` is consulted in
 * order when deleting so mixed-state URLs stay deletable (`[s3, local]` under
 * s3, `[local]` otherwise); `deleteEmailImage` falls back to `localDriver` for
 * any URL no driver claims, preserving the historical throw-on-unknown.
 */
export type StorageBundle =
  | { mode: 'local'; active: StorageDriver; deleteDrivers: StorageDriver[]; localDriver: StorageDriver }
  | {
      mode: 's3'
      active: StorageDriver
      deleteDrivers: StorageDriver[]
      localDriver: StorageDriver
      /** Origin of `S3_PUBLIC_BASE_URL` for the conditional CSP `img-src`. */
      s3PublicOrigin: string
    }

let cached: StorageBundle | undefined

/**
 * Resolve (and memoise) the storage bundle from the environment. First call
 * validates the config and fails fast on an incomplete `s3` setup — invoked at
 * app construction so a misconfigured deploy never binds a port.
 */
export function getStorage(): StorageBundle {
  if (!cached) cached = buildStorage()
  return cached
}

/** Test seam: drop the memoised bundle so a suite can re-resolve under new env. */
export function resetStorageForTests(): void {
  cached = undefined
}

function buildStorage(): StorageBundle {
  const local = new LocalDriver()
  const raw = process.env.STORAGE_DRIVER?.trim().toLowerCase() || 'local'

  if (raw === 'local') {
    return { mode: 'local', active: local, deleteDrivers: [local], localDriver: local }
  }

  if (raw === 's3') {
    const cfg = readS3Config()
    const s3 = new S3Driver(cfg)
    return {
      mode: 's3',
      active: s3,
      deleteDrivers: [s3, local],
      localDriver: local,
      s3PublicOrigin: cfg.publicOrigin,
    }
  }

  throw new StorageConfigError(
    `STORAGE_DRIVER invalide : "${raw}" (valeurs acceptées : "local", "s3")`,
  )
}
