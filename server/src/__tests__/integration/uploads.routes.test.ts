// app.ts transitively imports isomorphic-dompurify (ESM trap) — mock it as the
// other integration suites do (mirror email-brand-settings.test.ts).
jest.mock('isomorphic-dompurify')

import { describe, it, expect, jest, beforeAll, afterAll, afterEach } from '@jest/globals'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'
import * as emailUpload from '../../services/email-upload.service'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// Pins the ROUTE contract of POST /api/admin/uploads/email-image: the frozen
// GrapesJS envelope {data:[{src,type,width,height}]}, the result→field mapping,
// the request-origin passthrough, and the admin guard.
//
// processEmailImage is stubbed: its `file-type` ESM dynamic import (a native
// `import()` behind `new Function`) can't run under ts-jest's CommonJS VM, which
// is why no full end-to-end route test exists. The driver write path is covered
// by local-driver.test.ts (unit) and the MinIO smoke (real).
describe('POST /api/admin/uploads/email-image — route contract', () => {
  let adminToken: string
  let adminId: string

  beforeAll(async () => {
    const r = await query<{ id: string }>(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
      [`test-uploads-admin-${Date.now()}@example.com`, 'Uploads Admin', 'admin'],
    )
    adminId = r.rows[0].id
    adminToken = jwt.sign({ userId: adminId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  })

  afterAll(async () => {
    await query('DELETE FROM users WHERE id = $1', [adminId])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('maps the driver result to the GrapesJS envelope and passes the request origin', async () => {
    const spy = jest.spyOn(emailUpload, 'processEmailImage').mockResolvedValue({
      src: 'https://cdn.example.com/uploads/emails/2026/07/abc.webp',
      width: 120,
      height: 80,
      bytes: 512,
    })

    const res = await request(testServer())
      .post('/api/admin/uploads/email-image')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('image', Buffer.from('multer-parses-this'), { filename: 'logo.png', contentType: 'image/png' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      data: [
        { src: 'https://cdn.example.com/uploads/emails/2026/07/abc.webp', type: 'image', width: 120, height: 80 },
      ],
    })
    expect(spy).toHaveBeenCalledTimes(1)
    // Second arg is the request origin threaded to the local driver's dev fallback.
    expect(spy.mock.calls[0][1]).toMatch(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/)
  })

  it('rejects an unauthenticated upload with 401', async () => {
    const res = await request(testServer()).post('/api/admin/uploads/email-image')
    expect(res.status).toBe(401)
  })
})
