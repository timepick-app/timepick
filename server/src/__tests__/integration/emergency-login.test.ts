/**
 * Contrat de nom de la connexion d'urgence (split `full_name` → `first_name` /
 * `last_name`, Story S2).
 *
 * `emergencyLogin` est le SEUL endpoint qui mappe `first_name`/`last_name` en
 * camelCase À LA MAIN (recovery.controller.ts:370-371), hors du middleware
 * snakeToCamel global. Ce test verrouille ce mapping (firstName/lastName présents,
 * `fullName`/`full_name` absents) pour qu'un renommage de colonne futur ne casse
 * pas silencieusement la réponse.
 */

import request from 'supertest'
import bcrypt from 'bcrypt'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import { BCRYPT_COST } from '../../services/recovery.service'

describe('POST /api/auth/emergency-login — contrat nom (S2)', () => {
  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'emergency-split-%@test.com'")
  })

  it('renvoie firstName/lastName (camelCase), jamais fullName', async () => {
    const email = `emergency-split-${Date.now()}@test.com`
    const code = 'TIMEPICK-TEST-CODE'

    const admin = await query(
      `INSERT INTO users (email, first_name, last_name, role)
       VALUES ($1, 'Sam', 'Root', 'admin') RETURNING id`,
      [email]
    )
    const adminId = admin.rows[0].id

    // Code de récupération actif : bcrypt-hashé, non utilisé, non expiré.
    const codeHash = await bcrypt.hash(code, BCRYPT_COST)
    await query(
      `INSERT INTO admin_recovery_codes (admin_id, code_hash, code_index, expires_at)
       VALUES ($1, $2, 1, NOW() + INTERVAL '1 day')`,
      [adminId, codeHash]
    )

    const res = await request(testServer())
      .post('/api/auth/emergency-login')
      .send({ email, code })

    expect(res.status).toBe(200)
    expect(res.body.user.firstName).toBe('Sam')
    expect(res.body.user.lastName).toBe('Root')
    expect(res.body.user).not.toHaveProperty('fullName')
    expect(res.body.user).not.toHaveProperty('full_name')
  })
})
