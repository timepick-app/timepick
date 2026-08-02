/**
 * Surface HTTP de l'objet d'e-mail modifiable (GET/PATCH
 * `/api/admin/settings/email-templates/:templateKey`).
 *
 * Constat n°6 de la revue chantier : le seul parcours bout-en-bout de l'objet
 * était `tests/e2e/email-subject.spec.ts`, tagué `@slow` et donc EXCLU du run
 * CI. Aucun test CI ne couvrait les ROUTES elles-mêmes (contrairement à la
 * cascade de résolution, couverte au niveau service par
 * `integration/email-subject.test.ts`). Ce fichier comble ce trou, sur le
 * modèle exact de `event-email-template.test.ts` (supertest + `testServer()` +
 * transaction par test).
 */

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { testServer } from '../helpers/test-server'
import { query } from '../../db'
import { startTestTransaction, rollbackTestTransaction } from '../helpers/transaction'
import { factorySubjectTemplate } from '../../services/email-send.service'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

async function createTestAdmin() {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
  const userResult = await query(
    `INSERT INTO users (email, first_name, role)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [`test-email-subject-http-admin-${uniqueSuffix}@example.com`, 'Test Admin', 'admin'],
  )
  return userResult.rows[0]
}

function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' })
}

describe('Email Subject HTTP API — /api/admin/settings/email-templates/:templateKey', () => {
  let adminToken: string

  beforeAll(async () => {
    const admin = await createTestAdmin()
    adminToken = generateToken(admin.id, 'admin')
  })

  beforeEach(async () => {
    await startTestTransaction()
  })

  afterEach(async () => {
    // Écritures faites via des requêtes HTTP sur le serveur partagé — la
    // transaction de test les enveloppe comme n'importe quel `query()` direct
    // (cf. `helpers/transaction.ts`) : rollback = nettoyage complet, comme la
    // suite modèle. Aucune restauration manuelle de colonne nécessaire.
    await rollbackTestTransaction()
  })

  describe('GET /email-templates/invitation', () => {
    it('200 — subjectVariables est un TABLEAU en snake_case (garde anti-middleware de casse), defaultSubject présent', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.data.subjectVariables)).toBe(true)
      const names = (res.body.data.subjectVariables as { name: string }[]).map((v) => v.name)
      // `event_name`, PAS `eventName` : si le middleware de casse convertissait
      // les clés d'objet, un tableau de noms littéraux resterait intact — le
      // dictionnaire, lui, verrait ses clés réécrites. C'est précisément ce
      // que le commentaire de `email-templates.service.ts` documente.
      expect(names).toContain('event_name')
      expect(names).not.toContain('eventName')
      expect(res.body.data.defaultSubject).toBe('Inscription participation - {{event_name}}')
      expect(res.body.data.defaultSubject).toBe(factorySubjectTemplate('invitation', false))
    })
  })

  describe('PATCH /email-templates/invitation', () => {
    const VALID_MJML_BODY =
      '<mj-section><mj-column><mj-text>Corps de test HTTP</mj-text></mj-column></mj-section>'

    it('200 avec un subject valide, puis le GET suivant le renvoie', async () => {
      const patchRes = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: VALID_MJML_BODY, subject: 'Objet HTTP personnalisé - {{event_name}}' })

      expect(patchRes.status).toBe(200)
      expect(patchRes.body.data.subject).toBe('Objet HTTP personnalisé - {{event_name}}')

      const getRes = await request(testServer())
        .get('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(getRes.status).toBe(200)
      expect(getRes.body.data.subject).toBe('Objet HTTP personnalisé - {{event_name}}')
    })

    it('400 avec {{event_description}} — jeton interdit sur invitation, message nommant le jeton', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: VALID_MJML_BODY, subject: 'Invitation à {{event_description}}' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
      expect(res.body.error.message).toContain('{{event_description}}')
    })

    it('400 avec {{ event_name }} (espaces intérieurs)', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: VALID_MJML_BODY, subject: 'Invitation {{ event_name }}' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
      expect(res.body.error.message).toContain('{{ event_name }}')
    })

    it('A7 bout-en-bout : un subject égal à l\'usine renvoie 200, et le GET suivant rend subject: null', async () => {
      const factory = factorySubjectTemplate('invitation', false)

      const patchRes = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: VALID_MJML_BODY, subject: factory })

      expect(patchRes.status).toBe(200)
      // La réponse du PATCH lui-même reflète déjà la réduction — pas
      // seulement une lecture ultérieure.
      expect(patchRes.body.data.subject).toBeNull()

      const getRes = await request(testServer())
        .get('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(getRes.status).toBe(200)
      expect(getRes.body.data.subject).toBeNull()
    })
  })

  describe('PATCH /email-templates/magic_link_login', () => {
    it('200 avec subjectAdmin', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/magic_link_login')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          introText: 'Bonjour {{user_first_name}},',
          signatureText: 'Ce lien expire le {{expiration_date}}.',
          subjectAdmin: "Connexion HTTP à l'administration",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.subjectAdmin).toBe("Connexion HTTP à l'administration")
    })

    it('400 quand une clé système SANS droit à subjectAdmin le porte (account_created, .strict())', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/account_created')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          introText: 'Bonjour {{user_first_name}},',
          signatureText: 'À bientôt !',
          subjectAdmin: "Tentative d'objet admin",
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })
  })

  describe('slot_modification — hors périmètre édition (corps dynamique)', () => {
    it('GET → 400', async () => {
      const res = await request(testServer())
        .get('/api/admin/settings/email-templates/slot_modification')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('PATCH → 400', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/slot_modification')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ introText: 'x', signatureText: 'y' })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })
  })
})
