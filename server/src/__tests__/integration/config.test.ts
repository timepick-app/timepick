import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Tests d'intégration pour la configuration (polling + magic link)
 *
 * Ces tests vérifient que l'endpoint de configuration permet de
 * récupérer et modifier la fréquence de polling et les TTL des magic links.
 */
describe('Configuration Polling', () => {
  let adminToken: string
  let adminUserId: string

  /**
   * Helper pour créer un utilisateur admin de test
   */
  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-config-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
    )
    return userResult.rows[0]
  }

  /**
   * Helper pour générer un token admin valide
   */
  function generateAdminToken(userId: string): string {
    return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  }

  // Setup: Créer un admin et générer son token avant tous les tests
  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminUserId = admin.id
    adminToken = generateAdminToken(adminUserId)
  })

  // Nettoyer l'admin à la fin
  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE '%test-config-admin-%'")
  })

  // Réinitialiser la valeur par défaut avant chaque test
  beforeEach(async () => {
    await query(
      `INSERT INTO app_config (key, value) VALUES ('polling_interval', '30000')
       ON CONFLICT (key) DO UPDATE SET value = '30000'`
    )
  })

  describe('GET /api/admin/config/polling-interval', () => {
    it('retourne la fréquence de polling', async () => {
      const res = await request(testServer())
        .get('/api/admin/config/polling-interval')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toBeDefined()
      expect(res.body.data.interval).toBe(30000)
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer())
        .get('/api/admin/config/polling-interval')

      expect(res.status).toBe(401)
    })

    it('retourne 403 pour un utilisateur non-admin', async () => {
      // Créer un utilisateur régulier
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-config-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .get('/api/admin/config/polling-interval')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })
  })

  describe('PUT /api/admin/config/polling-interval', () => {
    it('modifie la fréquence de polling', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 60000 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.interval).toBe(60000)

      // Vérifier que la valeur a été sauvegardée en base
      const dbResult = await query("SELECT value FROM app_config WHERE key = 'polling_interval'")
      expect(dbResult.rows[0].value).toBe('60000')
    })

    it('accepte la valeur minimale valide (10000ms)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 10000 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.interval).toBe(10000)
    })

    it('accepte la valeur maximale valide (120000ms)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 120000 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.interval).toBe(120000)
    })

    it('rejette les valeurs < 10000 (10s)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 9999 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('10000')
    })

    it('rejette les valeurs > 120000 (120s)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 120001 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('120000')
    })

    it('rejette les valeurs négatives', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: -5000 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it('rejette les valeurs non numériques', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 'invalid' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })

    it('accepte 0 pour désactiver le polling', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 0 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.interval).toBe(0)
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 60000 })

      expect(res.status).toBe(401)
    })

    it('retourne 403 pour un utilisateur non-admin', async () => {
      // Créer un utilisateur régulier
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-config-user2-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({ interval: 60000 })
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      // Nettoyer
      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })

    it('rejette une requête sans le champ interval', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/polling-interval')
        .send({})
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
    })
  })
})

describe('Configuration Magic Link', () => {
  let adminToken: string
  let adminUserId: string

  /**
   * Helper pour créer un utilisateur admin de test
   */
  async function createTestAdmin() {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const userResult = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, first_name, role`,
      [`test-magic-config-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin']
    )
    return userResult.rows[0]
  }

  /**
   * Helper pour générer un token admin valide
   */
  function generateAdminToken(userId: string): string {
    return jwt.sign({ userId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  }

  // Setup: Créer un admin et générer son token avant tous les tests
  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminUserId = admin.id
    adminToken = generateAdminToken(adminUserId)
  })

  // Nettoyer l'admin à la fin
  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE '%test-magic-config-admin-%'")
  })

  // Réinitialiser les valeurs par défaut avant chaque test
  beforeEach(async () => {
    await query(
      `INSERT INTO app_config (key, value) VALUES
        ('magic_link_admin_ttl', '86400'),
        ('magic_link_user_ttl', '604800')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    )
  })

  describe('GET /api/admin/config/magic-link', () => {
    it('retourne la configuration des magic links avec sessionTTL', async () => {
      const res = await request(testServer())
        .get('/api/admin/config/magic-link')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toBeDefined()
      expect(res.body.data).toHaveProperty('adminTTL')
      expect(res.body.data).toHaveProperty('userTTL')
      expect(res.body.data).toHaveProperty('sessionTTL')
      expect(res.body.data.adminTTL).toBe(86400)
      expect(res.body.data.userTTL).toBe(604800)
      expect(res.body.data.sessionTTL).toBeDefined()
    })

    it('retourne la valeur par défaut (7200s) quand session_ttl pas en base', async () => {
      // Supprimer session_ttl de la base pour tester le comportement par défaut
      await query("DELETE FROM app_config WHERE key = 'session_ttl'")

      const res = await request(testServer())
        .get('/api/admin/config/magic-link')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.sessionTTL).toBe(7200) // 2 heures = valeur par défaut

      // Restaurer la valeur par défaut pour les autres tests (utiliser ON CONFLICT pour éviter les erreurs)
      await query("INSERT INTO app_config (key, value) VALUES ('session_ttl', '7200') ON CONFLICT (key) DO UPDATE SET value = '7200'")
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer())
        .get('/api/admin/config/magic-link')

      expect(res.status).toBe(401)
    })

    it('retourne 403 pour un utilisateur non-admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-magic-config-user-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .get('/api/admin/config/magic-link')
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })
  })

  describe('PUT /api/admin/config/magic-link', () => {
    it('modifie la configuration des magic links', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 43200, userTTL: 900, sessionTTL: 3600 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveProperty('adminTTL')
      expect(res.body.data).toHaveProperty('userTTL')
      expect(res.body.data).toHaveProperty('sessionTTL')
      expect(res.body.data.adminTTL).toBe(43200)
      expect(res.body.data.userTTL).toBe(900)
      expect(res.body.data.sessionTTL).toBe(3600)

      // Vérifier que les valeurs ont été sauvegardées en base
      const dbResult = await query("SELECT key, value FROM app_config WHERE key LIKE 'magic_link_%' OR key = 'session_ttl'")
      const adminConfig = dbResult.rows.find((row: any) => row.key === 'magic_link_admin_ttl')
      const userConfig = dbResult.rows.find((row: any) => row.key === 'magic_link_user_ttl')
      const sessionConfig = dbResult.rows.find((row: any) => row.key === 'session_ttl')
      expect(adminConfig?.value).toBe('43200')
      expect(userConfig?.value).toBe('900')
      expect(sessionConfig?.value).toBe('3600')
    })

    it('accepte la valeur minimale valide pour admin (60 secondes)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 60, userTTL: 1800, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.adminTTL).toBe(60)
    })

    it('accepte la valeur maximale valide pour admin (7 jours)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 604800, userTTL: 1800, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.adminTTL).toBe(604800)
    })

    it('accepte la valeur minimale valide pour user (60 secondes)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 60, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.userTTL).toBe(60)
    })

    it('accepte la valeur maximale valide pour user (30 jours)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 2592000, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.userTTL).toBe(2592000)
    })

    it('accepte la valeur minimale valide pour session (5 minutes)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 1800, sessionTTL: 300 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.sessionTTL).toBe(300)
    })

    it('accepte la valeur maximale valide pour session (24 heures)', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 1800, sessionTTL: 86400 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.sessionTTL).toBe(86400)
    })

    it('rejette adminTTL < 60 secondes', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 59, userTTL: 1800, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('60')
    })

    it('rejette adminTTL > 7 jours', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 604801, userTTL: 1800, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('7')
    })

    it('rejette userTTL < 60 secondes', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 59, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('60')
    })

    it('rejette userTTL > 30 jours', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 2592001, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('30')
    })

    it('rejette sessionTTL < 5 minutes', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 1800, sessionTTL: 299 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('5')
    })

    it('rejette sessionTTL > 24 heures', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 1800, sessionTTL: 86401 })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toContain('24')
    })

    it('retourne 401 sans token', async () => {
      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 1800, sessionTTL: 7200 })

      expect(res.status).toBe(401)
    })

    it('retourne 403 pour un utilisateur non-admin', async () => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
      const userResult = await query(
        `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
        [`test-magic-config-user2-${uniqueSuffix}@example.com`, 'Test User', 'user']
      )
      const userToken = jwt.sign(
        { userId: userResult.rows[0].id, role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      )

      const res = await request(testServer())
        .put('/api/admin/config/magic-link')
        .send({ adminTTL: 86400, userTTL: 1800, sessionTTL: 7200 })
        .set('Authorization', `Bearer ${userToken}`)

      expect(res.status).toBe(403)

      await query('DELETE FROM users WHERE id = $1', [userResult.rows[0].id])
    })
  })
})
