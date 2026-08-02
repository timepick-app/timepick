// Auto-mock isomorphic-dompurify — sans lui, ts-jest ne peut pas importer la
// dépendance ESM @exodus/bytes tirée par app.ts → email.service → mjml-compile.
jest.mock('isomorphic-dompurify')

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { query } from '../../db'
import { testServer } from '../helpers/test-server'
import { startTestTransaction, rollbackTestTransaction } from '../helpers/transaction'
import { findUnsafeBodyConstruct } from '../../validators/email-body-content.validator'

/**
 * Garde de contenu du corps — les deux surfaces d'écriture jumelles.
 *
 * Ce que ce fichier tient, et pourquoi chaque partie compte :
 *
 *   1. **Le corpus réel passe.** Tous les corps présents en base (courants ET
 *      figés d'usine, 9 modèles) sont soumis au garde. C'est la mesure préalable
 *      qui a autorisé ce garde, rendue permanente : un garde qui refuserait un
 *      seul corps existant provoquerait un refus silencieux au prochain
 *      enregistrement d'un modèle inchangé. La base de test est reconstruite
 *      depuis les migrations à chaque exécution, donc ce corpus suit les seeds.
 *
 *   2. **Le corps accepté est stocké octet pour octet.** Le stockage n'est pas
 *      normalisé : le garde refuse, il ne nettoie jamais.
 *
 *   3. **La charge dissimulée dans un commentaire est refusée sur les DEUX
 *      surfaces**, avec un code d'erreur montrable, et rien n'est écrit.
 *
 * La survie des commentaires conditionnels ÉMIS par MJML dans le HTML expédié est
 * tenue ailleurs, au niveau octet : les instantanés de sortie et les HTML de
 * référence post-E4 en contiennent, et ce garde ne touche pas au rendu.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// La charge du constat : un `<script>` que le sanitiseur de sortie ne voit pas
// (il ne parse pas les nœuds commentaires) mais qu'Outlook pour Windows exécute.
const SMUGGLED_PAYLOAD =
  '<mj-section><mj-column><mj-raw><!--[if mso]><script>alert(1)</script><![endif]--></mj-raw></mj-column></mj-section>'

const LEGITIMATE_BODY =
  '<!-- BODY:START -->\n<mj-section padding="20px"><mj-column><mj-text>Corps légitime {{magic_link}}</mj-text></mj-column></mj-section>\n<!-- BODY:END -->'

describe('Garde de contenu du corps d\u2019e-mail (écriture)', () => {
  let adminToken: string

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    const { rows } = await query(
      `INSERT INTO users (email, first_name, role) VALUES ($1, $2, $3) RETURNING id`,
      [`test-body-guard-admin-${suffix}@example.com`, 'Test Admin', 'admin'],
    )
    adminToken = jwt.sign({ userId: rows[0].id, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' })
  })

  afterAll(async () => {
    await query("DELETE FROM users WHERE email LIKE 'test-body-guard-%'")
  })

  // =========================================================================
  // 1. Le corpus réellement stocké
  // =========================================================================
  describe('corpus stocké en base', () => {
    it('accepte les corps courants ET figés d\u2019usine des 9 modèles', async () => {
      const { rows } = await query<{
        template_key: string
        body_mjml: string
        default_body_mjml: string
      }>(`SELECT template_key, body_mjml, default_body_mjml FROM email_templates ORDER BY template_key`)

      expect(rows.length).toBeGreaterThanOrEqual(9)

      // Le compte et la liste sortent de la même lecture : un refus est reporté
      // avec la colonne et la clé, pas résumé en « ça a échoué ».
      const refused = rows.flatMap((row) =>
        (
          [
            ['body_mjml', row.body_mjml],
            ['default_body_mjml', row.default_body_mjml],
          ] as const
        ).flatMap(([column, body]) => {
          const construct = findUnsafeBodyConstruct(body)
          return construct === null ? [] : [`${row.template_key}.${column}: ${construct}`]
        }),
      )

      expect(refused).toEqual([])
    })
  })

  // =========================================================================
  // 2 & 3. Modèle général — PATCH /api/admin/settings/email-templates/invitation
  // =========================================================================
  describe('modèle général', () => {
    afterEach(async () => {
      await query(
        `UPDATE email_templates SET body_mjml = default_body_mjml WHERE template_key = 'invitation'`,
      )
    })

    it('refuse une charge dissimulée dans un commentaire conditionnel, sans rien écrire', async () => {
      const { rows: before } = await query<{ body_mjml: string }>(
        `SELECT body_mjml FROM email_templates WHERE template_key = 'invitation'`,
      )

      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: SMUGGLED_PAYLOAD })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('EMAIL_BODY_UNSAFE_CONTENT')
      expect(res.body.error.message).toContain('commentaire conditionnel Outlook')

      const { rows: after } = await query<{ body_mjml: string }>(
        `SELECT body_mjml FROM email_templates WHERE template_key = 'invitation'`,
      )
      expect(after[0].body_mjml).toBe(before[0].body_mjml)
    })

    it('accepte un corps légitime et le stocke octet pour octet', async () => {
      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: LEGITIMATE_BODY })

      expect(res.status).toBe(200)
      expect(res.body.data.bodyMjml).toBe(LEGITIMATE_BODY)

      const { rows } = await query<{ body_mjml: string }>(
        `SELECT body_mjml FROM email_templates WHERE template_key = 'invitation'`,
      )
      expect(rows[0].body_mjml).toBe(LEGITIMATE_BODY)
    })

    it('réenregistre le corps d\u2019usine inchangé — octet pour octet', async () => {
      const { rows: factory } = await query<{ default_body_mjml: string }>(
        `SELECT default_body_mjml FROM email_templates WHERE template_key = 'invitation'`,
      )
      const body = factory[0].default_body_mjml

      const res = await request(testServer())
        .patch('/api/admin/settings/email-templates/invitation')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: body })

      expect(res.status).toBe(200)
      expect(res.body.data.bodyMjml).toBe(body)
    })

    it('refuse aussi une balise script nue et un gestionnaire d\u2019événement', async () => {
      const refusals = await Promise.all(
        [
          '<mj-section><mj-column><mj-raw><script>alert(1)</script></mj-raw></mj-column></mj-section>',
          '<mj-section><mj-column><mj-raw><img src="https://x.test/a.png" onerror="alert(1)"></mj-raw></mj-column></mj-section>',
        ].map(async (bodyMjml) => {
          const res = await request(testServer())
            .patch('/api/admin/settings/email-templates/invitation')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bodyMjml })
          return { status: res.status, code: res.body.error?.code }
        }),
      )

      expect(refusals).toEqual([
        { status: 400, code: 'EMAIL_BODY_UNSAFE_CONTENT' },
        { status: 400, code: 'EMAIL_BODY_UNSAFE_CONTENT' },
      ])
    })
  })

  // =========================================================================
  // Flux jumeau — PATCH /api/admin/events/:id/email-template
  // =========================================================================
  describe('surcharge par événement', () => {
    let eventId: string

    beforeEach(async () => {
      await startTestTransaction()
      const created = await request(testServer())
        .post('/api/admin/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Événement garde de corps' })
      eventId = created.body.data.id
    })

    afterEach(async () => {
      await rollbackTestTransaction()
    })

    it('refuse la même charge dissimulée, sans rien écrire', async () => {
      const res = await request(testServer())
        .patch(`/api/admin/events/${eventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: SMUGGLED_PAYLOAD })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('EMAIL_BODY_UNSAFE_CONTENT')

      const { rows } = await query<{ invitation_mjml: string | null }>(
        `SELECT invitation_mjml FROM events WHERE id = $1`,
        [eventId],
      )
      expect(rows[0].invitation_mjml).toBeNull()
    })

    it('accepte un corps légitime et le stocke octet pour octet', async () => {
      const res = await request(testServer())
        .patch(`/api/admin/events/${eventId}/email-template`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ bodyMjml: LEGITIMATE_BODY })

      expect(res.status).toBe(200)
      expect(res.body.data.bodyMjml).toBe(LEGITIMATE_BODY)

      const { rows } = await query<{ invitation_mjml: string }>(
        `SELECT invitation_mjml FROM events WHERE id = $1`,
        [eventId],
      )
      expect(rows[0].invitation_mjml).toBe(LEGITIMATE_BODY)
    })
  })
})
