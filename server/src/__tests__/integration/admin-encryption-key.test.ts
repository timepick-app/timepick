import request from 'supertest'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import { generateTestMagicLinkToken } from '../helpers/auth'
import * as secretBootstrap from '../../utils/secret-bootstrap'

const KNOWN_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'

describe('Admin encryption-key endpoints - Integration Tests', () => {
  const savedEncryptionKey = process.env.ENCRYPTION_KEY

  afterEach(async () => {
    jest.restoreAllMocks()
    if (savedEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY
    else process.env.ENCRYPTION_KEY = savedEncryptionKey
    await query('DELETE FROM users WHERE email LIKE $1', ['%test-admin-encryption-key%'])
  })

  async function createAdmin(): Promise<string> {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const result = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
      [`test-admin-encryption-key-${uniqueSuffix}@example.com`, 'Admin', 'admin'],
    )
    return result.rows[0].id
  }

  describe('GET /api/admin/encryption-key', () => {
    it('returns 401 without a token', async () => {
      const res = await request(testServer()).get('/api/admin/encryption-key')
      expect(res.status).toBe(401)
    })

    it('returns 200 with source + fingerprint (never the key) for an authenticated admin', async () => {
      const adminId = await createAdmin()
      const token = generateTestMagicLinkToken(adminId)

      const res = await request(testServer())
        .get('/api/admin/encryption-key')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(['env', 'file']).toContain(res.body.data.source)
      expect(res.body.data.fingerprint).toMatch(/^[0-9a-f]{12}$/)
      expect(res.body.data.key).toBeUndefined()
    })

    it('returns 403 for an authenticated non-admin user', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const result = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-admin-encryption-key-${uniqueSuffix}@example.com`, 'User', 'user'],
      )
      const token = generateTestMagicLinkToken(result.rows[0].id)

      const res = await request(testServer())
        .get('/api/admin/encryption-key')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
    })
  })

  describe('POST /api/admin/encryption-key/reveal', () => {
    it('returns 401 without a token', async () => {
      const res = await request(testServer()).post('/api/admin/encryption-key/reveal')
      expect(res.status).toBe(401)
    })

    it('returns 403 KEY_ENV_MANAGED when source is env', async () => {
      const adminId = await createAdmin()
      const token = generateTestMagicLinkToken(adminId)
      jest.spyOn(secretBootstrap, 'getEncryptionKeySource').mockReturnValue('env')

      const res = await request(testServer())
        .post('/api/admin/encryption-key/reveal')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('KEY_ENV_MANAGED')
    })

    it('returns 200 with the raw key equal to process.env.ENCRYPTION_KEY when source is file', async () => {
      const adminId = await createAdmin()
      const token = generateTestMagicLinkToken(adminId)
      process.env.ENCRYPTION_KEY = KNOWN_KEY
      jest.spyOn(secretBootstrap, 'getEncryptionKeySource').mockReturnValue('file')

      const res = await request(testServer())
        .post('/api/admin/encryption-key/reveal')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data.key).toBe(KNOWN_KEY)
    })
  })
})
