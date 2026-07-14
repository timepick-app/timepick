import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import pool from '../../db/pool'
import * as emailService from '../../services/email-send.service'
import * as recoveryService from '../../services/recovery.service'
import * as authService from '../../services/auth.service'
import { configService } from '../../services/config.service'

/**
 * Intégration `updateUser` (PUT /admin/users/:id) — effets de bord du
 * changement de rôle (plan « Email de changement de rôle membre », AC-1→AC-8).
 *
 * DB réelle (UPDATE users) ; les collaborateurs email/recovery sont espionnés
 * pour rester déterministes (aucun bcrypt réel, aucun envoi SMTP, aucune
 * écriture admin_recovery_codes).
 */

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const tokenFor = (userId: string) => jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })

describe('updateUser — effets de bord du changement de rôle', () => {
  // Admin « gardien » : reste admin pour que adminCount >= 2 et que la garde
  // « dernier administrateur » ne bloque jamais la rétrogradation d'un admin de test.
  let guardAdminId: string
  let guardToken: string
  let targetId: string
  let targetEmail: string

  beforeAll(async () => {
    const res = await pool.query(`
      INSERT INTO users (email, first_name, role)
      VALUES ('test-rolechg-guard@test.com', 'Guard Admin', 'admin')
      ON CONFLICT (email) DO UPDATE SET role = 'admin'
      RETURNING id
    `)
    guardAdminId = res.rows[0].id
    guardToken = tokenFor(guardAdminId)
  })

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE 'test-rolechg-%@test.com'")
  })

  beforeEach(async () => {
    jest.restoreAllMocks()
    jest.spyOn(recoveryService, 'generateAndStoreCodes').mockResolvedValue(['AAAA-1111'])
    jest.spyOn(recoveryService, 'invalidateRecoveryCodes').mockResolvedValue(undefined)
    jest.spyOn(emailService, 'sendRoleChangedEmail').mockResolvedValue(true)
    jest.spyOn(configService, 'getMagicLinkConfig').mockResolvedValue({ adminTTL: 86400, userTTL: 604800, sessionTTL: 7200 })
    jest.spyOn(authService, 'generateMagicLink').mockResolvedValue({ link: 'https://test.local/magic-token', expirationDate: new Date() })
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await pool.query("DELETE FROM users WHERE email LIKE 'test-rolechg-target%@test.com'")
  })

  async function makeTarget(role: 'user' | 'admin'): Promise<string> {
    const email = `test-rolechg-target-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`
    const res = await pool.query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, 'Target', $2) RETURNING id`,
      [email, role],
    )
    targetEmail = email
    return res.rows[0].id
  }

  const put = (id: string, token: string, body: Record<string, unknown>) =>
    request(testServer()).put(`/api/admin/users/${id}`).set('Authorization', `Bearer ${token}`).send(body)

  // AC-1 — variante correcte
  it('AC-1 promotion → sendRoleChangedEmail(..., "promoted")', async () => {
    targetId = await makeTarget('user')
    const res = await put(targetId, guardToken, { role: 'admin', sendRoleNotification: true })
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('admin')
    expect(emailService.sendRoleChangedEmail).toHaveBeenCalledWith(targetEmail, 'Target', null, 'promoted', 'https://test.local/magic-token')
  })

  it('AC-1 rétrogradation → sendRoleChangedEmail(..., "demoted")', async () => {
    targetId = await makeTarget('admin')
    const res = await put(targetId, guardToken, { role: 'user', sendRoleNotification: true })
    expect(res.status).toBe(200)
    expect(res.body.role).toBe('user')
    expect(emailService.sendRoleChangedEmail).toHaveBeenCalledWith(targetEmail, 'Target', null, 'demoted', undefined)
  })

  // AC-2 — opt-in respecté
  it('AC-2 sendRoleNotification:false → pas de sendRoleChangedEmail', async () => {
    targetId = await makeTarget('user')
    const res = await put(targetId, guardToken, { role: 'admin', sendRoleNotification: false })
    expect(res.status).toBe(200)
    expect(emailService.sendRoleChangedEmail).not.toHaveBeenCalled()
    expect(recoveryService.generateAndStoreCodes).not.toHaveBeenCalled()
  })

  // AC-3 — rôle inchangé / absent
  it('AC-3 rôle absent → aucun email de rôle, aucune génération de codes', async () => {
    targetId = await makeTarget('user')
    const res = await put(targetId, guardToken, { first_name: 'Renommé', sendRoleNotification: true })
    expect(res.status).toBe(200)
    expect(emailService.sendRoleChangedEmail).not.toHaveBeenCalled()
    expect(recoveryService.generateAndStoreCodes).not.toHaveBeenCalled()
    expect(recoveryService.invalidateRecoveryCodes).not.toHaveBeenCalled()
  })

  it('AC-3 rôle identique → aucun effet de bord', async () => {
    targetId = await makeTarget('user')
    const res = await put(targetId, guardToken, { role: 'user', sendRoleNotification: true })
    expect(res.status).toBe(200)
    expect(emailService.sendRoleChangedEmail).not.toHaveBeenCalled()
    expect(recoveryService.generateAndStoreCodes).not.toHaveBeenCalled()
  })

  // AC-5 — rétrogradation ⇒ invalidation
  it('AC-5 rétrogradation → invalidateRecoveryCodes(id) appelé', async () => {
    targetId = await makeTarget('admin')
    const res = await put(targetId, guardToken, { role: 'user', sendRoleNotification: false })
    expect(res.status).toBe(200)
    expect(recoveryService.invalidateRecoveryCodes).toHaveBeenCalledWith(targetId)
  })

  // AC-6 — best-effort
  it('AC-6 sendRoleChangedEmail rejette → réponse 200, rôle persisté', async () => {
    jest.spyOn(emailService, 'sendRoleChangedEmail').mockRejectedValue(new Error('smtp down'))
    targetId = await makeTarget('admin')
    const res = await put(targetId, guardToken, { role: 'user', sendRoleNotification: true })
    expect(res.status).toBe(200)
    const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [targetId])
    expect(rows[0].role).toBe('user')
  })

  // AC-7 — dernier admin
  it('AC-7 dernier admin → 409, aucun effet de bord email', async () => {
    // Isole : un seul admin (le gardien). On le rétrograde lui-même via son token.
    await pool.query("UPDATE users SET role = 'user' WHERE role = 'admin' AND id <> $1", [guardAdminId])
    try {
      const res = await put(guardAdminId, guardToken, { role: 'user', sendRoleNotification: true })
      expect(res.status).toBe(409)
      expect(emailService.sendRoleChangedEmail).not.toHaveBeenCalled()
      expect(recoveryService.invalidateRecoveryCodes).not.toHaveBeenCalled()
    } finally {
      await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [guardAdminId])
    }
  })

  // AC-8 — auto-rétrogradation
  it('AC-8 auto-rétrogradation → selfDemoted:true ET sendRoleChangedEmail(..., "demoted")', async () => {
    targetId = await makeTarget('admin')
    // L'admin agit sur lui-même : son token porte son propre id.
    const res = await put(targetId, tokenFor(targetId), { role: 'user', sendRoleNotification: true })
    expect(res.status).toBe(200)
    expect(res.body.selfDemoted).toBe(true)
    expect(emailService.sendRoleChangedEmail).toHaveBeenCalledWith(targetEmail, 'Target', null, 'demoted', undefined)
  })

  // AC-9 — promotion : lien auto-login (magic-link admin, TTL existant) dans l'email
  it('AC-9 promotion → generateMagicLink(userId, adminTTL) et lien passé en 4e arg', async () => {
    targetId = await makeTarget('user')
    const res = await put(targetId, guardToken, { role: 'admin', sendRoleNotification: true })
    expect(res.status).toBe(200)
    expect(authService.generateMagicLink).toHaveBeenCalledWith({ userId: targetId, ttl: 86400 })
    expect(emailService.sendRoleChangedEmail).toHaveBeenCalledWith(targetEmail, 'Target', null, 'promoted', 'https://test.local/magic-token')
  })

  // AC-10 — rétrogradation : aucun magic-link généré
  it('AC-10 rétrogradation → generateMagicLink NON appelé', async () => {
    targetId = await makeTarget('admin')
    const res = await put(targetId, guardToken, { role: 'user', sendRoleNotification: true })
    expect(res.status).toBe(200)
    expect(authService.generateMagicLink).not.toHaveBeenCalled()
  })
})
