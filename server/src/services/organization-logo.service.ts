import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { getStorage } from './storage'

/**
 * Organization logo processing — chantier A1. Separate module from
 * `organization.service.ts` (app_config CRUD) and from `email-upload.service.ts`
 * (untouched): mirrors `processEmailImage`/`deleteEmailImage` but resizes to a
 * square avatar-style bound (512×512, fit inside, never upscaled) instead of the
 * 1200px-wide email illustration bound, and writes under a distinct key/filename
 * so an organization logo is never mistaken for an admin-uploaded email image.
 */

export class UnsupportedOrganizationLogoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedOrganizationLogoError'
  }
}

export class OrganizationLogoProcessingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OrganizationLogoProcessingError'
  }
}

const ALLOWED_MIME: Record<string, true> = {
  'image/png': true,
  'image/jpeg': true,
  'image/webp': true,
}

const LOGO_MAX_DIMENSION = 512

// Same ESM/CommonJS constraint as email-upload.service.ts: file-type v22 is
// ESM-only, and a static `await import('file-type')` would be rewritten to
// `require()` by ts-node/ts-jest's CommonJS output, which fails on ESM
// packages with an "exports" map. `new Function` preserves a real dynamic
// `import()` that Node executes natively.
type FileTypeModule = {
  fileTypeFromBuffer: (buf: Uint8Array) => Promise<{ mime: string; ext: string } | undefined>
}
const dynamicImport = new Function('mod', 'return import(mod)') as (mod: string) => Promise<unknown>

/**
 * Validate + normalise an uploaded organization logo to WebP (max 512×512,
 * `fit: inside`, never upscaled), hand it to the active storage driver, and
 * return the driver's final public URL. `requestOrigin` is the local driver's
 * dev fallback base when `PUBLIC_BASE_URL` is unset (ignored by `s3`) — same
 * mechanic as `processEmailImage`.
 *
 * Storage key: `emails/org-logos/<YYYY>/<MM>/org-logo-<uuid>.webp`. Nested
 * under `emails/` — NOT a claim that a logo is an email asset, but a hard
 * constraint of the storage drivers (`local-driver.ts` / `s3-driver.ts`, out
 * of this chantier's scope, left unmodified): `LocalDriver.delete()` only
 * unlinks paths under `uploads/emails/`, and `S3Driver`'s key derivation only
 * accepts keys rooted at `emails/`. The `org-logos/` sub-path + `org-logo-`
 * filename prefix keep organization logos distinguishable from admin-uploaded
 * email images on disk / in the bucket while staying inside the only
 * namespace the drivers know how to delete from.
 */
export async function processOrganizationLogo(
  buffer: Buffer,
  requestOrigin?: string,
): Promise<string> {
  const fileTypeMod = (await dynamicImport('file-type')) as FileTypeModule
  const ft = await fileTypeMod.fileTypeFromBuffer(buffer)

  if (!ft || !Object.prototype.hasOwnProperty.call(ALLOWED_MIME, ft.mime)) {
    throw new UnsupportedOrganizationLogoError("Format d'image non supporté")
  }

  // Same image-bomb DoS guard as processEmailImage (50 MP cap).
  let processed: Buffer
  try {
    processed = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({
        width: LOGO_MAX_DIMENSION,
        height: LOGO_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Organization] sharp processing failed:', msg)
    }
    if (/limitInputPixels|too large|input image exceeds/i.test(msg)) {
      throw new UnsupportedOrganizationLogoError('Image trop grande (limite : 50 mégapixels)')
    }
    if (/read error|invalid|unsupported|truncated|corrupt/i.test(msg)) {
      throw new UnsupportedOrganizationLogoError('Image illisible ou corrompue')
    }
    throw new OrganizationLogoProcessingError("Erreur lors du décodage de l'image")
  }

  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const key = `emails/org-logos/${yyyy}/${mm}/org-logo-${randomUUID()}.webp`

  const src = await getStorage().active.put(key, processed, 'image/webp', requestOrigin)

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Organization] processed logo %s (%d bytes)', src, processed.length)
  }

  return src
}

/**
 * Best-effort deletion of a previously uploaded organization logo, addressed
 * by the absolute URL persisted in `app_config.organization_logo`. Mirrors
 * `deleteEmailImage`'s mixed-state dispatch so a logo uploaded under one
 * `STORAGE_DRIVER` stays deletable after switching to another.
 */
export async function deleteOrganizationLogoFile(stored: string): Promise<void> {
  const { deleteDrivers, localDriver } = getStorage()
  const owner = deleteDrivers.find((d) => d.owns(stored)) ?? localDriver
  await owner.delete(stored)
}
