import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LocalDriver } from '../../services/storage/local-driver'
import { PathOutsideUploadsRootError } from '../../services/storage/storage-driver'

// Unit-tests the local driver in isolation (no DB, no app). Covers the URL-shaping
// contract relocated from uploads.routes.ts — the "default local = byte-identical"
// guarantee — plus owns() dispatch shape and the path-traversal guards.
describe('LocalDriver', () => {
  const driver = new LocalDriver()
  let root: string
  let savedRoot: string | undefined
  let savedBase: string | undefined

  beforeAll(() => {
    savedRoot = process.env.UPLOADS_ROOT_OVERRIDE
    savedBase = process.env.PUBLIC_BASE_URL
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-local-driver-'))
    process.env.UPLOADS_ROOT_OVERRIDE = root
  })

  afterAll(() => {
    if (savedRoot === undefined) delete process.env.UPLOADS_ROOT_OVERRIDE
    else process.env.UPLOADS_ROOT_OVERRIDE = savedRoot
    fs.rmSync(root, { recursive: true, force: true })
  })

  afterEach(() => {
    if (savedBase === undefined) delete process.env.PUBLIC_BASE_URL
    else process.env.PUBLIC_BASE_URL = savedBase
  })

  describe('put — URL shaping', () => {
    it('prefers PUBLIC_BASE_URL (trailing slash stripped) and writes under uploads/', async () => {
      process.env.PUBLIC_BASE_URL = 'https://cdn.example.com/'
      const url = await driver.put('emails/2026/07/abc.webp', Buffer.from('webp'), 'image/webp', 'http://localhost:3000')

      expect(url).toBe('https://cdn.example.com/uploads/emails/2026/07/abc.webp')
      expect(fs.existsSync(path.join(root, 'uploads/emails/2026/07/abc.webp'))).toBe(true)
    })

    it('falls back to the request origin when PUBLIC_BASE_URL is unset', async () => {
      delete process.env.PUBLIC_BASE_URL
      const url = await driver.put('emails/2026/07/def.webp', Buffer.from('webp'), 'image/webp', 'http://localhost:3000')

      expect(url).toBe('http://localhost:3000/uploads/emails/2026/07/def.webp')
    })
  })

  describe('owns', () => {
    it('claims /uploads-shaped URLs (absolute or root-relative)', () => {
      expect(driver.owns('https://app.example/uploads/emails/x.webp')).toBe(true)
      expect(driver.owns('/uploads/emails/x.webp')).toBe(true)
    })

    it('disclaims a bucket URL', () => {
      expect(driver.owns('https://cdn.example.com/emails/x.webp')).toBe(false)
    })
  })

  describe('delete', () => {
    it('unlinks an existing file', async () => {
      const rel = 'uploads/emails/2026/07/del.webp'
      fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true })
      fs.writeFileSync(path.join(root, rel), 'x')

      await driver.delete('https://app.example/uploads/emails/2026/07/del.webp')

      expect(fs.existsSync(path.join(root, rel))).toBe(false)
    })

    it('resolves silently on a missing file (ENOENT)', async () => {
      await expect(
        driver.delete('https://app.example/uploads/emails/2026/07/gone.webp'),
      ).resolves.toBeUndefined()
    })

    it('throws PathOutsideUploadsRootError on a parent-traversal segment', async () => {
      await expect(
        driver.delete('https://app.example/uploads/emails/../../etc/passwd'),
      ).rejects.toBeInstanceOf(PathOutsideUploadsRootError)
    })

    it('throws PathOutsideUploadsRootError on a non-uploads URL', async () => {
      await expect(driver.delete('https://app.example/secrets/x')).rejects.toBeInstanceOf(
        PathOutsideUploadsRootError,
      )
    })
  })
})
