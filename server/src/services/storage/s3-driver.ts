import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { StorageDriver, StorageConfigError, PathOutsideUploadsRootError } from './storage-driver'

export interface S3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Absolute base URL the object is publicly reachable at (trailing slash stripped). */
  publicBaseUrl: string
  /** Origin (`scheme://host[:port]`) of `publicBaseUrl`, for the conditional CSP `img-src`. */
  publicOrigin: string
}

/**
 * Read + validate the S3 configuration from the environment. Throws a
 * `StorageConfigError` listing every missing variable so the process fails fast
 * at boot (same philosophy as `secret-bootstrap`) rather than 500-ing on the
 * first admin upload. Only called when `STORAGE_DRIVER=s3`.
 */
export function readS3Config(): S3Config {
  const endpoint = process.env.S3_ENDPOINT?.trim()
  const bucket = process.env.S3_BUCKET?.trim()
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()

  const missing: string[] = []
  if (!endpoint) missing.push('S3_ENDPOINT')
  if (!bucket) missing.push('S3_BUCKET')
  if (!accessKeyId) missing.push('S3_ACCESS_KEY_ID')
  if (!secretAccessKey) missing.push('S3_SECRET_ACCESS_KEY')
  if (missing.length > 0) {
    throw new StorageConfigError(
      `STORAGE_DRIVER=s3 mais configuration S3 incomplète — variables manquantes : ${missing.join(', ')}`,
    )
  }

  // Non-null: guarded by the `missing` check above.
  const cleanEndpoint = endpoint!.replace(/\/+$/, '')
  // R2 requires region "auto"; MinIO ignores it; other providers set S3_REGION.
  const region = process.env.S3_REGION?.trim() || 'auto'
  // Default public base = `<endpoint>/<bucket>` (path-style — what MinIO and a
  // bare S3-compatible endpoint expose). Override with S3_PUBLIC_BASE_URL for a
  // CDN / custom domain / virtual-hosted-style bucket.
  const publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL?.trim() || `${cleanEndpoint}/${bucket}`).replace(
    /\/+$/,
    '',
  )

  // Validate the public base parses as an http(s) URL (this also catches a
  // malformed S3_ENDPOINT via the default) and derive its origin HERE, so a bad
  // value fails fast as StorageConfigError instead of a raw TypeError later.
  let publicOrigin: string
  try {
    const parsed = new URL(publicBaseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('scheme')
    publicOrigin = parsed.origin
  } catch {
    throw new StorageConfigError(
      `S3_PUBLIC_BASE_URL invalide (URL http(s) attendue) : "${publicBaseUrl}"`,
    )
  }

  return {
    endpoint: cleanEndpoint,
    region,
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    publicBaseUrl,
    publicOrigin,
  }
}

// 7 days, aligned with the `express.static('/uploads', { maxAge: '7d' })` mount
// so switching drivers doesn't change the cache lifetime of served images.
const CACHE_CONTROL = 'public, max-age=604800'

/**
 * S3-compatible object-store driver (DO Spaces / Cloudflare R2 / Scaleway /
 * MinIO). Objects are public-read (bucket policy, an install-time ops concern);
 * keys use a non-enumerable UUID so public-read is acceptable.
 */
export class S3Driver implements StorageDriver {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBaseUrl: string

  constructor(config: S3Config) {
    this.bucket = config.bucket
    this.publicBaseUrl = config.publicBaseUrl
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Path-style addressing works across MinIO and every major S3-compatible
      // provider; virtual-hosted-style is opt-in via a custom S3_PUBLIC_BASE_URL.
      forcePathStyle: true,
    })
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      }),
    )
    return `${this.publicBaseUrl}/${key}`
  }

  async delete(storedUrl: string): Promise<void> {
    // S3 DELETE is idempotent — a missing key returns 204, so delete resolves
    // silently whether the object was present or already gone. Real errors
    // (auth, network) propagate; the reset controller logs them at warn.
    const key = this.keyFromStoredUrl(storedUrl)
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  owns(storedUrl: string): boolean {
    return storedUrl.startsWith(this.publicBaseUrl + '/')
  }

  /**
   * Derive the object key from a stored public URL, applying the S3-equivalent of
   * the local path-traversal guards: the URL must belong to this bucket, decode
   * cleanly, live under `emails/`, and contain no `..` segment. Anything else
   * throws `PathOutsideUploadsRootError` before any network call.
   */
  private keyFromStoredUrl(storedUrl: string): string {
    if (!storedUrl.startsWith(this.publicBaseUrl + '/')) {
      throw new PathOutsideUploadsRootError(
        `logo_url is not owned by the configured S3 bucket: ${storedUrl}`,
      )
    }

    const rawKey = storedUrl.slice(this.publicBaseUrl.length).replace(/^\/+/, '')

    let key: string
    try {
      key = decodeURIComponent(rawKey)
    } catch {
      throw new PathOutsideUploadsRootError(
        `logo_url is not a valid URI-encoded key: ${storedUrl}`,
      )
    }

    if (!key.startsWith('emails/')) {
      throw new PathOutsideUploadsRootError(
        `logo_url does not point inside emails/: ${storedUrl}`,
      )
    }

    if (key.split('/').includes('..')) {
      throw new PathOutsideUploadsRootError(
        `logo_url contains parent-traversal segment: ${storedUrl}`,
      )
    }

    return key
  }
}
