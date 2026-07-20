import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

// ---------------------------------------------------------------------------
// Mock the AWS SDK so this suite never touches the network. `send` is created
// once inside the factory closure and reused by every `new S3Client(...)`
// call, so a single reference captured below stays valid for the whole file.
// ---------------------------------------------------------------------------
jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn<() => Promise<any>>().mockResolvedValue({})
  return {
    S3Client: jest.fn(() => ({ send })),
    PutObjectCommand: jest.fn((input) => ({ __cmd: 'Put', input })),
    DeleteObjectCommand: jest.fn((input) => ({ __cmd: 'Delete', input })),
  }
})

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { S3Driver, readS3Config } from '../../services/storage/s3-driver'
import {
  PathOutsideUploadsRootError,
  StorageConfigError,
  getStorage,
  resetStorageForTests,
} from '../../services/storage'

// The mocked `send` is shared across every `new S3Client()` call (closed over
// inside the factory above) — grab it once via a throwaway construction.
const send = (new (S3Client as unknown as new () => { send: jest.Mock<() => Promise<any>> })()).send

const S3_CONFIG = {
  endpoint: 'http://localhost:9000',
  region: 'auto',
  bucket: 'timepick-emails',
  accessKeyId: 'k',
  secretAccessKey: 's',
  publicBaseUrl: 'https://cdn.example.com',
  publicOrigin: 'https://cdn.example.com',
}

beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks() wipes call history but keeps the default implementation
  // (mockResolvedValue is not a *Once queue entry) — restate it explicitly so
  // each test starts from a known-good default regardless of that guarantee.
  send.mockResolvedValue({})
})

describe('S3Driver.put', () => {
  it('uploads via PutObjectCommand and returns the public URL', async () => {
    const driver = new S3Driver(S3_CONFIG)
    const body = Buffer.from('x')

    const url = await driver.put('emails/2026/07/abc.webp', body, 'image/webp')

    expect(url).toBe('https://cdn.example.com/emails/2026/07/abc.webp')
    expect(PutObjectCommand).toHaveBeenCalledTimes(1)
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'timepick-emails',
      Key: 'emails/2026/07/abc.webp',
      Body: body,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=604800',
    })
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('S3Driver.owns', () => {
  const driver = new S3Driver(S3_CONFIG)

  it('is true for a URL starting with the configured publicBaseUrl', () => {
    expect(driver.owns('https://cdn.example.com/emails/2026/07/abc.webp')).toBe(true)
  })

  it('is false for a URL under a different origin', () => {
    expect(driver.owns('https://other/emails/x.webp')).toBe(false)
  })

  it('is false for a legacy local /uploads URL', () => {
    expect(driver.owns('https://app/uploads/emails/x.webp')).toBe(false)
  })

  it('is false for a sibling-hostname prefix without a path boundary', () => {
    expect(driver.owns('https://cdn.example.com.evil.com/emails/x.webp')).toBe(false)
  })
})

describe('S3Driver.delete', () => {
  const driver = new S3Driver(S3_CONFIG)
  const VALID_URL = 'https://cdn.example.com/emails/2026/07/abc.webp'

  it('deletes via DeleteObjectCommand using the key derived from the stored URL', async () => {
    await driver.delete(VALID_URL)

    expect(DeleteObjectCommand).toHaveBeenCalledTimes(1)
    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'timepick-emails',
      Key: 'emails/2026/07/abc.webp',
    })
  })

  describe('path-traversal / scope guards (throw before any send)', () => {
    it('rejects a URL not owned by the configured bucket', async () => {
      await expect(driver.delete('https://other.example.com/emails/x.webp')).rejects.toBeInstanceOf(
        PathOutsideUploadsRootError,
      )
      expect(send).not.toHaveBeenCalled()
    })

    it('rejects a key outside emails/', async () => {
      await expect(driver.delete('https://cdn.example.com/secrets/x')).rejects.toBeInstanceOf(
        PathOutsideUploadsRootError,
      )
      expect(send).not.toHaveBeenCalled()
    })

    it('rejects a key containing a parent-traversal segment', async () => {
      await expect(
        driver.delete('https://cdn.example.com/emails/../secrets'),
      ).rejects.toBeInstanceOf(PathOutsideUploadsRootError)
      expect(send).not.toHaveBeenCalled()
    })

    it('rejects a malformed percent-encoded key', async () => {
      await expect(
        driver.delete('https://cdn.example.com/emails/%E0%A4%A.webp'),
      ).rejects.toBeInstanceOf(PathOutsideUploadsRootError)
      expect(send).not.toHaveBeenCalled()
    })
  })

  it('propagates provider errors from delete (no swallowing)', async () => {
    const err = { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }
    send.mockRejectedValueOnce(err)

    await expect(driver.delete(VALID_URL)).rejects.toEqual(err)
  })
})

describe('readS3Config', () => {
  const ENV_KEYS = [
    'STORAGE_DRIVER',
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_PUBLIC_BASE_URL',
  ] as const

  let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>

  beforeEach(() => {
    saved = {}
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('returns the full config with region/publicBaseUrl defaults, endpoint trailing slash stripped', () => {
    process.env.S3_ENDPOINT = 'https://s3.example.com/'
    process.env.S3_BUCKET = 'timepick-emails'
    process.env.S3_ACCESS_KEY_ID = 'key'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'

    expect(readS3Config()).toEqual({
      endpoint: 'https://s3.example.com',
      region: 'auto',
      bucket: 'timepick-emails',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      publicBaseUrl: 'https://s3.example.com/timepick-emails',
      publicOrigin: 'https://s3.example.com',
    })
  })

  it('honours S3_REGION and S3_PUBLIC_BASE_URL overrides, stripping trailing slashes', () => {
    process.env.S3_ENDPOINT = 'https://s3.example.com'
    process.env.S3_BUCKET = 'timepick-emails'
    process.env.S3_ACCESS_KEY_ID = 'key'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    process.env.S3_REGION = 'nyc3'
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com/'

    const cfg = readS3Config()
    expect(cfg.region).toBe('nyc3')
    expect(cfg.publicBaseUrl).toBe('https://cdn.example.com')
  })

  it('throws StorageConfigError listing a single missing variable', () => {
    process.env.S3_ENDPOINT = 'https://s3.example.com'
    process.env.S3_ACCESS_KEY_ID = 'key'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    // S3_BUCKET intentionally missing.

    expect(() => readS3Config()).toThrow(StorageConfigError)
    expect(() => readS3Config()).toThrow(/S3_BUCKET/)
  })

  it('throws StorageConfigError listing every missing variable', () => {
    // Nothing set at all.
    let caught: unknown
    try {
      readS3Config()
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(StorageConfigError)
    const message = (caught as Error).message
    expect(message).toContain('S3_ENDPOINT')
    expect(message).toContain('S3_BUCKET')
    expect(message).toContain('S3_ACCESS_KEY_ID')
    expect(message).toContain('S3_SECRET_ACCESS_KEY')
  })

  it('throws StorageConfigError when S3_PUBLIC_BASE_URL is not an http(s) URL', () => {
    process.env.S3_ENDPOINT = 'https://s3.example.com'
    process.env.S3_BUCKET = 'timepick-emails'
    process.env.S3_ACCESS_KEY_ID = 'key'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    process.env.S3_PUBLIC_BASE_URL = 'not-a-valid-url'

    expect(() => readS3Config()).toThrow(StorageConfigError)
    expect(() => readS3Config()).toThrow(/S3_PUBLIC_BASE_URL invalide/)
  })
})

describe('getStorage() factory', () => {
  const ENV_KEYS = [
    'STORAGE_DRIVER',
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_PUBLIC_BASE_URL',
  ] as const

  let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>

  beforeEach(() => {
    saved = {}
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    resetStorageForTests()
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    resetStorageForTests()
  })

  it('defaults to the local driver when STORAGE_DRIVER is unset', () => {
    const bundle = getStorage()

    expect(bundle.mode).toBe('local')
    expect(bundle.deleteDrivers).toHaveLength(1)
  })

  it('selects the s3 driver when STORAGE_DRIVER=s3 with a full config', () => {
    process.env.STORAGE_DRIVER = 's3'
    process.env.S3_ENDPOINT = 'https://s3.example.com'
    process.env.S3_BUCKET = 'timepick-emails'
    process.env.S3_ACCESS_KEY_ID = 'key'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com'

    const bundle = getStorage()

    expect(bundle.mode).toBe('s3')
    // Narrow the discriminated union so `s3PublicOrigin` (s3 variant only) is typed.
    if (bundle.mode !== 's3') throw new Error('expected an s3 bundle')
    expect(bundle.active).toBeInstanceOf(S3Driver)
    expect(bundle.deleteDrivers).toHaveLength(2)
    expect(bundle.s3PublicOrigin).toBe('https://cdn.example.com')
  })

  it('throws StorageConfigError when STORAGE_DRIVER=s3 with an incomplete config', () => {
    process.env.STORAGE_DRIVER = 's3'
    process.env.S3_ENDPOINT = 'https://s3.example.com'
    // S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY left unset.

    expect(() => getStorage()).toThrow(StorageConfigError)
  })

  it('throws StorageConfigError for an unknown STORAGE_DRIVER value', () => {
    process.env.STORAGE_DRIVER = 'bogus'

    expect(() => getStorage()).toThrow(StorageConfigError)
  })
})
