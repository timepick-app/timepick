// app.ts transitively imports isomorphic-dompurify (ESM trap) — mock it defensively
// as the newer upload/brand suites do (mirror uploads.routes.test.ts).
jest.mock('isomorphic-dompurify')

import { describe, it, expect, jest, beforeEach, afterEach, afterAll } from '@jest/globals'
import request from 'supertest'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'
import * as organizationLogoService from '../../services/organization-logo.service'

/**
 * Tests d'intégration — miroir setup de l'identité d'organisation (chantier A1).
 * GET/PUT /api/setup/organization + POST/DELETE /api/setup/organization/logo,
 * publics mais protégés par checkSetupNotDone (mirrors setup-smtp.test.ts).
 *
 * `processOrganizationLogo` est stubbé pour les mêmes raisons que dans
 * organization.test.ts (contrainte ESM/ts-jest sur `file-type`).
 */
describe('Setup Organization API', () => {
  async function createAdmin(): Promise<void> {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    await query(`INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3)`, [
      `test-setup-org-admin-${uniqueSuffix}@example.com`,
      'Admin',
      'admin',
    ])
  }

  beforeEach(async () => {
    // Pas d'admin → checkSetupNotDone laisse passer (mirrors setup-smtp.test.ts).
    await query("DELETE FROM users WHERE role = 'admin'")
    await query(
      `INSERT INTO app_config (key, value) VALUES
         ('organization_name', ''),
         ('organization_logo', ''),
         ('organization_description', ''),
         ('homepage_mode', 'facade')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE '%test-setup-org-admin-%'")
  })

  // ===================================================
  // GET /api/setup/organization
  // ===================================================
  describe('GET /api/setup/organization', () => {
    it('retourne les réglages (défauts post-migration) quand le setup n’est pas terminé', async () => {
      const res = await request(testServer()).get('/api/setup/organization')

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual({ name: '', logo: '', description: '', homepageFacade: true })
    })
  })

  // ===================================================
  // PUT /api/setup/organization
  // ===================================================
  describe('PUT /api/setup/organization', () => {
    it('sauvegarde name + description et retourne 200', async () => {
      const res = await request(testServer())
        .put('/api/setup/organization')
        .send({ name: 'Mon Club', description: 'Une description' })

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('Mon Club')
      expect(res.body.data.description).toBe('Une description')
    })

    it('accepte un nom vide : identité enregistrée mais non affichée', async () => {
      const res = await request(testServer())
        .put('/api/setup/organization')
        .send({ name: '', description: 'Une description' })

      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe('')
      expect(res.body.data.description).toBe('Une description')

      const stored = await query(`SELECT value FROM app_config WHERE key = 'organization_name'`)
      expect(stored.rows[0].value).toBe('')
    })
  })

  // ===================================================
  // POST /api/setup/organization/logo
  // ===================================================
  describe('POST /api/setup/organization/logo', () => {
    it('téléverse un logo et retourne son URL', async () => {
      jest
        .spyOn(organizationLogoService, 'processOrganizationLogo')
        .mockResolvedValue('https://cdn.example.com/uploads/emails/org-logos/2026/07/org-logo-setup.webp')

      const res = await request(testServer())
        .post('/api/setup/organization/logo')
        .attach('logo', Buffer.from('fake-png-bytes'), { filename: 'logo.png', contentType: 'image/png' })

      expect(res.status).toBe(200)
      expect(res.body.data.logo).toBe('https://cdn.example.com/uploads/emails/org-logos/2026/07/org-logo-setup.webp')
    })

    it('rejette un fichier vide (400)', async () => {
      const res = await request(testServer())
        .post('/api/setup/organization/logo')
        .attach('logo', Buffer.alloc(0), { filename: 'empty.png', contentType: 'image/png' })

      expect(res.status).toBe(400)
    })
  })

  // ===================================================
  // DELETE /api/setup/organization/logo
  // ===================================================
  describe('DELETE /api/setup/organization/logo', () => {
    it('efface la clé et retourne 204', async () => {
      await query(
        `UPDATE app_config SET value = 'https://cdn.example.com/uploads/emails/org-logos/2026/07/x.webp' WHERE key = 'organization_logo'`,
      )
      jest.spyOn(organizationLogoService, 'deleteOrganizationLogoFile').mockResolvedValue(undefined)

      const res = await request(testServer()).delete('/api/setup/organization/logo')

      expect(res.status).toBe(204)
      const row = await query(`SELECT value FROM app_config WHERE key = 'organization_logo'`)
      expect(row.rows[0].value).toBe('')
    })
  })

  // ===================================================
  // Setup déjà terminé (un admin existe) → 404, checkSetupNotDone
  // ===================================================
  describe('Setup déjà terminé', () => {
    it('GET /organization retourne 404', async () => {
      await createAdmin()
      const res = await request(testServer()).get('/api/setup/organization')
      expect(res.status).toBe(404)
    })

    it('PUT /organization retourne 404', async () => {
      await createAdmin()
      const res = await request(testServer()).put('/api/setup/organization').send({ name: 'x' })
      expect(res.status).toBe(404)
    })

    it('POST /organization/logo retourne 404', async () => {
      await createAdmin()
      const res = await request(testServer())
        .post('/api/setup/organization/logo')
        .attach('logo', Buffer.from('x'), { filename: 'logo.png', contentType: 'image/png' })
      expect(res.status).toBe(404)
    })

    it('DELETE /organization/logo retourne 404', async () => {
      await createAdmin()
      const res = await request(testServer()).delete('/api/setup/organization/logo')
      expect(res.status).toBe(404)
    })
  })
})
