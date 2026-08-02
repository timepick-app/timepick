import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmailSystemTemplatePanel } from '../EmailSystemTemplatePanel'
import {
  getEmailTemplate,
  type SystemTemplate,
} from '../../../services/email-templates.service'
import {
  SYSTEM_TEMPLATE_VARIABLES,
  type SystemTemplateKey,
} from '../../../lib/email-system-template-constants'
import { setTestScreen } from '@/test/screenSize'

// Carte muette (conductor 2026-06-22) : le panneau ne PATCH plus, ne rend plus
// l'overlay et n'invoque plus useEditorContext. On ne mocke QUE getEmailTemplate
// (useEmailTemplate réel via QueryClient).
vi.mock('../../../services/email-templates.service', () => ({
  getEmailTemplate: vi.fn(),
}))

const mockGet = vi.mocked(getEmailTemplate)

const SYSTEM_KEYS: readonly SystemTemplateKey[] = [
  'magic_link_login',
  'reservation_confirmation',
  'account_created',
  'cancellation_confirmation',
  'role_promoted',
  'role_demoted',
  'unregistration_confirmation',
] as const

function makeDto(key: SystemTemplateKey, intro?: string, sig?: string): SystemTemplate {
  const defaults: Record<SystemTemplateKey, { intro: string; sig: string }> = {
    magic_link_login: {
      intro: 'Bonjour {{user_first_name}},\n\nvoici votre lien de connexion à votre espace :',
      sig: 'Ce lien expire le {{expiration_date}}.',
    },
    reservation_confirmation: {
      intro:
        'Votre réservation pour {{event_name}} est confirmée. Créneau : {{slot_date}} {{slot_time}}.',
      sig: "Vous pouvez annuler à tout moment depuis l'application.",
    },
    account_created: {
      intro:
        'votre compte vient d\'être créé. Cliquez sur le bouton ci-dessous pour vous connecter à votre espace.',
      sig: 'Saisissez votre adresse email pour recevoir un lien de connexion sécurisé. À bientôt !',
    },
    cancellation_confirmation: {
      intro:
        'nous vous informons que le créneau de participation suivant a été annulé :',
      sig: "Cordialement, L'équipe d'organisation",
    },
    role_promoted: {
      intro:
        'votre accès a été mis à jour.\n\nVous êtes désormais Administrateur : vous pouvez gérer les membres, les événements et les paramètres.',
      sig: 'Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !',
    },
    role_demoted: {
      intro:
        "votre accès a été ajusté.\n\nVous êtes désormais Membre : vous continuez à accéder à vos événements et à votre profil ; les fonctions d'administration ne sont plus disponibles.",
      sig: 'Connectez-vous avec votre adresse email pour retrouver votre espace. À bientôt !',
    },
    unregistration_confirmation: {
      intro:
        'nous vous confirmons votre désinscription du créneau de participation suivant :',
      sig: "Cordialement, L'équipe d'organisation",
    },
  }
  const factory = defaults[key]
  return {
    templateKey: key,
    introText: intro ?? factory.intro,
    signatureText: sig ?? factory.sig,
    defaultIntroText: factory.intro,
    defaultSignatureText: factory.sig,
    updatedAt: '2026-05-01T10:00:00Z',
    subject: null,
    defaultSubject: 'Confirmation de réservation - {{event_name}}',
    subjectVariables: [],
  }
}

function renderPanel(templateKey: SystemTemplateKey, onOpenEditor = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <EmailSystemTemplatePanel
        templateKey={templateKey}
        onOpenEditor={onOpenEditor}
      />
    </QueryClientProvider>,
  )
  return { ...utils, queryClient, onOpenEditor }
}

describe('EmailSystemTemplatePanel (carte muette)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe.each(SYSTEM_KEYS)('templateKey=%s', (key) => {
    beforeEach(() => {
      mockGet.mockResolvedValue(makeDto(key) as never)
    })

    it('rend le skeleton tant que la requête charge', () => {
      const { promise } = Promise.withResolvers<SystemTemplate>()
      mockGet.mockReturnValue(promise)
      renderPanel(key)
      expect(
        screen.getByTestId(`system-template-loading-skeleton-${key}`),
      ).toBeInTheDocument()
    })

    it('rend la bannière erreur si la requête row rejette', async () => {
      mockGet.mockRejectedValueOnce(new Error('boom'))
      renderPanel(key)
      expect(
        await screen.findByTestId(`system-template-load-error-${key}`),
      ).toBeInTheDocument()
    })

    it('plus de Textarea ni de gate FR55 inline dans le panneau', async () => {
      renderPanel(key)
      await screen.findByTestId(`system-open-editor-btn-${key}`)
      expect(screen.queryByTestId(`system-template-intro-${key}`)).toBeNull()
      expect(screen.queryByTestId(`system-template-signature-${key}`)).toBeNull()
      expect(screen.queryByTestId(`system-template-fr55-error-${key}`)).toBeNull()
    })

    it('affiche les variables disponibles pour la clé', () => {
      renderPanel(key)
      const section = screen.getByTestId(`system-template-variables-${key}`)
      expect(section).toBeInTheDocument()
      for (const varName of SYSTEM_TEMPLATE_VARIABLES[key]) {
        expect(section).toHaveTextContent(`{{${varName}}}`)
      }
    })

    it('le bouton « Personnaliser » appelle onOpenEditor', async () => {
      const user = userEvent.setup()
      const onOpenEditor = vi.fn()
      renderPanel(key, onOpenEditor)
      await user.click(await screen.findByTestId(`system-open-editor-btn-${key}`))
      expect(onOpenEditor).toHaveBeenCalledTimes(1)
    })

    it('ne rend PAS l\'overlay GrapesJS (délégué au conductor)', async () => {
      renderPanel(key)
      await screen.findByTestId(`system-open-editor-btn-${key}`)
      expect(screen.queryByTestId('mock-overlay')).toBeNull()
      expect(screen.queryByTestId('mjml-editor-overlay')).toBeNull()
    })

    it("garde le CTA sur un écran capable, sans explication de repli", async () => {
      renderPanel(key)
      expect(
        await screen.findByTestId(`system-open-editor-btn-${key}`),
      ).toBeInTheDocument()
      expect(screen.queryByTestId('email-editor-screen-requirement')).toBeNull()
    })

    it("retire le CTA et explique, sur un écran incapable — les variables restent", async () => {
      setTestScreen(393, 852)
      renderPanel(key)

      expect(
        await screen.findByTestId('email-editor-screen-requirement'),
      ).toHaveTextContent(/quelle que soit son orientation/i)
      expect(screen.queryByTestId(`system-open-editor-btn-${key}`)).toBeNull()
      expect(
        screen.getByTestId(`system-template-variables-${key}`),
      ).toBeInTheDocument()
    })
  })
})
