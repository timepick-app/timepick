/**
 * Objet d'e-mail modifiable — couverture de la cascade de résolution, des
 * replis, du nettoyage, de la non-régression F16, des variantes
 * magic_link_login, de l'A7 (modèle et événement), de la borne de l'objet
 * envoyé et du hoisting des surcharges (E3.S3-bis).
 *
 * Écrit et nettoie réellement `email_templates.subject` / `subject_admin` et
 * `events.invitation_subject` en base de test (transaction par test, jamais
 * commitée — cf. `__tests__/helpers/transaction.ts`), à la manière des
 * suites d'intégration (`event-email-template.test.ts`), mais en appelant les
 * fonctions de service directement : ce module ne teste pas les routes HTTP
 * (cf. `email-subject-http.test.ts` pour la surface HTTP).
 */

import { query, getClient } from '../../db'
import { startTestTransaction, rollbackTestTransaction } from '../helpers/transaction'
import {
  resolveSubject,
  resolveSubjectFrom,
  loadSubjectOverrides,
  factorySubjectTemplate,
  type LoadedSubjectOverrides,
} from '../../services/email-send.service'
import {
  updateEventEmailTemplate,
  resetEventEmailTemplate,
} from '../../services/event-email-template.service'
import { applyEmailTemplatePatch } from '../../services/email-templates.service'
import { resetEmailTemplatesToFactory, type TemplateKey } from '../../db/email-templates.db'
import * as emailTemplatesDb from '../../db/email-templates.db'

// Corps MJML minimal, sans marqueurs BODY:START/END (le garde de contenu ne
// les exige pas — seule l'extraction côté client les utilise).
const VALID_MJML_BODY = '<mj-section><mj-column><mj-text>Corps de test</mj-text></mj-column></mj-section>'

// Borne de l'objet RÉELLEMENT ENVOYÉ (cf. `MAX_SENT_SUBJECT_LENGTH` privée de
// `email-send.service.ts` — non exportée, dupliquée ici en constante de test).
const MAX_SENT_SUBJECT_LENGTH = 512

async function createTestEvent(): Promise<string> {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { rows } = await query<{ id: string }>(
    `INSERT INTO events (name, description) VALUES ($1, $2) RETURNING id`,
    [`subject-cascade-${uniqueSuffix}`, 'Événement de test — cascade objet'],
  )
  return rows[0].id
}

describe('email-subject — cascade, replis, nettoyage, F16, variantes, A7, borne, hoisting', () => {
  beforeEach(async () => {
    await startTestTransaction()
  })

  afterEach(async () => {
    await rollbackTestTransaction()
  })

  // ===========================================================================
  // 1. Cascade complète : events.invitation_subject > email_templates.subject > usine
  // ===========================================================================
  describe('cascade complète (invitation)', () => {
    it("la surcharge ÉVÉNEMENT gagne sur la surcharge MODÈLE et sur l'usine", async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE email_templates SET subject = $1 WHERE template_key = 'invitation'`, [
        'Objet du modèle - {{event_name}}',
      ])
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, [
        'Objet événement - {{event_name}}',
        eventId,
      ])

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: 'Gala' },
      })

      // Un défaut qui inverserait l'ordre de priorité (modèle avant événement)
      // ferait échouer cette assertion.
      expect(subject).toBe('Objet événement - Gala')
    })

    it("la surcharge MODÈLE gagne sur l'usine quand l'événement n'a pas de surcharge", async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE email_templates SET subject = $1 WHERE template_key = 'invitation'`, [
        'Objet du modèle - {{event_name}}',
      ])
      // events.invitation_subject reste NULL — pas de surcharge événement.

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: 'Gala' },
      })

      // Un défaut qui ignorerait la surcharge modèle (retombant direct sur
      // l'usine) ferait échouer cette assertion.
      expect(subject).toBe('Objet du modèle - Gala')
    })

    it("retombe sur l'objet d'usine quand aucune des deux surcharges n'existe", async () => {
      const eventId = await createTestEvent()
      // email_templates.subject et events.invitation_subject valent NULL au
      // repos (migration 044 : « jamais semé »).

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: 'Gala' },
      })

      expect(subject).toBe(factorySubjectTemplate('invitation', false).replace('{{event_name}}', 'Gala'))
      expect(subject).toBe('Inscription participation - Gala')
    })
  })

  // ===========================================================================
  // 2. Repli sur l'usine quand l'interpolation rend un objet vide
  // ===========================================================================
  describe("repli sur l'usine — interpolation vide", () => {
    it("une personnalisation réduite à '{{event_name}}' sans event_name dans vars retombe sur l'usine interpolée, jamais une chaîne vide", async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE email_templates SET subject = $1 WHERE template_key = 'invitation'`, [
        '{{event_name}}',
      ])

      // vars ne fournit PAS event_name : la personnalisation s'interpole en
      // chaîne vide après nettoyage.
      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { expiration_date: '2026-08-08' },
      })

      // Un défaut qui retournerait la personnalisation vide telle quelle
      // produirait un objet '' — un e-mail sans objet, ce que le contrat
      // interdit explicitement.
      expect(subject).not.toBe('')
      expect(subject).toBe('Inscription participation -')
    })

    it("une personnalisation réduite à '{{user_last_name}}' avec user_last_name vide (destinataire mononyme) retombe aussi sur l'usine", async () => {
      // Même contrat que le cas {{event_name}} ci-dessus, mais sur une
      // variable de NOM plutôt que d'événement — cas réel : un destinataire
      // qui n'a qu'un prénom déclaré (user_last_name === '').
      const eventId = await createTestEvent()
      await query(`UPDATE email_templates SET subject = $1 WHERE template_key = 'invitation'`, [
        '{{user_last_name}}',
      ])

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: 'Gala', user_last_name: '' },
      })

      expect(subject).not.toBe('')
      expect(subject).toBe(factorySubjectTemplate('invitation', false).replace('{{event_name}}', 'Gala'))
      expect(subject).toBe('Inscription participation - Gala')
    })
  })

  // ===========================================================================
  // 3. Les deux variantes de magic_link_login (subject / subject_admin)
  // ===========================================================================
  describe('magic_link_login — subject vs subject_admin', () => {
    it("choisit subject_admin quand vars.is_admin === 'true', subject sinon", async () => {
      await query(
        `UPDATE email_templates SET subject = $1, subject_admin = $2 WHERE template_key = 'magic_link_login'`,
        ['Connexion perso membre', 'Connexion perso admin'],
      )

      const userSubject = await resolveSubject({
        templateKey: 'magic_link_login',
        vars: { is_admin: 'false' },
      })
      const adminSubject = await resolveSubject({
        templateKey: 'magic_link_login',
        vars: { is_admin: 'true' },
      })

      // Un défaut qui lirait toujours la même colonne (par exemple `subject`
      // pour les deux) ferait échouer l'une des deux assertions.
      expect(userSubject).toBe('Connexion perso membre')
      expect(adminSubject).toBe('Connexion perso admin')
    })

    it("is_admin=true avec subject_admin NULL retombe sur l'usine ADMIN, jamais sur la personnalisation utilisateur", async () => {
      await query(`UPDATE email_templates SET subject = $1 WHERE template_key = 'magic_link_login'`, [
        'Connexion perso membre',
      ])
      // subject_admin reste NULL.

      const subject = await resolveSubject({
        templateKey: 'magic_link_login',
        vars: { is_admin: 'true' },
      })

      // Un défaut qui replierait sur `overrides.subject` (la personnalisation
      // UTILISATEUR) au lieu de l'usine admin ferait échouer cette
      // assertion : la variante admin ne doit jamais hériter du texte membre.
      expect(subject).toBe(factorySubjectTemplate('magic_link_login', true))
      // Littéral épinglé (comme le cas invitation ci-dessus) : sans lui, une
      // dérive accidentelle du registre `factorySubjectTemplate` ferait
      // toujours passer cette assertion — les DEUX membres bougeraient
      // ensemble. Le littéral fige ce que l'usine ADMIN dit RÉELLEMENT.
      expect(subject).toBe("Connexion à l'administration TimePick")
      expect(subject).not.toBe('Connexion perso membre')
    })
  })

  // ===========================================================================
  // 4. Nettoyage — retours à la ligne / tabulations / espaces multiples
  // ===========================================================================
  describe('nettoyage', () => {
    it('une personnalisation avec retours à la ligne, tabulations et espaces multiples ressort sur une seule ligne à espaces simples', async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, [
        'Invitation\n\tspéciale   pour\t{{event_name}}',
        eventId,
      ])

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: 'Gala' },
      })

      expect(subject).toBe('Invitation spéciale pour Gala')
      expect(subject).not.toMatch(/[\n\t]/)
      expect(subject).not.toMatch(/ {2,}/)
    })
  })

  // ===========================================================================
  // 5. Non-régression F16 — $& et $1 insérés littéralement
  // ===========================================================================
  describe('F16 — remplaçant fonction, jamais un motif de remplacement string', () => {
    it("une valeur de variable contenant $& et $1 s'insère littéralement dans l'objet", async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, [
        'Invitation - {{event_name}}',
        eventId,
      ])

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: 'Prix $& et $1 disponibles' },
      })

      // Un défaut qui repasserait à `String.replace(re, vars[key])` (motif de
      // remplacement STRING plutôt que fonction) interpréterait `$&` comme
      // « la portion filtrée » et `$1` comme un groupe capturé, corrompant le
      // résultat au lieu de l'insérer tel quel.
      expect(subject).toBe('Invitation - Prix $& et $1 disponibles')
    })
  })

  // ===========================================================================
  // 6. A7 (niveau ÉVÉNEMENT) — updateEventEmailTemplate
  // ===========================================================================
  describe('A7 (niveau événement) — updateEventEmailTemplate', () => {
    it("un objet identique à l'objet hérité résolu (ici l'USINE, aucune surcharge modèle) stocke NULL en colonne", async () => {
      const eventId = await createTestEvent()

      await updateEventEmailTemplate(eventId, VALID_MJML_BODY, 'Inscription participation - {{event_name}}')

      const { rows } = await query<{ invitation_subject: string | null }>(
        `SELECT invitation_subject FROM events WHERE id = $1`,
        [eventId],
      )
      // Vérifie la COLONNE directement, pas seulement la vue retournée par le
      // service — un défaut qui stockerait la valeur telle quelle mais que la
      // vue masquerait resterait invisible à un test qui ne lirait que le DTO.
      expect(rows[0].invitation_subject).toBeNull()
    })

    it("un objet identique à l'objet hérité DU MODÈLE (pas de l'usine) stocke aussi NULL", async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE email_templates SET subject = $1 WHERE template_key = 'invitation'`, [
        'Objet du modèle - {{event_name}}',
      ])

      await updateEventEmailTemplate(eventId, VALID_MJML_BODY, 'Objet du modèle - {{event_name}}')

      const { rows } = await query<{ invitation_subject: string | null }>(
        `SELECT invitation_subject FROM events WHERE id = $1`,
        [eventId],
      )
      // Un défaut qui comparerait uniquement à la constante d'usine (au lieu
      // du COALESCE(subject, usine)) laisserait cette surcharge — identique à
      // l'objet DU MODÈLE — stockée telle quelle, faisant échouer cette
      // assertion.
      expect(rows[0].invitation_subject).toBeNull()
    })

    it('un objet différent de l\'hérité stocke la valeur fournie', async () => {
      const eventId = await createTestEvent()

      await updateEventEmailTemplate(eventId, VALID_MJML_BODY, 'Objet personnalisé - {{event_name}}')

      const { rows } = await query<{ invitation_subject: string | null }>(
        `SELECT invitation_subject FROM events WHERE id = $1`,
        [eventId],
      )
      expect(rows[0].invitation_subject).toBe('Objet personnalisé - {{event_name}}')
    })

    it('subject absent (undefined) ne touche pas la colonne existante', async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, [
        'Objet préexistant',
        eventId,
      ])

      // Appel sans troisième argument : `subject` est `undefined`.
      await updateEventEmailTemplate(eventId, VALID_MJML_BODY)

      const { rows } = await query<{ invitation_subject: string | null }>(
        `SELECT invitation_subject FROM events WHERE id = $1`,
        [eventId],
      )
      // Un défaut qui traiterait `undefined` comme `null` (COALESCE au lieu du
      // CASE conditionnel) effacerait la surcharge existante — ce test le
      // détecte.
      expect(rows[0].invitation_subject).toBe('Objet préexistant')
    })

    it('subject: null efface une surcharge existante ET conserve invitation_mjml — branche SQL ELSE, distincte de `undefined`', async () => {
      // Contrat CASE SQL de `updateEventEmailTemplate` : `NOT $3` (subject
      // absent) garde la colonne, sinon compare à l'hérité puis NULL/valeur.
      // `undefined` est déjà couvert ci-dessus ; ce test couvre l'autre
      // branche explicitement exercée par un `null` littéral (efface), non
      // confondue avec l'égalité-à-l'hérité qui, elle, produit aussi NULL
      // mais par un CHEMIN différent (`$4 = inherited`).
      const eventId = await createTestEvent()
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, [
        'Objet préexistant événement',
        eventId,
      ])

      await updateEventEmailTemplate(eventId, VALID_MJML_BODY, null)

      const { rows } = await query<{ invitation_subject: string | null; invitation_mjml: string | null }>(
        `SELECT invitation_subject, invitation_mjml FROM events WHERE id = $1`,
        [eventId],
      )
      expect(rows[0].invitation_subject).toBeNull()
      // Un défaut qui court-circuiterait l'écriture du corps quand `subject`
      // est `null` (branchement erroné entre les deux champs) laisserait
      // `invitation_mjml` à son état antérieur (NULL) au lieu du corps fourni.
      expect(rows[0].invitation_mjml).toBe(VALID_MJML_BODY)
    })
  })

  // ===========================================================================
  // 7. A7 (niveau MODÈLE) — applyEmailTemplatePatch / reduceSubjectToInherited
  // ===========================================================================
  describe('A7 (niveau modèle) — applyEmailTemplatePatch', () => {
    it("un subject textuellement identique à l'objet d'usine (invitation) stocke NULL dans email_templates.subject", async () => {
      const factory = factorySubjectTemplate('invitation', false)

      await applyEmailTemplatePatch('invitation', { bodyMjml: VALID_MJML_BODY, subject: factory })

      const { rows } = await query<{ subject: string | null }>(
        `SELECT subject FROM email_templates WHERE template_key = 'invitation'`,
      )
      // Colonne réelle, pas seulement le DTO projeté — un défaut qui
      // stockerait la valeur mais que `projectRow` masquerait resterait
      // invisible à un test qui ne lirait que la vue retournée.
      expect(rows[0].subject).toBeNull()
    })

    it("un subjectAdmin textuellement identique à l'objet d'usine ADMIN (magic_link_login) stocke NULL dans email_templates.subject_admin", async () => {
      const factoryAdmin = factorySubjectTemplate('magic_link_login', true)

      await applyEmailTemplatePatch('magic_link_login', {
        introText: 'Bonjour {{user_first_name}},',
        signatureText: 'Ce lien expire le {{expiration_date}}.',
        subjectAdmin: factoryAdmin,
      })

      const { rows } = await query<{ subject_admin: string | null }>(
        `SELECT subject_admin FROM email_templates WHERE template_key = 'magic_link_login'`,
      )
      expect(rows[0].subject_admin).toBeNull()
    })

    it("un objet DIFFÉRENT de l'usine est stocké tel quel", async () => {
      await applyEmailTemplatePatch('invitation', {
        bodyMjml: VALID_MJML_BODY,
        subject: 'Objet personnalisé modèle - {{event_name}}',
      })

      const { rows } = await query<{ subject: string | null }>(
        `SELECT subject FROM email_templates WHERE template_key = 'invitation'`,
      )
      expect(rows[0].subject).toBe('Objet personnalisé modèle - {{event_name}}')
    })

    it('subject: undefined (absent de la charge) ne touche pas une colonne déjà personnalisée — tri-état', async () => {
      await query(`UPDATE email_templates SET subject = $1 WHERE template_key = 'invitation'`, [
        'Préexistant modèle',
      ])

      await applyEmailTemplatePatch('invitation', { bodyMjml: VALID_MJML_BODY })

      const { rows } = await query<{ subject: string | null }>(
        `SELECT subject FROM email_templates WHERE template_key = 'invitation'`,
      )
      expect(rows[0].subject).toBe('Préexistant modèle')
    })

    it('subject: null efface une personnalisation existante', async () => {
      await query(`UPDATE email_templates SET subject = $1 WHERE template_key = 'invitation'`, [
        'Préexistant modèle',
      ])

      await applyEmailTemplatePatch('invitation', { bodyMjml: VALID_MJML_BODY, subject: null })

      const { rows } = await query<{ subject: string | null }>(
        `SELECT subject FROM email_templates WHERE template_key = 'invitation'`,
      )
      expect(rows[0].subject).toBeNull()
    })
  })

  // ===========================================================================
  // 8. Borne de l'objet ENVOYÉ — MAX_SENT_SUBJECT_LENGTH / capSubject
  // ===========================================================================
  describe("borne de l'objet envoyé (capSubject, via resolveSubject)", () => {
    it(`une surcharge dont l'interpolation dépasse ${MAX_SENT_SUBJECT_LENGTH} points de code ressort tronquée à EXACTEMENT ${MAX_SENT_SUBJECT_LENGTH}`, async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, ['{{event_name}}', eventId])
      const longName = 'x'.repeat(600)

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: longName },
      })

      expect([...subject].length).toBe(MAX_SENT_SUBJECT_LENGTH)
      expect(subject).toBe('x'.repeat(MAX_SENT_SUBJECT_LENGTH))
    })

    it('une troncature ne coupe pas une paire de substitution — emoji hors BMP à la frontière des 512 points de code', async () => {
      const eventId = await createTestEvent()
      // 511 points de code ASCII, puis un emoji hors BMP (1 point de code,
      // 2 unités UTF-16) exactement au 512e point de code, puis du remplissage
      // au-delà — la troncature en UNITÉS UTF-16 (`subject.slice(0, 512)`)
      // couperait entre les deux moitiés de la paire de substitution.
      const prefix = 'A'.repeat(511)
      const emoji = '😀'
      const suffix = 'B'.repeat(50)
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, [prefix + emoji + suffix, eventId])

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: 'Gala' },
      })

      expect([...subject].length).toBe(MAX_SENT_SUBJECT_LENGTH)
      // L'emoji entier survit, intact, en dernière position.
      expect(subject).toBe(prefix + emoji)
      // Aucun demi-substitut isolé : chaque élément de l'itération par point de
      // code doit avoir un code point hors de la plage de substitution UTF-16.
      expect(
        [...subject].every((c) => {
          const codePoint = c.codePointAt(0)!
          return codePoint < 0xd800 || codePoint > 0xdfff
        }),
      ).toBe(true)
    })

    it("un objet court n'est pas modifié par capSubject (égalité stricte, pas de troncature parasite)", async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, [
        '{{event_name}} — bienvenue',
        eventId,
      ])

      const subject = await resolveSubject({
        templateKey: 'invitation',
        eventId,
        vars: { event_name: 'Gala' },
      })

      expect(subject).toBe('Gala — bienvenue')
    })
  })

  // ===========================================================================
  // 9. Hoisting des surcharges — resolveSubjectFrom (sync, pur) / loadSubjectOverrides
  // ===========================================================================
  describe('hoisting des surcharges — resolveSubjectFrom / loadSubjectOverrides', () => {
    it('resolveSubjectFrom est synchrone et pur : deux appels avec les mêmes surcharges et des vars différentes ne déclenchent AUCUNE requête', () => {
      const spy = jest.spyOn(emailTemplatesDb, 'getSubjectOverrides')
      try {
        const overrides: LoadedSubjectOverrides = {
          subject: 'Bienvenue {{event_name}}',
          subjectAdmin: null,
          eventSubject: null,
        }

        const first = resolveSubjectFrom(overrides, { templateKey: 'invitation', vars: { event_name: 'Alice' } })
        const second = resolveSubjectFrom(overrides, { templateKey: 'invitation', vars: { event_name: 'Bob' } })

        expect(first).toBe('Bienvenue Alice')
        expect(second).toBe('Bienvenue Bob')
        // Preuve observable : aucune requête (le mock de lecture n'a jamais
        // été sollicité) — `resolveSubjectFrom` travaille exclusivement à
        // partir des surcharges DÉJÀ chargées passées en paramètre.
        expect(spy).toHaveBeenCalledTimes(0)
      } finally {
        spy.mockRestore()
      }
    })

    it('loadSubjectOverrides avale une erreur de lecture et rend null ; resolveSubjectFrom(null, …) retombe alors sur l\'usine', async () => {
      const spy = jest
        .spyOn(emailTemplatesDb, 'getSubjectOverrides')
        .mockRejectedValueOnce(new Error('DB indisponible'))
      try {
        const overrides = await loadSubjectOverrides('invitation', 'some-event-id')
        expect(overrides).toBeNull()

        const subject = resolveSubjectFrom(overrides, { templateKey: 'invitation', vars: { event_name: 'Gala' } })
        expect(subject).toBe('Inscription participation - Gala')
      } finally {
        spy.mockRestore()
      }
    })
  })

  // ===========================================================================
  // 10. Réinitialisations
  // ===========================================================================
  describe('réinitialisations', () => {
    it('resetEmailTemplatesToFactory remet subject et subject_admin à NULL', async () => {
      await query(
        `UPDATE email_templates SET subject = $1, subject_admin = $2 WHERE template_key = 'magic_link_login'`,
        ['Objet perso', 'Objet perso admin'],
      )

      const client = await getClient()
      const keys: readonly TemplateKey[] = ['magic_link_login']
      await resetEmailTemplatesToFactory(client, keys)

      const { rows } = await query<{ subject: string | null; subject_admin: string | null }>(
        `SELECT subject, subject_admin FROM email_templates WHERE template_key = 'magic_link_login'`,
      )
      expect(rows[0].subject).toBeNull()
      expect(rows[0].subject_admin).toBeNull()
    })

    it('resetEventEmailTemplate remet invitation_subject à NULL', async () => {
      const eventId = await createTestEvent()
      await query(`UPDATE events SET invitation_subject = $1 WHERE id = $2`, [
        'Objet perso événement',
        eventId,
      ])

      await resetEventEmailTemplate(eventId)

      const { rows } = await query<{ invitation_subject: string | null }>(
        `SELECT invitation_subject FROM events WHERE id = $1`,
        [eventId],
      )
      expect(rows[0].invitation_subject).toBeNull()
    })
  })
})
