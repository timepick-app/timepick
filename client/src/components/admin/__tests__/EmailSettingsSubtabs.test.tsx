import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmailSettingsSubtabs } from '../EmailSettingsSubtabs'
import {
  VALID_EMAIL_SUBTABS,
  DEFAULT_EMAIL_SUBTAB,
  LEGACY_EMAIL_SUBTAB_REDIRECTS,
  type EmailSubtabId,
} from '../emailSubtabs.constants'
import type { SystemTemplateKey } from '../../../lib/email-system-template-constants'
import {
  getEmailTemplate,
  patchEmailTemplate,
  resetAllEmailTemplates,
  type InvitationTemplate,
  type SystemTemplate,
} from '../../../services/email-templates.service'

// --- Stubs : panneaux « muets » ------------------------------------------
// Chaque carte stub expose un bouton `onOpenEditor` (comme les vraies cartes
// muettes). Le conductor possède désormais l'unique <MjmlEditorOverlay>.

vi.mock('../EmailInvitationTemplatePanel', () => ({
  EmailInvitationTemplatePanel: ({
    onOpenEditor,
  }: {
    onOpenEditor: () => void
  }) => (
    <div data-testid="email-invitation-template-panel-stub">
      <button
        type="button"
        data-testid="invitation-open-editor-btn"
        onClick={onOpenEditor}
      >
        open
      </button>
    </div>
  ),
}))

// Le conductor importe SYSTEM_TEMPLATE_LABELS depuis ce module : on le fournit
// inline dans la factory (hoisting — pas de référence à une const externe).
vi.mock('../EmailSystemTemplatePanel', () => ({
  EmailSystemTemplatePanel: ({
    templateKey,
    onOpenEditor,
  }: {
    templateKey: string
    onOpenEditor: () => void
  }) => (
    <div data-testid={`email-system-template-panel-stub-${templateKey}`}>
      <button
        type="button"
        data-testid={`system-open-editor-btn-${templateKey}`}
        onClick={onOpenEditor}
      >
        open
      </button>
    </div>
  ),
  SYSTEM_TEMPLATE_LABELS: {
    magic_link_login: { displayName: 'Connexion', description: '' },
    reservation_confirmation: { displayName: 'Confirmation de réservation', description: '' },
    account_created: { displayName: 'Création de compte', description: '' },
    cancellation_confirmation: { displayName: 'Annulation de créneau', description: '' },
    role_promoted: { displayName: 'Promotion administrateur', description: '' },
    role_demoted: { displayName: 'Retour au rang de membre', description: '' },
    unregistration_confirmation: { displayName: 'Désinscription de créneau', description: '' },
  },
}))

vi.mock('../EmailReservationConfirmationPanel', () => ({
  EmailReservationConfirmationPanel: ({
    onOpenEditor,
  }: {
    onOpenEditor: () => void
  }) => (
    <div data-testid="email-reservation-confirmation-panel-stub">
      <button
        type="button"
        data-testid="system-open-editor-btn-reservation_confirmation"
        onClick={onOpenEditor}
      >
        open
      </button>
    </div>
  ),
}))

// --- Stub <MjmlEditorOverlay> --------------------------------------------
// Évite de charger GrapesJS (lazy chunk) en unitaire. Expose :
//  - le template-switcher (value + nb options + trigger de switch)
//  - des boutons save (invitation onSave / système onSaveSystem)
//  - un bouton cancel (onCancel).
vi.mock('../email-editor/MjmlEditorOverlay', () => ({
  MjmlEditorOverlay: (props: Record<string, unknown>) => {
    if (!props.open) return null
    const switcher = props.templateSwitcher as
      | {
          value: string
          options: { value: string }[]
          onRequestSwitch: (next: string) => void
        }
      | undefined
    const onSave = props.onSave as ((body: string) => Promise<void>) | undefined
    const onSaveSystem = props.onSaveSystem as
      | ((zones: { introText: string; signatureText: string }) => Promise<void>)
      | undefined
    const onCancel = props.onCancel as () => void
    return (
      <div
        data-testid="mjml-editor-overlay-stub"
        data-template-key={String(props.templateKey)}
        data-mode={String(props.mode ?? 'invitation')}
        data-is-custom={String(props.isCustom ?? false)}
        data-switcher-value={switcher?.value}
        data-switcher-options-count={String(switcher?.options?.length ?? 0)}
      >
        <span data-testid="overlay-switcher-value">{switcher?.value}</span>
        {switcher && (
          <button
            type="button"
            data-testid="overlay-switch-trigger"
            onClick={() => switcher.onRequestSwitch('emails-systeme-magic-link-login')}
          >
            switch
          </button>
        )}
        {onSave && (
          <>
            <button
              type="button"
              data-testid="stub-save"
              onClick={() =>
                onSave(
                  '<mj-section><mj-text>{{magic_link}} {{expiration_date}}</mj-text></mj-section>',
                )
              }
            >
              stub-save
            </button>
            <button
              type="button"
              data-testid="stub-save-missing"
              onClick={() =>
                onSave('<mj-section><mj-text>no critical tokens</mj-text></mj-section>')
              }
            >
              stub-save-missing
            </button>
            <button
              type="button"
              data-testid="stub-save-throwing"
              onClick={async () => {
                try {
                  await onSave(
                    '<mj-section><mj-text>{{magic_link}} {{expiration_date}}</mj-text></mj-section>',
                  )
                } catch {
                  /* swallowed by overlay catch in production */
                }
              }}
            >
              stub-save-throwing
            </button>
            <button
              type="button"
              data-testid="stub-save-missing-throwing"
              onClick={async () => {
                try {
                  await onSave('<mj-section><mj-text>no critical tokens</mj-text></mj-section>')
                } catch {
                  /* swallowed by overlay catch in production */
                }
              }}
            >
              stub-save-missing-throwing
            </button>
          </>
        )}
        {onSaveSystem && (
          <button
            type="button"
            data-testid="stub-save-system"
            onClick={() =>
              onSaveSystem({ introText: 'I {{expiration_date}}', signatureText: 'S' })
            }
          >
            stub-save-system
          </button>
        )}
        <button type="button" data-testid="stub-cancel" onClick={onCancel}>
          stub-cancel
        </button>
      </div>
    )
  },
}))

// --- Service + context mocks ---------------------------------------------
// Hooks RÉELS (useEmailTemplate / usePatchEmailTemplate / useResetAllEmail
// via QueryClient) ; on mocke le SERVICE sous-jacent. useEditorContext est
// mocké (le conductor l'invoque mais n'en consomme pas le résultat).

vi.mock('../../../services/email-templates.service', () => ({
  getEmailTemplate: vi.fn(),
  patchEmailTemplate: vi.fn(),
  resetAllEmailTemplates: vi.fn(),
}))

vi.mock('@/hooks/useEditorContext', () => ({
  useEditorContext: () => ({ data: undefined, isLoading: false, error: null }),
}))

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: toastMocks }))

const mockGet = vi.mocked(getEmailTemplate)
const mockPatch = vi.mocked(patchEmailTemplate)
const mockResetAll = vi.mocked(resetAllEmailTemplates)

// --- Fixtures ------------------------------------------------------------

const invitationDto: InvitationTemplate = {
  templateKey: 'invitation',
  bodyMjml:
    '<!-- timepick:body --><mj-section><mj-text>{{magic_link}} {{expiration_date}}</mj-text></mj-section><!-- /timepick:body -->',
  defaultBodyMjml:
    '<!-- timepick:body --><mj-section><mj-text>{{magic_link}} {{expiration_date}}</mj-text></mj-section><!-- /timepick:body -->',
  updatedAt: '2026-05-01T10:00:00Z',
  subject: null,
  defaultSubject: 'Inscription participation - {{event_name}}',
  subjectVariables: [],
}

const SYSTEM_DEFAULTS: Record<SystemTemplateKey, { intro: string; sig: string }> = {
  magic_link_login: {
    intro: 'Bonjour {{user_first_name}}, voici votre lien de connexion :',
    sig: 'Ce lien expire le {{expiration_date}}.',
  },
  reservation_confirmation: {
    intro: 'Votre réservation pour {{event_name}} est confirmée.',
    sig: "Vous pouvez annuler à tout moment depuis l'application.",
  },
  account_created: {
    intro: 'votre compte vient d\'être créé.',
    sig: 'À bientôt !',
  },
  cancellation_confirmation: {
    intro: 'le créneau suivant a été annulé :',
    sig: "Cordialement, L'équipe d'organisation",
  },
  role_promoted: {
    intro: 'vous êtes désormais Administrateur.',
    sig: 'Connectez-vous pour retrouver votre espace.',
  },
  role_demoted: {
    intro: 'vous êtes désormais Membre.',
    sig: 'Connectez-vous pour retrouver votre espace.',
  },
  unregistration_confirmation: {
    intro: 'nous confirmons votre désinscription du créneau :',
    sig: "Cordialement, L'équipe d'organisation",
  },
}

function makeSystemDto(key: SystemTemplateKey): SystemTemplate {
  const factory = SYSTEM_DEFAULTS[key]
  return {
    templateKey: key,
    introText: factory.intro,
    signatureText: factory.sig,
    defaultIntroText: factory.intro,
    defaultSignatureText: factory.sig,
    updatedAt: '2026-05-01T10:00:00Z',
    subject: null,
    defaultSubject: 'Confirmation de réservation - {{event_name}}',
    subjectVariables: [],
  }
}

function makeDto(key: 'invitation' | SystemTemplateKey): InvitationTemplate | SystemTemplate {
  return key === 'invitation' ? invitationDto : makeSystemDto(key)
}

// --- Harness -------------------------------------------------------------

function Harness({ initial }: { initial: EmailSubtabId }) {
  const [active, setActive] = useState<EmailSubtabId>(initial)
  return <EmailSettingsSubtabs activeSubtab={active} onSubtabChange={setActive} />
}

function renderWith(initial: EmailSubtabId = 'template-invitation') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  )
  return { ...utils, queryClient }
}

// --- Tests ---------------------------------------------------------------

describe('EmailSettingsSubtabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockImplementation((key) =>
      Promise.resolve(makeDto(key as 'invitation' | SystemTemplateKey)) as never,
    )
    mockPatch.mockResolvedValue({} as never)
    mockResetAll.mockResolvedValue({ templatesReset: 8, shellPartsDeleted: 0 })
  })

  it('exposes the eight template options in the selector', async () => {
    const user = userEvent.setup()
    renderWith('template-invitation')
    await user.click(screen.getByRole('combobox'))
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Invitation'),
        expect.stringContaining('Connexion'),
        expect.stringContaining('Confirmation'),
        expect.stringContaining('Création de compte'),
        expect.stringContaining('Annulation'),
        expect.stringContaining('Désinscription'),
        expect.stringContaining('Promotion admin'),
        expect.stringContaining('Retour membre'),
      ]),
    )
  })

  it('exports a VALID_EMAIL_SUBTABS list of exactly the eight canonical ids', () => {
    expect(VALID_EMAIL_SUBTABS).toEqual([
      'template-invitation',
      'emails-systeme-magic-link-login',
      'emails-systeme-confirmation',
      'emails-systeme-account-created',
      'emails-systeme-annulation',
      'emails-systeme-desinscription',
      'emails-systeme-role-promu',
      'emails-systeme-role-retrograde',
    ])
  })

  it('exports template-invitation as the default sub-tab', () => {
    expect(DEFAULT_EMAIL_SUBTAB).toBe('template-invitation')
  })

  it('maps the legacy identite-visuelle subtab to template-invitation', () => {
    expect(LEGACY_EMAIL_SUBTAB_REDIRECTS['identite-visuelle']).toBe('template-invitation')
  })

  it('maps the legacy grouped magic-links subtab to the login sub-tab', () => {
    expect(LEGACY_EMAIL_SUBTAB_REDIRECTS['emails-systeme-magic-links']).toBe(
      'emails-systeme-magic-link-login',
    )
  })

  it('renders the invitation template panel when the template-invitation sub-tab is active', () => {
    renderWith('template-invitation')
    const panel = screen.getByTestId('email-invitation-template-panel-stub')
    expect(panel.closest('[role="tabpanel"]')).not.toHaveClass('hidden')
  })

  it('renders the magic_link_login system panel when that sub-tab is active', () => {
    renderWith('emails-systeme-magic-link-login')
    const panel = screen.getByTestId(
      'email-system-template-panel-stub-magic_link_login',
    )
    expect(panel.closest('[role="tabpanel"]')).not.toHaveClass('hidden')
  })

  it('renders the confirmation host panel when that sub-tab is active', () => {
    renderWith('emails-systeme-confirmation')
    const panel = screen.getByTestId('email-reservation-confirmation-panel-stub')
    expect(panel.closest('[role="tabpanel"]')).not.toHaveClass('hidden')
  })

  it('renders the account_created system panel when that sub-tab is active', () => {
    renderWith('emails-systeme-account-created')
    const panel = screen.getByTestId(
      'email-system-template-panel-stub-account_created',
    )
    expect(panel.closest('[role="tabpanel"]')).not.toHaveClass('hidden')
  })

  it('renders the cancellation_confirmation system panel when that sub-tab is active', () => {
    renderWith('emails-systeme-annulation')
    const panel = screen.getByTestId(
      'email-system-template-panel-stub-cancellation_confirmation',
    )
    expect(panel.closest('[role="tabpanel"]')).not.toHaveClass('hidden')
  })

  it('renders the unregistration_confirmation system panel when that sub-tab is active', () => {
    renderWith('emails-systeme-desinscription')
    const panel = screen.getByTestId(
      'email-system-template-panel-stub-unregistration_confirmation',
    )
    expect(panel.closest('[role="tabpanel"]')).not.toHaveClass('hidden')
  })

  it('switches the active sub-tab when an option is selected', async () => {
    const user = userEvent.setup()
    renderWith('template-invitation')
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /Connexion/ }))
    const panel = screen.getByTestId(
      'email-system-template-panel-stub-magic_link_login',
    )
    expect(panel.closest('[role="tabpanel"]')).not.toHaveClass('hidden')
  })

  it('keeps every TabsContent mounted (forceMount) so panel state survives switches', () => {
    renderWith('template-invitation')
    expect(screen.getByTestId('email-invitation-template-panel-stub')).toBeInTheDocument()
    expect(
      screen.getByTestId('email-system-template-panel-stub-magic_link_login'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('email-reservation-confirmation-panel-stub'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('email-system-template-panel-stub-account_created'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('email-system-template-panel-stub-cancellation_confirmation'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('email-system-template-panel-stub-unregistration_confirmation'),
    ).toBeInTheDocument()
  })

  // D7 invariant — forceMount monte tous les panneaux, mais EXACTEMENT un seul
  // est visible ; les autres portent `hidden`.
  it('shows exactly the active panel and hides the others', () => {
    renderWith('template-invitation')
    const panelOf = (testid: string) =>
      screen.getByTestId(testid).closest('[role="tabpanel"]')
    expect(panelOf('email-invitation-template-panel-stub')).not.toHaveClass('hidden')
    expect(
      panelOf('email-system-template-panel-stub-magic_link_login'),
    ).toHaveClass('hidden')
    expect(panelOf('email-reservation-confirmation-panel-stub')).toHaveClass('hidden')
    expect(panelOf('email-system-template-panel-stub-account_created')).toHaveClass('hidden')
    expect(
      panelOf('email-system-template-panel-stub-cancellation_confirmation'),
    ).toHaveClass('hidden')
    expect(
      panelOf('email-system-template-panel-stub-unregistration_confirmation'),
    ).toHaveClass('hidden')
  })

  it('does NOT expose an identite-visuelle option (Plan 2 — dissolved into the email editor menu)', async () => {
    const user = userEvent.setup()
    renderWith('template-invitation')
    await user.click(screen.getByRole('combobox'))
    const options = await screen.findAllByRole('option')
    expect(
      options.some((o) => /Identité visuelle/.test(o.textContent ?? '')),
    ).toBe(false)
  })

  it('renders the common header/identity note above the sub-tabs', () => {
    renderWith('template-invitation')
    const note = screen.getByTestId('email-common-header-identity-note')
    expect(note).toHaveTextContent(
      "L'en-tête et l'identité visuelle sont communs à tous les emails",
    )
    expect(note).toHaveTextContent("dans l'éditeur")
    expect(note).toHaveTextContent(
      'Le corps et le pied, eux, sont propres à chaque modèle ci-dessous.',
    )
    expect(note).not.toHaveTextContent('onglet invitation')
  })

  it('renders the "Tous les modèles" section heading as an h2', () => {
    renderWith('template-invitation')
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Tous les modèles',
    })
    expect(heading).toBeInTheDocument()
  })

  // R2 — global reset-all au niveau parent, gated par AlertDialog destructif.
  describe('global reset-all', () => {
    it('renders the global reset-all button at the parent level', () => {
      renderWith('template-invitation')
      expect(screen.getByTestId('email-reset-all-btn')).toHaveTextContent(
        "Réinitialiser tous les modèles d'emails",
      )
    })

    it('opens a destructive confirmation dialog stating the scope', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      await user.click(screen.getByTestId('email-reset-all-btn'))
      const dialog = await screen.findByTestId('email-reset-all-confirm')
      expect(dialog).toHaveTextContent("Réinitialiser tous les modèles d'emails ?")
      expect(dialog).toHaveTextContent("Les événements et l'identité visuelle sont préservés")
    })

    it('triggers the reset service exactly once when confirmed', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      await user.click(screen.getByTestId('email-reset-all-btn'))
      await user.click(await screen.findByTestId('email-reset-all-confirm-action'))
      await waitFor(() => expect(mockResetAll).toHaveBeenCalledTimes(1))
    })

    it('does NOT trigger the reset service when cancelled', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      await user.click(screen.getByTestId('email-reset-all-btn'))
      await user.click(await screen.findByRole('button', { name: 'Annuler' }))
      expect(mockResetAll).not.toHaveBeenCalled()
    })
  })


  // === Conductor — overlay unique + template-switcher =====================

  describe('conductor overlay', () => {
    it('renders the overlay when a panel opens the editor', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      expect(screen.queryByTestId('mjml-editor-overlay-stub')).toBeNull()
      await user.click(screen.getByTestId('invitation-open-editor-btn'))
      expect(
        await screen.findByTestId('mjml-editor-overlay-stub'),
      ).toBeInTheDocument()
    })

    it('passes the template switcher with all 8 options and the current value', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      await user.click(screen.getByTestId('invitation-open-editor-btn'))
      const overlay = await screen.findByTestId('mjml-editor-overlay-stub')
      expect(overlay).toHaveAttribute('data-switcher-value', 'template-invitation')
      expect(overlay).toHaveAttribute('data-switcher-options-count', '8')
    })

    it('does NOT render the overlay until a panel opens it', () => {
      renderWith('template-invitation')
      expect(screen.queryByTestId('mjml-editor-overlay-stub')).toBeNull()
    })

    it('re-keys the overlay (template + mode) when the switcher requests a switch', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      await user.click(screen.getByTestId('invitation-open-editor-btn'))
      const invitationOverlay = await screen.findByTestId('mjml-editor-overlay-stub')
      expect(invitationOverlay).toHaveAttribute('data-template-key', 'invitation')
      expect(invitationOverlay).toHaveAttribute('data-mode', 'invitation')

      await user.click(screen.getByTestId('overlay-switch-trigger'))

      // Le switch change editingSubtab → l'overlay se remonte en mode système
      // sur magic_link_login (re-key via key={editingSubtab}).
      const systemOverlay = await screen.findByTestId('mjml-editor-overlay-stub')
      expect(systemOverlay).toHaveAttribute('data-template-key', 'magic_link_login')
      expect(systemOverlay).toHaveAttribute('data-mode', 'system')
      expect(systemOverlay).toHaveAttribute(
        'data-switcher-value',
        'emails-systeme-magic-link-login',
      )
    })

    it('closes the overlay without API calls when stub-cancel is clicked', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      await user.click(screen.getByTestId('invitation-open-editor-btn'))
      expect(screen.getByTestId('mjml-editor-overlay-stub')).toBeInTheDocument()
      await user.click(screen.getByTestId('stub-cancel'))
      await waitFor(() =>
        expect(screen.queryByTestId('mjml-editor-overlay-stub')).toBeNull(),
      )
      expect(mockPatch).not.toHaveBeenCalled()
    })

    // --- Save invitation (réplique du handleSave) ------------------------

    it('invitation save → PATCH + success toast, no warning, when critical tokens are present', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      await user.click(screen.getByTestId('invitation-open-editor-btn'))
      await user.click(screen.getByText('stub-save'))

      await waitFor(() =>
        expect(mockPatch).toHaveBeenCalledWith('invitation', {
          bodyMjml:
            '<mj-section><mj-text>{{magic_link}} {{expiration_date}}</mj-text></mj-section>',
        }),
      )
      expect(toastMocks.warning).not.toHaveBeenCalled()
      await waitFor(() =>
        expect(toastMocks.success).toHaveBeenCalledWith("Modèle d'invitation enregistré"),
      )
      // post-5a — l'éditeur reste ouvert après l'enregistrement.
      expect(screen.getByTestId('mjml-editor-overlay-stub')).toBeInTheDocument()
    })

    it('invitation save with missing tokens → FR55 warning (before success) + PATCH', async () => {
      const user = userEvent.setup()
      renderWith('template-invitation')
      await user.click(screen.getByTestId('invitation-open-editor-btn'))
      await user.click(screen.getByText('stub-save-missing'))

      await waitFor(() => expect(toastMocks.warning).toHaveBeenCalledTimes(1))
      const warningArg = toastMocks.warning.mock.calls[0]?.[0] as string
      expect(warningArg).toContain('{{magic_link}}')
      expect(warningArg).toContain('{{expiration_date}}')
      expect(warningArg).toContain('inutilisables')
      expect(warningArg).toContain('modèle')

      await waitFor(() =>
        expect(mockPatch).toHaveBeenCalledWith('invitation', {
          bodyMjml: '<mj-section><mj-text>no critical tokens</mj-text></mj-section>',
        }),
      )
      await waitFor(() =>
        expect(toastMocks.success).toHaveBeenCalledWith("Modèle d'invitation enregistré"),
      )

      // L'ordre compte : warning AVANT success.
      const warningCallOrder = toastMocks.warning.mock.invocationCallOrder[0]
      const successCallOrder = toastMocks.success.mock.invocationCallOrder[0]
      expect(warningCallOrder).toBeLessThan(successCallOrder)
    })

    it('invitation save rejection does NOT show success (overlay stays open)', async () => {
      const user = userEvent.setup()
      mockPatch.mockRejectedValueOnce(new Error('500'))
      renderWith('template-invitation')
      await user.click(screen.getByTestId('invitation-open-editor-btn'))
      await user.click(screen.getByText('stub-save-throwing'))

      await waitFor(() => expect(mockPatch).toHaveBeenCalled())
      expect(toastMocks.success).not.toHaveBeenCalled()
      expect(screen.getByTestId('mjml-editor-overlay-stub')).toBeInTheDocument()
    })

    it('invitation save rejection does NOT show FR55 warning even with missing tokens (D1)', async () => {
      const user = userEvent.setup()
      mockPatch.mockRejectedValueOnce(new Error('500'))
      renderWith('template-invitation')
      await user.click(screen.getByTestId('invitation-open-editor-btn'))
      await user.click(screen.getByText('stub-save-missing-throwing'))

      await waitFor(() => expect(mockPatch).toHaveBeenCalled())
      expect(toastMocks.warning).not.toHaveBeenCalled()
      expect(toastMocks.success).not.toHaveBeenCalled()
    })

    // --- Save système (réplique du onSaveSystem) -------------------------

    it('system save → PATCH intro/sig + success toast with displayName', async () => {
      const user = userEvent.setup()
      mockPatch.mockResolvedValue(makeSystemDto('magic_link_login') as never)
      renderWith('emails-systeme-magic-link-login')
      await user.click(screen.getByTestId('system-open-editor-btn-magic_link_login'))
      await user.click(await screen.findByTestId('stub-save-system'))

      await waitFor(() =>
        expect(mockPatch).toHaveBeenCalledWith('magic_link_login', {
          introText: 'I {{expiration_date}}',
          signatureText: 'S',
        }),
      )
      await waitFor(() =>
        expect(toastMocks.success).toHaveBeenCalledWith('Modèle Connexion enregistré'),
      )
    })

    it('system overlay opens in mode="system" with the right templateKey', async () => {
      const user = userEvent.setup()
      renderWith('emails-systeme-magic-link-login')
      await user.click(screen.getByTestId('system-open-editor-btn-magic_link_login'))
      const overlay = await screen.findByTestId('mjml-editor-overlay-stub')
      expect(overlay).toHaveAttribute('data-mode', 'system')
      expect(overlay).toHaveAttribute('data-template-key', 'magic_link_login')
    })
  })
})
