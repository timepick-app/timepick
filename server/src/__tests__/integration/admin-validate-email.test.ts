import request from 'supertest'
import { describe, it, expect, jest, beforeEach, afterEach, beforeAll } from '@jest/globals'

const mockResolveMx = jest.fn() as jest.MockedFunction<(domain: string) => Promise<{ priority: number; exchange: string }[]>>

jest.mock('dns', () => ({
  __esModule: true,
  default: {
    promises: { resolveMx: mockResolveMx },
  },
  promises: { resolveMx: mockResolveMx },
}))

import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import { generateTestMagicLinkToken } from '../helpers/auth'
import { _resetMxCacheForTests } from '../../services/emailValidator.service'

const EMAIL_TAG = 'test-validate-email'

async function createTestUser(role: 'admin' | 'user' = 'admin'): Promise<{ id: string; email: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `${EMAIL_TAG}-${suffix}@example.com`
  const result = await query(
    `INSERT INTO users (email, first_name, role)
     VALUES ($1, $2, $3)
     RETURNING id, email`,
    [email, 'Validate Email Tester', role]
  )
  return result.rows[0]
}

describe('GET /api/admin/users/validate-email', () => {
  beforeAll(() => {
    // Make sure leftover state from earlier suites can't influence outcomes.
    _resetMxCacheForTests()
  })

  beforeEach(() => {
    _resetMxCacheForTests()
    mockResolveMx.mockReset()
  })

  afterEach(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', [`%${EMAIL_TAG}%`])
  })

  describe('auth', () => {
    it('returns 401 without a bearer token', async () => {
      const res = await request(testServer()).get('/api/admin/users/validate-email').query({ email: 'a@b.co' })
      expect(res.status).toBe(401)
    })

    it('returns 403 when caller is not admin', async () => {
      const user = await createTestUser('user')
      const token = generateTestMagicLinkToken(user.id)
      const res = await request(testServer())
        .get('/api/admin/users/validate-email')
        .set('Authorization', `Bearer ${token}`)
        .query({ email: 'a@b.co' })
      expect(res.status).toBe(403)
    })
  })

  describe('admin caller', () => {
    let adminToken: string

    beforeEach(async () => {
      const admin = await createTestUser('admin')
      adminToken = generateTestMagicLinkToken(admin.id)
    })

    it('returns 400 with INVALID_FORMAT when the email regex fails', async () => {
      const res = await request(testServer())
        .get('/api/admin/users/validate-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ email: 'not-an-email' })

      expect(res.status).toBe(400)
      expect(res.body.error?.code).toBe('INVALID_FORMAT')
      expect(mockResolveMx).not.toHaveBeenCalled()
    })

    it('returns 400 with MISSING_EMAIL when the query param is absent', async () => {
      const res = await request(testServer())
        .get('/api/admin/users/validate-email')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error?.code).toBe('MISSING_EMAIL')
    })

    it('returns 200 with no warning when the domain has MX records', async () => {
      mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.gmail.com' }])

      const res = await request(testServer())
        .get('/api/admin/users/validate-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ email: 'alice@gmail.com' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ valid: true, warning: null })
    })

    it('returns 200 with NO_MX_RECORD when the domain looks misspelled (ENOTFOUND)', async () => {
      const err = new Error('ENOTFOUND') as NodeJS.ErrnoException
      err.code = 'ENOTFOUND'
      mockResolveMx.mockRejectedValueOnce(err)

      const res = await request(testServer())
        .get('/api/admin/users/validate-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ email: 'alice@gmail.con' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        valid: true,
        warning: 'NO_MX_RECORD',
        domain: 'gmail.con',
      })
    })

    it('returns 200 with DNS_UNAVAILABLE on transient resolver failure', async () => {
      const err = new Error('ECONNREFUSED') as NodeJS.ErrnoException
      err.code = 'ECONNREFUSED'
      mockResolveMx.mockRejectedValueOnce(err)

      const res = await request(testServer())
        .get('/api/admin/users/validate-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ email: 'alice@flaky.test' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ valid: true, warning: 'DNS_UNAVAILABLE' })
    })

    it('does not collide with the /users/:id route (route ordering)', async () => {
      mockResolveMx.mockResolvedValueOnce([{ priority: 10, exchange: 'mx.example.com' }])

      const res = await request(testServer())
        .get('/api/admin/users/validate-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ email: 'alice@example.com' })

      // If the route fell through to /users/:id with id="validate-email", we'd
      // see a 404 user-not-found shape instead of a validation payload.
      expect(res.status).toBe(200)
      expect(res.body.valid).toBe(true)
    })
  })
})
