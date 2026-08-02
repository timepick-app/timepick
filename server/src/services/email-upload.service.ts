import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { getStorage } from './storage'

// Re-exported so existing importers (`email-brand-settings.controller`) keep
// resolving it from this module after the storage refactor (chantier A).
export { PathOutsideUploadsRootError } from './storage'

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

export interface ProcessedEmailImage {
  /** Final absolute public URL, recopied verbatim into the DB. */
  src: string
  width: number
  height: number
  bytes: number
}

const ALLOWED_MIME: Record<string, true> = {
  'image/png': true,
  'image/jpeg': true,
  'image/webp': true,
}

// file-type v22 is ESM-only and the server compiles to CommonJS. ts-node would
// rewrite a static `await import('file-type')` to require(), which fails on ESM
// packages with an "exports" map. Wrapping the import in `new Function` keeps
// it as a real runtime dynamic import that Node executes natively.
type FileTypeModule = {
  fileTypeFromBuffer: (buf: Uint8Array) => Promise<{ mime: string; ext: string } | undefined>
}
const dynamicImport = new Function('mod', 'return import(mod)') as (mod: string) => Promise<unknown>

/**
 * Validate + normalise an uploaded image to WebP, hand it to the active storage
 * driver, and return the driver's final public URL. `requestOrigin` is the local
 * driver's dev fallback base when `PUBLIC_BASE_URL` is unset (ignored by `s3`).
 */
export async function processEmailImage(
  buffer: Buffer,
  requestOrigin?: string,
): Promise<ProcessedEmailImage> {
  const fileTypeMod = (await dynamicImport('file-type')) as FileTypeModule
  const ft = await fileTypeMod.fileTypeFromBuffer(buffer)

  if (!ft || !Object.prototype.hasOwnProperty.call(ALLOWED_MIME, ft.mime)) {
    throw new UnsupportedImageError("Ce format d'image n'est pas pris en charge. Utilisez un fichier JPEG, PNG ou WebP.")
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
      throw new UnsupportedImageError('Cette image est trop grande pour être traitée. Réduisez ses dimensions, puis réessayez.')
    }
    // Decoder errors (corrupt headers, libspng read errors) are user-input
    // problems — surface as 415 so the client can correct the file rather
    // than retry blindly.
    if (/read error|invalid|unsupported|truncated|corrupt/i.test(msg)) {
      throw new UnsupportedImageError('Cette image est illisible ou endommagée. Choisissez un autre fichier.')
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
  // Canonical object key, driver-agnostic: `emails/<YYYY>/<MM>/<uuid>.webp`.
  // The local driver maps it under `uploads/`; the s3 driver uses it verbatim.
  const key = `emails/${yyyy}/${mm}/${randomUUID()}.webp`

  const src = await getStorage().active.put(key, processed, 'image/webp', requestOrigin)

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      '[EmailUpload] processed image %s (%dx%d, %d bytes)',
      src,
      meta.width,
      meta.height,
      processed.length,
    )
  }

  return { src, width: meta.width, height: meta.height, bytes: processed.length }
}

/**
 * Best-effort deletion of a previously uploaded email image, addressed by the
 * absolute URL persisted in the DB. Dispatches to the driver that owns the URL
 * so mixed-state cleanup works (a legacy `/uploads/...` logo stays deletable
 * after switching to `s3`, and vice versa); any URL no driver claims falls
 * through to the local driver, whose guards throw `PathOutsideUploadsRootError`
 * on out-of-scope paths. ENOENT / 404 resolve silently.
 *
 * Kept as a named export on this module — it is the historical delete entry
 * point and a test seam (`jest.spyOn(emailUploadService, 'deleteEmailImage')`).
 */
export async function deleteEmailImage(stored: string): Promise<void> {
  const { deleteDrivers, localDriver } = getStorage()
  const owner = deleteDrivers.find((d) => d.owns(stored)) ?? localDriver
  await owner.delete(stored)
}
