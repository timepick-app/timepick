import {
  parseSystemTemplate,
  composeSystemTemplate,
  getEmailTemplateView,
  applyEmailTemplatePatch,
  MalformedSystemTemplateError,
  InvitationCompositionError,
} from '../../services/email-templates.service'
import {
  getEmailTemplate,
  updateEmailTemplate,
} from '../../db/email-templates.db'
import type { EmailTemplateRow } from '../../db/email-templates.db'

// Mock DB layer
jest.mock('../../db/email-templates.db')

const mockedGet = getEmailTemplate as jest.MockedFunction<typeof getEmailTemplate>
const mockedUpdate = updateEmailTemplate as jest.MockedFunction<typeof updateEmailTemplate>

// --- Canonical seed bodies (post-migration 031) ---

const MAGIC_LINK_LOGIN_BODY = `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>voici votre lien de connexion à votre espace :</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{magic_link}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Ce lien expire le {{expiration_date}}.</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`

const RESERVATION_CONFIRMATION_BODY = `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>votre réservation pour {{event_name}} est confirmée. Créneau : {{slot_date}} {{slot_time}}.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Gérer ma réservation</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">À très bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`

const ACCOUNT_CREATED_BODY = `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>votre compte vient d'être créé. Cliquez sur le bouton ci-dessous pour vous connecter à votre espace.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Saisissez votre adresse email pour recevoir un lien de connexion sécurisé. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`

const ROLE_PROMOTED_BODY = `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>votre accès a été mis à jour.<br/><br/>Vous êtes désormais Administrateur : vous pouvez gérer les membres, les événements et les paramètres.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`

const ROLE_DEMOTED_BODY = `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>votre accès a été ajusté.<br/><br/>Vous êtes désormais Membre : vous continuez à accéder à vos événements et à votre profil ; les fonctions d'administration ne sont plus disponibles.</mj-text>
    <!-- INTRO:END -->
    <mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" align="center" padding-top="0">Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`

const INVITATION_BODY = `<mj-section background-color="#f9f9f9" padding="20px"><mj-column><mj-text>Test</mj-text></mj-column></mj-section>`

const CANCELLATION_CONFIRMATION_BODY = `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>nous vous informons que le créneau de participation suivant a été annulé :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-text padding-bottom="8px">{{cancellation_reason}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Choisir un nouveau créneau</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`

const UNREGISTRATION_CONFIRMATION_BODY = `<mj-section padding="20px">
  <mj-column>
    <!-- INTRO:START -->
    <mj-text padding-bottom="8px">Bonjour {{user_first_name}},<br/><br/>nous vous confirmons votre désinscription du créneau de participation suivant :</mj-text>
    <!-- INTRO:END -->
    <mj-text padding-bottom="4px"><strong>Événement :</strong> {{event_name}}</mj-text>
    <mj-text padding-bottom="4px"><strong>Date :</strong> {{slot_date}}</mj-text>
    <mj-text padding-bottom="8px"><strong>Horaires :</strong> {{slot_time}}</mj-text>
    <mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Voir les créneaux disponibles</mj-button>
    <!-- SIG:START -->
    <mj-text color="#999999" font-size="13px" padding-top="0">Cordialement, L'équipe d'organisation</mj-text>
    <!-- SIG:END -->
  </mj-column>
</mj-section>`

function makeRow(key: string, body: string, defaultBody: string): EmailTemplateRow {
  return {
    templateKey: key as EmailTemplateRow['templateKey'],
    bodyMjml: body,
    defaultBodyMjml: defaultBody,
    // Pas de personnalisation d'objet : la projection de ce service ne porte
    // que le corps, ces deux champs ne font que compléter la forme de la row.
    subject: null,
    subjectAdmin: null,
    updatedAt: new Date('2026-05-01T12:00:00Z'),
  }
}

describe('email-templates.service', () => {
  // =========================================================
  // parseSystemTemplate
  // =========================================================
  describe('parseSystemTemplate', () => {
    it('extracts introText and signatureText from magic_link_login', () => {
      const result = parseSystemTemplate(MAGIC_LINK_LOGIN_BODY, 'magic_link_login')
      expect(result.introText).toBe('Bonjour {{user_first_name}},\n\nvoici votre lien de connexion à votre espace :')
      expect(result.signatureText).toBe('Ce lien expire le {{expiration_date}}.')
    })

    it('extracts introText and signatureText from reservation_confirmation', () => {
      const result = parseSystemTemplate(RESERVATION_CONFIRMATION_BODY, 'reservation_confirmation')
      expect(result.introText).toBe('Bonjour {{user_first_name}},\n\nvotre réservation pour {{event_name}} est confirmée. Créneau : {{slot_date}} {{slot_time}}.')
      expect(result.signatureText).toBe('À très bientôt !')
    })

    it('extracts introText and signatureText from account_created', () => {
      // Vérifie le parse du corps factory byte-exact (migration 031)
      const result = parseSystemTemplate(ACCOUNT_CREATED_BODY, 'account_created')
      expect(result.introText).toBe('Bonjour {{user_first_name}},\n\nvotre compte vient d\'être créé. Cliquez sur le bouton ci-dessous pour vous connecter à votre espace.')
      expect(result.signatureText).toBe('Saisissez votre adresse email pour recevoir un lien de connexion sécurisé. À bientôt !')
    })

    it('extracts introText and signatureText from cancellation_confirmation', () => {
      // Vérifie le parse du corps factory byte-exact (migration 031)
      const result = parseSystemTemplate(CANCELLATION_CONFIRMATION_BODY, 'cancellation_confirmation')
      expect(result.introText).toBe('Bonjour {{user_first_name}},\n\nnous vous informons que le créneau de participation suivant a été annulé :')
      expect(result.signatureText).toBe("Cordialement, L'équipe d'organisation")
    })

    it('throws MalformedSystemTemplateError when INTRO marker is missing', () => {
      const noIntro = MAGIC_LINK_LOGIN_BODY.replace('<!-- INTRO:START -->', '').replace('<!-- INTRO:END -->', '')
      expect(() => parseSystemTemplate(noIntro, 'magic_link_login')).toThrow(MalformedSystemTemplateError)
    })

    it('throws MalformedSystemTemplateError when SIG marker is missing', () => {
      const noSig = MAGIC_LINK_LOGIN_BODY.replace('<!-- SIG:START -->', '').replace('<!-- SIG:END -->', '')
      expect(() => parseSystemTemplate(noSig, 'magic_link_login')).toThrow(MalformedSystemTemplateError)
    })

    it('throws MalformedSystemTemplateError when both markers are missing', () => {
      expect(() => parseSystemTemplate('<mj-section></mj-section>', 'magic_link_login')).toThrow(MalformedSystemTemplateError)
    })
  })

  // =========================================================
  // composeSystemTemplate — round-trip
  // =========================================================
  describe('composeSystemTemplate round-trip', () => {
    it.each([
      'magic_link_login',
      'reservation_confirmation',
      'account_created',
      'cancellation_confirmation',
      'role_promoted',
      'role_demoted',
      'unregistration_confirmation',
    ] as const)('round-trips through compose → parse for %s', (key) => {
      const original = parseSystemTemplate(
        key === 'magic_link_login' ? MAGIC_LINK_LOGIN_BODY
          : key === 'reservation_confirmation' ? RESERVATION_CONFIRMATION_BODY
          : key === 'cancellation_confirmation' ? CANCELLATION_CONFIRMATION_BODY
          : key === 'role_promoted' ? ROLE_PROMOTED_BODY
          : key === 'role_demoted' ? ROLE_DEMOTED_BODY
          : key === 'unregistration_confirmation' ? UNREGISTRATION_CONFIRMATION_BODY
          : ACCOUNT_CREATED_BODY,
        key,
      )
      const composed = composeSystemTemplate({
        templateKey: key,
        introText: original.introText,
        signatureText: original.signatureText,
      })
      const roundTripped = parseSystemTemplate(composed, key)
      expect(roundTripped.introText).toBe(original.introText)
      expect(roundTripped.signatureText).toBe(original.signatureText)
    })

    it('cancellation_confirmation : compose régénère le bloc figé (variables structurelles)', () => {
      const composed = composeSystemTemplate({
        templateKey: 'cancellation_confirmation',
        introText: 'intro libre',
        signatureText: 'sig libre',
      })
      // Le milieu FIGÉ (entre INTRO:END et SIG:START) doit être régénéré intact :
      // une régression retirant/renommant une variable structurelle du skeleton
      // ne casserait aucun round-trip intro/sig mais corromprait l'email réel
      // dès la première édition admin (PATCH → composeSystemTemplate).
      expect(composed).toContain('{{event_name}}')
      expect(composed).toContain('{{slot_date}}')
      expect(composed).toContain('{{slot_time}}')
      expect(composed).toContain('{{cancellation_reason}}')
      expect(composed).toContain('<mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Choisir un nouveau créneau</mj-button>')
    })

    it('unregistration_confirmation : compose régénère le bloc figé (variables structurelles, sans cancellation_reason)', () => {
      const composed = composeSystemTemplate({
        templateKey: 'unregistration_confirmation',
        introText: 'intro libre',
        signatureText: 'sig libre',
      })
      // Le milieu FIGÉ doit contenir les variables d'événement/date/horaire.
      expect(composed).toContain('{{event_name}}')
      expect(composed).toContain('{{slot_date}}')
      expect(composed).toContain('{{slot_time}}')
      // AUCUNE variable cancellation_reason — désinscription volontaire, pas d'annulation admin.
      expect(composed).not.toContain('{{cancellation_reason}}')
      expect(composed).toContain('<mj-button href="{{calendar_url}}" font-weight="bold" padding="20px 0">Voir les créneaux disponibles</mj-button>')
    })

    it.each(['role_promoted', 'role_demoted'] as const)(
      '%s : compose régénère le bouton figé {{login_url}} + label « Accéder à mon espace »',
      (key) => {
        // Garde skeleton↔seed : un seul fragment de skeleton qui dériverait du
        // body SQL seedé (migration 026) corromprait l'email dès la première
        // édition admin (PATCH → composeSystemTemplate), sans casser le
        // round-trip intro/sig. Cf. note SSOT migration 026.
        const composed = composeSystemTemplate({
          templateKey: key,
          introText: 'intro libre',
          signatureText: 'sig libre',
        })
        expect(composed).toContain('<mj-button href="{{login_url}}" font-weight="bold" padding="20px 0">Accéder à mon espace</mj-button>')
      },
    )

    it('throws InvitationCompositionError for invitation', () => {
      expect(() =>
        composeSystemTemplate({
          templateKey: 'magic_link_login',
          introText: 'x',
          signatureText: 'y',
        }),
      ).not.toThrow()

      // invitation is not a valid SystemTemplateKey — TS prevents it at compile time
      // but we test the runtime guard via type assertion
      expect(() =>
        composeSystemTemplate({
          templateKey: 'invitation' as any,
          introText: 'x',
          signatureText: 'y',
        }),
      ).toThrow()
    })

    it('HTML-escapes < > & " \' in input text', () => {
      const composed = composeSystemTemplate({
        templateKey: 'magic_link_login',
        introText: '<script>alert("xss")</script>',
        signatureText: "it's & \"done\"",
      })
      expect(composed).not.toContain('<script>')
      expect(composed).toContain('&lt;script&gt;')
      expect(composed).toContain('&#39;')
      expect(composed).toContain('&amp;')

      // Round-trip preserves the original text
      const parsed = parseSystemTemplate(composed, 'magic_link_login')
      expect(parsed.introText).toBe('<script>alert("xss")</script>')
      expect(parsed.signatureText).toBe("it's & \"done\"")
    })

    it('correctly round-trips double-encoded entities (admin types literal &amp;)', () => {
      const composed = composeSystemTemplate({
        templateKey: 'magic_link_login',
        introText: 'Use &amp; for ampersand',
        signatureText: 'Less than &lt; sign',
      })
      const parsed = parseSystemTemplate(composed, 'magic_link_login')
      expect(parsed.introText).toBe('Use &amp; for ampersand')
      expect(parsed.signatureText).toBe('Less than &lt; sign')
    })

    it('invariant round-trip parse(compose(x))===x avec \\n, \\n\\n, &, <', () => {
      const introText = 'Bonjour {{user_first_name}},\n\nVoici du texte avec & et <tag>.'
      const signatureText = 'Ligne 1\nLigne 2\n\nCordialement'
      const composed = composeSystemTemplate({
        templateKey: 'magic_link_login',
        introText,
        signatureText,
      })
      const parsed = parseSystemTemplate(composed, 'magic_link_login')
      expect(parsed.introText).toBe(introText)
      expect(parsed.signatureText).toBe(signatureText)
    })

    it('composeSystemTemplate produit <br/><br/> pour \\n\\n ; parseSystemTemplate reconvertit <br/> en \\n', () => {
      const composed = composeSystemTemplate({
        templateKey: 'magic_link_login',
        introText: 'Ligne A\n\nLigne B',
        signatureText: 'Sig ligne 1\nSig ligne 2',
      })
      expect(composed).toContain('Ligne A<br/><br/>Ligne B')
      expect(composed).toContain('Sig ligne 1<br/>Sig ligne 2')

      const parsed = parseSystemTemplate(composed, 'magic_link_login')
      expect(parsed.introText).toBe('Ligne A\n\nLigne B')
      expect(parsed.signatureText).toBe('Sig ligne 1\nSig ligne 2')
    })
  })

  // =========================================================
  // getEmailTemplateView
  // =========================================================
  describe('getEmailTemplateView', () => {
    it('returns bodyMjml for invitation (no intro/signature)', async () => {
      mockedGet.mockResolvedValueOnce(makeRow('invitation', INVITATION_BODY, INVITATION_BODY))

      const view = await getEmailTemplateView('invitation')
      expect(view.templateKey).toBe('invitation')
      expect(view).toHaveProperty('bodyMjml')
      expect(view).not.toHaveProperty('introText')
    })

    it('returns introText/signatureText for system template (no bodyMjml)', async () => {
      mockedGet.mockResolvedValueOnce(
        makeRow('magic_link_login', MAGIC_LINK_LOGIN_BODY, MAGIC_LINK_LOGIN_BODY),
      )

      const view = await getEmailTemplateView('magic_link_login')
      expect(view.templateKey).toBe('magic_link_login')
      expect(view).toHaveProperty('introText')
      expect(view).toHaveProperty('signatureText')
      expect(view).toHaveProperty('defaultIntroText')
      expect(view).toHaveProperty('defaultSignatureText')
      expect(view).not.toHaveProperty('bodyMjml')
    })
  })

  // =========================================================
  // applyEmailTemplatePatch
  // =========================================================
  describe('applyEmailTemplatePatch', () => {
    it('delegates bodyMjml unchanged for invitation', async () => {
      mockedUpdate.mockResolvedValueOnce(makeRow('invitation', INVITATION_BODY, INVITATION_BODY))
      mockedGet.mockResolvedValueOnce(makeRow('invitation', INVITATION_BODY, INVITATION_BODY))

      await applyEmailTemplatePatch('invitation', { bodyMjml: INVITATION_BODY })
      expect(mockedUpdate).toHaveBeenCalledWith('invitation', { bodyMjml: INVITATION_BODY })
    })

    it('composes bodyMjml from introText/signatureText for system template', async () => {
      const composed = composeSystemTemplate({
        templateKey: 'magic_link_login',
        introText: 'Hello',
        signatureText: 'Bye',
      })
      mockedUpdate.mockResolvedValueOnce(makeRow('magic_link_login', composed, MAGIC_LINK_LOGIN_BODY))
      mockedGet.mockResolvedValueOnce(makeRow('magic_link_login', composed, MAGIC_LINK_LOGIN_BODY))

      await applyEmailTemplatePatch('magic_link_login', {
        introText: 'Hello',
        signatureText: 'Bye',
      })

      expect(mockedUpdate).toHaveBeenCalledWith('magic_link_login', { bodyMjml: composed })
    })
  })
})
