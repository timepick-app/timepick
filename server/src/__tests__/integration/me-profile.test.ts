import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import {
  startTestTransaction,
  rollbackTestTransaction
} from '../helpers/transaction'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

/**
 * Tests d'intégration de `GET / PATCH /api/me/profile` (Story 1.7).
 *
 * Pattern A (transaction rollback) identique à `me-events.test.ts` : les users
 * sont créés en beforeAll via `query()` (persistants pour le fichier) ; les
 * UPDATE du profil sont effectués DANS la transaction et rollbackés en
 * afterEach. Le serveur partagé (testServer) tourne dans le process Jest, donc
 * la requête HTTP voit l'état de la transaction courante (même client central).
 */
describe('/api/me/profile', () => {
  let memberToken: string
  let otherMemberToken: string
  let memberUserId: string
  let otherMemberUserId: string
  let memberEmail: string

  /** Crée un user de test (role='user'). Persistant pour le fichier. */
  async function createTestUser(label: string): Promise<{ id: string; email: string }> {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const email = `test-me-profile-${label}-${uniqueSuffix}@example.com`
    const result = await query(
      `INSERT INTO users (email, first_name, role)
       VALUES ($1, $2, 'user')
       RETURNING id`,
      [email, label]
    )
    return { id: result.rows[0].id, email }
  }

  function generateMemberToken(userId: string): string {
    return jwt.sign({ userId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' })
  }

  beforeAll(async () => {
    const member = await createTestUser('Member')
    memberUserId = member.id
    memberEmail = member.email
    memberToken = generateMemberToken(memberUserId)

    const other = await createTestUser('Other')
    otherMemberUserId = other.id
    otherMemberToken = generateMemberToken(otherMemberUserId)
  })

  beforeEach(async () => {
    await startTestTransaction()
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  // Les users sont créés en beforeAll HORS transaction (committés) : nettoyage
  // explicite pour éviter l'accumulation de rows orphelines à chaque run.
  afterAll(async () => {
    await query(`DELETE FROM users WHERE email LIKE 'test-me-profile-%@example.com'`)
  })

  // --- AC5 : authentification déléguée à requireAuth ---

  describe('authentification — AC5 (déléguée à requireAuth)', () => {
    it('GET 401 sans header Authorization', async () => {
      const res = await request(testServer()).get('/api/me/profile')

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('error')
    })

    it('PATCH 401 sans header Authorization', async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .send({ first_name: 'X' })

      expect(res.status).toBe(401)
      expect(res.body).toHaveProperty('error')
    })

    it('GET 401 avec un token invalide', async () => {
      const res = await request(testServer())
        .get('/api/me/profile')
        .set('Authorization', 'Bearer invalid')

      expect(res.status).toBe(401)
    })
  })

  // --- AC3 : mise à jour valide ---

  describe('PATCH — mise à jour valide (AC3)', () => {
    it('200 met à jour first_name et renvoie la forme camelCase', async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ first_name: 'Nouveau' })

      expect(res.status).toBe(200)
      expect(res.body.data.firstName).toBe('Nouveau')
      expect(res.body.data.id).toBe(memberUserId)
    })

    it('200 met à jour phone vers null (effacement)', async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ phone: null })

      expect(res.status).toBe(200)
      expect(res.body.data.phone).toBeNull()
    })

    it('200 met à jour plusieurs champs à la fois', async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          first_name: 'Prénom',
          last_name: 'Nom',
          profession: 'Enseignant',
          informations: 'Dispo le mardi',
          phone: '+33 6 12 34 56 78',
        })

      expect(res.status).toBe(200)
      expect(res.body.data.firstName).toBe('Prénom')
      expect(res.body.data.lastName).toBe('Nom')
      expect(res.body.data.profession).toBe('Enseignant')
      expect(res.body.data.informations).toBe('Dispo le mardi')
      expect(res.body.data.phone).toBe('+33 6 12 34 56 78')
    })
  })

  // --- AC7 : validation serveur du téléphone ---

  describe('PATCH — validation téléphone (AC7)', () => {
    it("400 avec un téléphone invalide et un message contenant « téléphone »", async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ phone: 'abc' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('error')
      expect(String(res.body.error).toLowerCase()).toContain('téléphone')
    })

    it('400 avec un téléphone trop court', async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ phone: '12' })

      expect(res.status).toBe(400)
    })
  })

  // --- AC6 : mass-assignment impossible ---

  describe("PATCH — mass-assignment (AC6)", () => {
    it("role et email fournis dans le body sont ignorés", async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ role: 'admin', email: 'x@y.z', first_name: 'T' })

      expect(res.status).toBe(200)
      // role inchangé (toujours 'user') — le schéma a stripé la clé.
      expect(res.body.data.role).toBe('user')
      // email inchangé — le schéma n'a jamais déclaré cette clé.
      expect(res.body.data.email).toBe(memberEmail)
      // first_name bien appliqué (preuve que le body a été parsé, pas rejeté).
      expect(res.body.data.firstName).toBe('T')
    })
  })

  // --- body sans champ éditable (0 update possible) ---

  describe('PATCH — body sans champ éditable', () => {
    it('400 si body vide', async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('error')
      expect(String(res.body.error)).toContain('Aucune donnée')
    })

    it('400 si body ne contient que des clés ignorées (role/email)', async () => {
      const res = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ role: 'admin', email: 'x@y.z' })

      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('error')
      expect(String(res.body.error)).toContain('Aucune donnée')
    })
  })

  // --- AC2 : GET retourne le profil complet ---

  describe('GET — profil complet (AC2)', () => {
    it('200 renvoie tous les champs pré-remplis du formulaire', async () => {
      const res = await request(testServer())
        .get('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)

      expect(res.status).toBe(200)
      // Les 5 champs du formulaire sont présents (camelCase via middleware).
      const data = res.body.data
      expect(data).toHaveProperty('firstName')
      expect(data).toHaveProperty('lastName')
      expect(data).toHaveProperty('phone')
      expect(data).toHaveProperty('profession')
      expect(data).toHaveProperty('informations')
      expect(data.email).toBe(memberEmail)
      expect(data.role).toBe('user')
      expect(data.id).toBe(memberUserId)
    })
  })

  // --- Isolation userId (le token A n'agit que sur A) ---

  describe('isolation userId', () => {
    it('un PATCH du membre A ne modifie pas le profil du membre B', async () => {
      // A change son prénom.
      const resA = await request(testServer())
        .patch('/api/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ first_name: 'AOnly' })

      expect(resA.status).toBe(200)
      expect(resA.body.data.firstName).toBe('AOnly')

      // B interrogé directement en base : son prénom est inchangé ('Other').
      const otherRow = await query(
        'SELECT first_name FROM users WHERE id = $1',
        [otherMemberUserId]
      )
      expect(otherRow.rows[0].first_name).toBe('Other')

      // B via son propre token voit son propre profil, pas celui de A.
      const resB = await request(testServer())
        .get('/api/me/profile')
        .set('Authorization', `Bearer ${otherMemberToken}`)

      expect(resB.status).toBe(200)
      expect(resB.body.data.id).toBe(otherMemberUserId)
      expect(resB.body.data.firstName).toBe('Other')
    })
  })
})
