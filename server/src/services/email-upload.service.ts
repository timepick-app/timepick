import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export class UnsupportedImageError extends Error {
  statusCode = 415
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedImageError'
  }
}

export class ImageProcessingError extends Error {
  statusCode = 500
  constructor(message: string) {
    super(message)
    this.name = 'ImageProcessingError'
  }
}

export class PathOutsideUploadsRootError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathOutsideUploadsRootError'
  }
}

/**
 * Resolve the on-disk root for email uploads.
 *
 * Production: `<server-package>/` (so writes land at `<server-package>/uploads/emails/...`).
 * Tests can redirect to a tmpdir via `process.env.UPLOADS_ROOT_OVERRIDE`.
 */
export function getEmailUploadsRoot(): string {
  return process.env.UPLOADS_ROOT_OVERRIDE ?? path.resolve(__dirname, '..', '..')
}

export interface ProcessedEmailImage {
  relPath: string
  urlPath: string
  absPath: string
  width: number
  height: number
  bytes: number
}

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

// file-type v22 is ESM-only and the server compiles to CommonJS. ts-node would
// rewrite a static `await import('file-type')` to require(), which fails on ESM
// packages with an "exports" map. Wrapping the import in `new Function` keeps
// it as a real runtime dynamic import that Node executes natively.
type FileTypeModule = {
  fileTypeFromBuffer: (buf: Uint8Array) => Promise<{ mime: string; ext: string } | undefined>
}
const dynamicImport = new Function('mod', 'return import(mod)') as (mod: string) => Promise<unknown>

export async function processEmailImage(buffer: Buffer): Promise<ProcessedEmailImage> {
  const fileTypeMod = (await dynamicImport('file-type')) as FileTypeModule
  const ft = await fileTypeMod.fileTypeFromBuffer(buffer)

  if (!ft || !ALLOWED_MIME.has(ft.mime)) {
    throw new UnsupportedImageError("Format d'image non supporté")
  }

  // F12 fix: cap input pixels to prevent image-bomb DoS (a small compressed
  // PNG can decode to enormous dimensions in memory). 50 MP is well above any
  // reasonable email illustration; sharp throws above the cap and we re-map
  // to UnsupportedImageError so the client sees a 415, not a 500.
  let processed: Buffer
  try {
    processed = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (process.env.NODE_ENV !== 'production') {
      console.error('[EmailUpload] sharp processing failed:', msg)
    }
    if (/limitInputPixels|too large|input image exceeds/i.test(msg)) {
      throw new UnsupportedImageError('Image trop grande (limite : 50 mégapixels)')
    }
    // Decoder errors (corrupt headers, libspng read errors) are user-input
    // problems — surface as 415 so the client can correct the file rather
    // than retry blindly.
    if (/read error|invalid|unsupported|truncated|corrupt/i.test(msg)) {
      throw new UnsupportedImageError('Image illisible ou corrompue')
    }
    throw new ImageProcessingError("Erreur lors du décodage de l'image")
  }

  const meta = await sharp(processed).metadata()
  if (typeof meta.width !== 'number' || typeof meta.height !== 'number') {
    throw new ImageProcessingError('Dimensions image indéterminées')
  }

  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const uuid = randomUUID()
  const filename = `${uuid}.webp`
  const relDir = `uploads/emails/${yyyy}/${mm}`
  const absDir = path.resolve(getEmailUploadsRoot(), relDir)
  const absPath = path.join(absDir, filename)
  const urlPath = `/${relDir}/${filename}`

  await fs.promises.mkdir(absDir, { recursive: true })
  await fs.promises.writeFile(absPath, processed)

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      '[EmailUpload] processed image %s (%dx%d, %d bytes)',
      urlPath,
      meta.width,
      meta.height,
      processed.length
    )
  }

  return {
    relPath: `${relDir}/${filename}`,
    urlPath,
    absPath,
    width: meta.width,
    height: meta.height,
    bytes: processed.length,
  }
}

/**
 * Best-effort deletion of a previously uploaded email image.
 *
 * Accepts the absolute-URL shape persisted in `email_brand_settings.logo_url`
 * (e.g. `https://host/uploads/emails/2026/05/abc.webp`) — strips host/leading
 * slash, re-anchors against `getEmailUploadsRoot()`, and verifies the resolved
 * path stays inside that root before unlinking. Path-traversal attempts throw
 * `PathOutsideUploadsRootError` BEFORE any filesystem call. ENOENT is the only
 * silent path; any other I/O error (EPERM, EISDIR, EROFS, …) re-throws so the
 * caller can log it.
 */
export async function deleteEmailImage(stored: string): Promise<void> {
  // Strip optional `https?://host` prefix and any leading slash so we have a
  // path that should start with `uploads/emails/`.
  const withoutOrigin = stored.replace(/^https?:\/\/[^/]+/i, '')
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
      `logo_url is not a valid URI-encoded path: ${stored}`,
    )
  }

  if (!relPath.startsWith('uploads/emails/')) {
    throw new PathOutsideUploadsRootError(
      `logo_url does not point inside uploads/emails/: ${stored}`,
    )
  }

  // Defense-in-depth: reject any `..` segment before path.resolve normalizes
  // it away. The downstream startsWith check would only catch escapes past
  // the uploads root, but a `..` segment that lands elsewhere INSIDE the root
  // (e.g. `uploads/emails/../../etc/passwd` resolving to `<root>/etc/passwd`
  // when the root is deep enough) is still an unexpected target.
  if (relPath.split('/').includes('..')) {
    throw new PathOutsideUploadsRootError(
      `logo_url contains parent-traversal segment: ${stored}`,
    )
  }

  const rootAbs = path.resolve(getEmailUploadsRoot()) + path.sep
  const abs = path.resolve(getEmailUploadsRoot(), relPath)

  if (!abs.startsWith(rootAbs)) {
    throw new PathOutsideUploadsRootError(
      `logo_url resolves outside uploads root: ${stored}`,
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
