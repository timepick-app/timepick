/**
 * Storage abstraction for admin-uploaded email images (chantier A).
 *
 * A `StorageDriver` hides where a processed WebP image is persisted and how its
 * public URL is shaped. Two implementations exist:
 *   - `LocalDriver` — the historical filesystem behaviour (`server/uploads/...`
 *     served by `express.static`), the default and the free Oracle/Coolify path.
 *   - `S3Driver`    — any S3-compatible object store (DO Spaces / Cloudflare R2 /
 *     Scaleway / MinIO), selected with `STORAGE_DRIVER=s3`.
 *
 * The interface is deliberately tiny and provider-agnostic: the bucket provider
 * and region are the installer's choice, never the maintainer's.
 */
export interface StorageDriver {
  /**
   * Persist `body` under the canonical object key `emails/<YYYY>/<MM>/<uuid>.webp`
   * and return the final public URL recopied verbatim into the DB
   * (`email_brand_settings.logo_url`, shell overrides, invitation MJML). Absolute
   * whenever a base is configured — `PUBLIC_BASE_URL` or the request origin for
   * local, `S3_PUBLIC_BASE_URL` for s3 (always the case in practice).
   *
   * @param requestOrigin Fallback base URL (`<proto>://<host>` of the current
   *   request) used ONLY by the local driver in dev when `PUBLIC_BASE_URL` is
   *   unset. Remote drivers ignore it (their base is `S3_PUBLIC_BASE_URL`).
   */
  put(key: string, body: Buffer, contentType: string, requestOrigin?: string): Promise<string>

  /**
   * Best-effort delete from the stored (absolute) URL. A missing object
   * (ENOENT / 404 / NoSuchKey) resolves silently; a malformed or out-of-scope
   * key throws `PathOutsideUploadsRootError` BEFORE any I/O so the caller can log
   * it as a security event.
   */
  delete(storedUrl: string): Promise<void>

  /**
   * True when this driver recognises (and can delete) `storedUrl`. Used to
   * dispatch deletions in mixed state — a legacy `/uploads/...` URL stays
   * deletable after switching to `s3`, and vice versa.
   */
  owns(storedUrl: string): boolean
}

/**
 * Thrown at boot when `STORAGE_DRIVER=s3` but the S3 configuration is incomplete
 * or `STORAGE_DRIVER` holds an unknown value. Mirrors the fail-fast philosophy of
 * `secret-bootstrap` — refuse to start rather than serve a half-configured store.
 */
export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageConfigError'
  }
}

/**
 * Raised when a stored URL, once reduced to an object key, escapes the driver's
 * allowed namespace (path traversal, absolute-path injection, malformed
 * percent-encoding). Named so the reset controller can log it at `error`
 * severity (security event) rather than `warn`. Re-exported from
 * `email-upload.service` for backward-compatible imports.
 */
export class PathOutsideUploadsRootError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathOutsideUploadsRootError'
  }
}
