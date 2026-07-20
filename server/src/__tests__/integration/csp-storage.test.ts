// Mock isomorphic-dompurify to avoid @exodus/bytes ESM trap.
// Our test never touches DOMPurify — the mock is only needed because importing
// app.ts pulls in email.service.ts → render-email.service.ts → mjml-compile.service.ts → isomorphic-dompurify.
jest.mock('isomorphic-dompurify')

import request from 'supertest'

const S3_KEYS = ['STORAGE_DRIVER', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'] as const

async function cspHeaderUnder(env: Record<string, string | undefined>): Promise<string> {
  const saved: Record<string, string | undefined> = {}
  for (const k of S3_KEYS) {
    saved[k] = process.env[k]
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]!
  }
  let header = ''
  try {
    await jest.isolateModulesAsync(async () => {
      // Dynamic import (not static): app.ts reads STORAGE_DRIVER at module load
      // time, so each env variant needs a fresh module graph via isolateModulesAsync.
      const appModule = await import('../../app')
      const res = await request(appModule.default).get('/health')
      header = (res.headers['content-security-policy'] as string) || ''
    })
  } finally {
    for (const k of S3_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]!
    }
  }
  return header
}

describe('CSP img-src per storage driver (chantier A)', () => {
  const FULL_S3 = {
    STORAGE_DRIVER: 's3',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'timepick-emails',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    S3_PUBLIC_BASE_URL: 'https://cdn.bucket.example',
    S3_REGION: undefined,
  }

  it('local (default): img-src is self+data, no bucket origin', async () => {
    const h = await cspHeaderUnder({
      STORAGE_DRIVER: undefined,
      S3_ENDPOINT: undefined,
      S3_REGION: undefined,
      S3_BUCKET: undefined,
      S3_ACCESS_KEY_ID: undefined,
      S3_SECRET_ACCESS_KEY: undefined,
      S3_PUBLIC_BASE_URL: undefined,
    })
    expect(h).toContain("img-src 'self' data:")
    expect(h).not.toContain('cdn.bucket.example')
  })

  it('s3: img-src includes the bucket origin', async () => {
    const h = await cspHeaderUnder(FULL_S3)
    expect(h).toContain('https://cdn.bucket.example')
    expect(h).toContain("img-src 'self' data: https://cdn.bucket.example")
  })
})
