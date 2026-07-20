import fs from 'node:fs'
import path from 'node:path'
import { StorageDriver, PathOutsideUploadsRootError } from './storage-driver'

/**
 * Resolve the on-disk root for email uploads.
 *
 * Production: `<server-package>/` (so writes land at `<server-package>/uploads/emails/...`).
 * Tests can redirect to a tmpdir via `process.env.UPLOADS_ROOT_OVERRIDE`.
 *
 * (Moved verbatim from `email-upload.service` during chantier A — same env var,
 * same resolution depth, so `UPLOADS_ROOT_OVERRIDE` keeps working unchanged.)
 */
export function getEmailUploadsRoot(): string {
  return process.env.UPLOADS_ROOT_OVERRIDE ?? path.resolve(__dirname, '..', '..', '..')
}

/**
 * Filesystem driver — the historical, default behaviour. Writes the WebP under
 * `<root>/uploads/<key>` and serves it back through `express.static('/uploads')`.
 * Byte-for-byte identical to the pre-chantier-A code path.
 */
export class LocalDriver implements StorageDriver {
  /**
   * Writes `<root>/uploads/emails/<YYYY>/<MM>/<uuid>.webp` and returns the
   * absolute public URL `<base>/uploads/emails/...`, where `<base>` is
   * `PUBLIC_BASE_URL` (trailing-slash-stripped) or, as a dev fallback, the
   * request origin — the exact precedence the upload route used before.
   */
  async put(key: string, body: Buffer, _contentType: string, requestOrigin?: string): Promise<string> {
    const relPath = `uploads/${key}`
    const absPath = path.resolve(getEmailUploadsRoot(), relPath)
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true })
    await fs.promises.writeFile(absPath, body)

    const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '') ?? requestOrigin ?? ''
    return `${base}/${relPath}`
  }

  /**
   * Best-effort deletion of a previously uploaded email image.
   *
   * Accepts the absolute-URL shape persisted in the DB (e.g.
   * `https://host/uploads/emails/2026/05/abc.webp`) — strips host/leading slash,
   * re-anchors against `getEmailUploadsRoot()`, and verifies the resolved path
   * stays inside that root before unlinking. Path-traversal attempts throw
   * `PathOutsideUploadsRootError` BEFORE any filesystem call. ENOENT is the only
   * silent path; any other I/O error (EPERM, EISDIR, EROFS, …) re-throws so the
   * caller can log it.
   */
  async delete(storedUrl: string): Promise<void> {
    // Strip optional `https?://host` prefix and any leading slash so we have a
    // path that should start with `uploads/emails/`.
    const withoutOrigin = storedUrl.replace(/^https?:\/\/[^/]+/i, '')
    const relPathRaw = withoutOrigin.replace(/^\/+/, '')

    // Decode percent-encoded segments BEFORE the structural checks so an
    // attacker can't bypass the `..` filter with `%2E%2E`. malformed URIs throw
    // — re-route to PathOutsideUploadsRootError so the controller logs them as
    // a security event rather than a generic I/O failure.
    let relPath: string
    try {
      relPath = decodeURIComponent(relPathRaw)
    } catch {
      throw new PathOutsideUploadsRootError(
        `logo_url is not a valid URI-encoded path: ${storedUrl}`,
      )
    }

    if (!relPath.startsWith('uploads/emails/')) {
      throw new PathOutsideUploadsRootError(
        `logo_url does not point inside uploads/emails/: ${storedUrl}`,
      )
    }

    // Defense-in-depth: reject any `..` segment before path.resolve normalizes
    // it away. The downstream startsWith check would only catch escapes past
    // the uploads root, but a `..` segment that lands elsewhere INSIDE the root
    // (e.g. `uploads/emails/../../etc/passwd` resolving to `<root>/etc/passwd`
    // when the root is deep enough) is still an unexpected target.
    if (relPath.split('/').includes('..')) {
      throw new PathOutsideUploadsRootError(
        `logo_url contains parent-traversal segment: ${storedUrl}`,
      )
    }

    const rootAbs = path.resolve(getEmailUploadsRoot()) + path.sep
    const abs = path.resolve(getEmailUploadsRoot(), relPath)

    if (!abs.startsWith(rootAbs)) {
      throw new PathOutsideUploadsRootError(
        `logo_url resolves outside uploads root: ${storedUrl}`,
      )
    }

    try {
      await fs.promises.unlink(abs)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw err
    }
  }

  /**
   * A URL is "local" when, once its origin is stripped, it points under
   * `/uploads/` — the app's own static mount. Shape-only: path-traversal is the
   * business of `delete()`, so a malformed `/uploads/...` URL is still claimed
   * here and rejected there (preserving the historical throw-on-bad-URL).
   */
  owns(storedUrl: string): boolean {
    const p = storedUrl.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '')
    return p.startsWith('uploads/')
  }
}
