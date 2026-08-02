/**
 * Validation Zod de l'objet d'e-mail (`pickPatchSchema` → `subjectSchema` /
 * `optionalSubjectSchema` dans `email-templates.validator.ts`).
 *
 * Pure fonction, aucune base de données ici — contrairement à
 * `email-subject.test.ts`, qui couvre la cascade de résolution en base.
 */

import { pickPatchSchema } from '../../validators/email-templates.validator'
import { MAX_SUBJECT_LENGTH } from '../../lib/email-subject'

describe('validation Zod de l\'objet — pickPatchSchema', () => {
  const invitationSchema = pickPatchSchema('invitation')
  const magicLinkSchema = pickPatchSchema('magic_link_login')
  const accountCreatedSchema = pickPatchSchema('account_created')

  function issueMessages(result: { success: false; error: { issues: { message: string }[] } }) {
    return result.error.issues.map((i) => i.message)
  }

  // ===========================================================================
  // 8. Jeton interdit vs jeton inconnu — message nommant le jeton
  // ===========================================================================
  describe('jetons refusés', () => {
    it('refuse un jeton INTERDIT pour ce modèle ({{event_description}} sur invitation), message nommant le jeton', () => {
      const result = invitationSchema.safeParse({
        bodyMjml: 'x',
        subject: 'Invitation à {{event_description}}',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(issueMessages(result).some((m) => m.includes('{{event_description}}'))).toBe(true)
      }
    })

    it('refuse un jeton totalement INCONNU ({{foo}}), message nommant le jeton', () => {
      const result = invitationSchema.safeParse({
        bodyMjml: 'x',
        subject: 'Invitation {{foo}}',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(issueMessages(result).some((m) => m.includes('{{foo}}'))).toBe(true)
      }
    })
  })

  // ===========================================================================
  // 9. Jeton valide ailleurs mais pas sur ce modèle
  // ===========================================================================
  describe('jeton valide sur un AUTRE modèle, refusé ici', () => {
    it('refuse {{slot_date}} sur invitation (variable de créneau, absente des vars de invitation)', () => {
      const result = invitationSchema.safeParse({
        bodyMjml: 'x',
        subject: 'Créneau du {{slot_date}}',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(issueMessages(result).some((m) => m.includes('{{slot_date}}'))).toBe(true)
      }
    })

    it('refuse {{event_name}} sur account_created (account_created ne fournit que les variables de nom)', () => {
      const result = accountCreatedSchema.safeParse({
        introText: 'Bonjour',
        signatureText: 'Bien à vous',
        subject: 'Bienvenue chez {{event_name}}',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(issueMessages(result).some((m) => m.includes('{{event_name}}'))).toBe(true)
      }
    })
  })

  // ===========================================================================
  // 10. Jeton avec espaces intérieurs
  // ===========================================================================
  describe('jeton mal formé', () => {
    it('refuse {{ event_name }} (espaces intérieurs) même si event_name est par ailleurs admissible', () => {
      const result = invitationSchema.safeParse({
        bodyMjml: 'x',
        subject: 'Invitation {{ event_name }}',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        // Le moteur d'interpolation ne reconnaît QUE {{event_name}} sans
        // espaces : la forme espacée doit être signalée comme un jeton non
        // supporté, accolades et espaces compris.
        expect(issueMessages(result).some((m) => m.includes('{{ event_name }}'))).toBe(true)
      }
    })
  })

  // ===========================================================================
  // 11. Vide après nettoyage / au-delà de 255 caractères
  // ===========================================================================
  describe('longueur', () => {
    it("refuse un objet vide APRÈS nettoyage ('   ')", () => {
      const result = invitationSchema.safeParse({ bodyMjml: 'x', subject: '   ' })
      expect(result.success).toBe(false)
    })

    it(`refuse un objet de plus de ${MAX_SUBJECT_LENGTH} caractères`, () => {
      const oversized = 'x'.repeat(MAX_SUBJECT_LENGTH + 1)
      const result = invitationSchema.safeParse({ bodyMjml: 'x', subject: oversized })
      expect(result.success).toBe(false)
    })

    it(`accepte un objet d'exactement ${MAX_SUBJECT_LENGTH} caractères (frontière)`, () => {
      const exact = 'x'.repeat(MAX_SUBJECT_LENGTH)
      const result = invitationSchema.safeParse({ bodyMjml: 'x', subject: exact })
      // Un défaut qui mesurerait la longueur AVANT nettoyage, ou qui utiliserait
      // `<` au lieu de `<=`, refuserait cette frontière exacte.
      expect(result.success).toBe(true)
    })
  })

  // ===========================================================================
  // 12. Acceptation avec normalisation
  // ===========================================================================
  describe('normalisation à l\'acceptation', () => {
    it("'  Venez   à\\n{{event_name}} ' ressort normalisé en 'Venez à {{event_name}}'", () => {
      const result = invitationSchema.safeParse({
        bodyMjml: 'x',
        subject: '  Venez   à\n{{event_name}} ',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.subject).toBe('Venez à {{event_name}}')
      }
    })
  })

  // ===========================================================================
  // 13. subject: null (efface) vs absent (ne touche pas)
  // ===========================================================================
  describe('tri-état subject', () => {
    it('accepte subject: null — efface la personnalisation', () => {
      const result = invitationSchema.safeParse({ bodyMjml: 'x', subject: null })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.subject).toBeNull()
      }
    })

    it('accepte subject absent — ne touche pas à la personnalisation', () => {
      const result = invitationSchema.safeParse({ bodyMjml: 'x' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.subject).toBeUndefined()
      }
    })
  })

  // ===========================================================================
  // 14. subjectAdmin — accepté sur magic_link_login, refusé ailleurs
  // ===========================================================================
  describe('subjectAdmin', () => {
    it('accepte subjectAdmin sur magic_link_login (seul modèle à deux objets)', () => {
      const result = magicLinkSchema.safeParse({
        introText: 'Bonjour',
        signatureText: 'Bien à vous',
        subject: 'Connexion à TimePick',
        subjectAdmin: "Connexion à l'administration TimePick",
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveProperty('subjectAdmin', "Connexion à l'administration TimePick")
      }
    })

    it('refuse subjectAdmin sur account_created (clé système inconnue, schéma .strict())', () => {
      const result = accountCreatedSchema.safeParse({
        introText: 'Bonjour',
        signatureText: 'Bien à vous',
        subjectAdmin: 'x',
      })
      // Un défaut qui appliquerait subjectAdmin à TOUS les modèles système
      // (au lieu du seul magic_link_login) accepterait cette charge à tort.
      expect(result.success).toBe(false)
    })
  })

  // ===========================================================================
  // 15. normalizeSubject filtre les caractères de contrôle et de format
  // ===========================================================================
  describe('caractères de contrôle et de format (\\p{Cc}/\\p{Cf})', () => {
    it('NUL, BEL, ESC, NEL, espace de largeur nulle et override bidi sont remplacés — texte légitime encadrant préservé', () => {
      const raw = 'Invitation\u0000\u0007\u001b\u0085\u200b\u202e{{event_name}}'
      const result = invitationSchema.safeParse({ bodyMjml: 'x', subject: raw })
      expect(result.success).toBe(true)
      if (!result.success) return
      // Les six contrôles/formats consécutifs deviennent six espaces,
      // rabattus à un seul par le nettoyage — le texte de part et d'autre
      // n'est ni tronqué ni corrompu.
      expect(result.data.subject).toBe('Invitation {{event_name}}')
      expect(result.data.subject).not.toMatch(/[\p{Cc}\p{Cf}]/u)
    })

    it('un objet réduit à des caractères de contrôle seuls est refusé — devenus espaces, puis vidé par trim', () => {
      const result = invitationSchema.safeParse({
        bodyMjml: 'x',
        subject: '\u0000\u0007\u001b\u0085\u200b\u202e',
      })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(issueMessages(result)).toContain("L'objet ne peut pas être vide")
    })
  })

  // ===========================================================================
  // 16. Déduplication (Set) et abort:true de la chaîne de refus
  // ===========================================================================
  describe('déduplication des jetons inconnus (Set) et abort de longueur', () => {
    it('le même jeton inconnu répété trois fois n\'est nommé QU\'UNE fois dans le message', () => {
      const result = invitationSchema.safeParse({
        bodyMjml: 'x',
        subject: '{{foo}} et {{foo}} encore {{foo}}',
      })
      expect(result.success).toBe(false)
      if (result.success) return
      const tokenMessage = issueMessages(result).find((m) => m.includes('{{foo}}'))
      expect(tokenMessage).toBeDefined()
      // Un `Set` dédoublonne avant construction du message : {{foo}} n'y
      // apparaît qu'une fois, même matché trois fois dans la source.
      expect(tokenMessage!.match(/\{\{foo\}\}/g)).toHaveLength(1)
    })

    it("deux jetons inconnus distincts sont nommés dans leur ORDRE D'APPARITION", () => {
      const result = invitationSchema.safeParse({
        bodyMjml: 'x',
        subject: 'Bonjour {{zebra}} et {{alpha}}',
      })
      expect(result.success).toBe(false)
      if (result.success) return
      const tokenMessage = issueMessages(result).find(
        (m) => m.includes('{{zebra}}') || m.includes('{{alpha}}'),
      )
      expect(tokenMessage).toBeDefined()
      // {{zebra}} apparaît AVANT {{alpha}} dans la source : un `Set` (ordre
      // d'insertion) les nomme dans cet ordre. Un accumulateur qui triait
      // (alphabétique, ou via une structure non ordonnée) placerait
      // {{alpha}} en premier.
      expect(tokenMessage!.indexOf('{{zebra}}')).toBeLessThan(tokenMessage!.indexOf('{{alpha}}'))
    })

    it(`un objet de plus de ${MAX_SUBJECT_LENGTH} caractères PORTANT AUSSI un jeton inconnu ne refuse QUE pour la longueur — abort:true coupe la chaîne avant le balayage des jetons`, () => {
      const oversizedWithToken = 'x'.repeat(MAX_SUBJECT_LENGTH + 1) + '{{foo}}'
      const result = invitationSchema.safeParse({ bodyMjml: 'x', subject: oversizedWithToken })
      expect(result.success).toBe(false)
      if (result.success) return
      const messages = issueMessages(result)
      // Preuve observable de `abort: true` : UN SEUL message (longueur), le
      // `superRefine` des jetons ne s'exécute jamais — sans `abort`, un
      // second message nommant {{foo}} apparaîtrait à côté.
      expect(messages).toEqual([`L'objet ne peut pas dépasser ${MAX_SUBJECT_LENGTH} caractères`])
      expect(messages.some((m) => m.includes('{{foo}}'))).toBe(false)
    })
  })
})
