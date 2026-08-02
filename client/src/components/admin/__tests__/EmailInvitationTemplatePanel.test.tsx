import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EmailInvitationTemplatePanel } from '../EmailInvitationTemplatePanel'
import {
  getEmailTemplate,
  type InvitationTemplate,
} from '../../../services/email-templates.service'
import { setTestScreen } from '@/test/screenSize'

// --- Mocks ---------------------------------------------------------------

// Carte muette (conductor 2026-06-22) : le panneau ne PATCH plus et ne rend
// plus l'overlay. On ne mocke QUE getEmailTemplate (useEmailTemplate réel via
// QueryClient). useEditorContext est mocké pour éviter un appel réseau (l'overlay
// n'existe plus dans ce panneau ; seul le conductor l'invoque désormais).
vi.mock('../../../services/email-templates.service', () => ({
  getEmailTemplate: vi.fn(),
}))

vi.mock('@/hooks/useEditorContext', () => ({
  useEditorContext: () => ({ data: undefined, isLoading: false, error: null }),
}))

const mockGet = vi.mocked(getEmailTemplate)

// --- Helpers -------------------------------------------------------------

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

function renderPanel(onOpenEditor = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <EmailInvitationTemplatePanel onOpenEditor={onOpenEditor} />
    </QueryClientProvider>,
  )
  return { ...utils, queryClient, onOpenEditor }
}

// --- Tests ---------------------------------------------------------------

describe('EmailInvitationTemplatePanel (carte muette)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue(invitationDto)
  })

  it('renders the loading skeleton while the query is loading', () => {
    const { promise } = Promise.withResolvers<InvitationTemplate>()
    mockGet.mockReturnValue(promise)

    renderPanel()

    expect(screen.getByTestId('invitation-loading-skeleton')).toBeInTheDocument()
  })

  it('renders the error banner when the row query rejects', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'))

    renderPanel()

    expect(
      await screen.findByTestId('invitation-load-error'),
    ).toBeInTheDocument()
  })

  it("ne rend pas le CTA tant que la requête charge, puis l'affiche à la résolution", async () => {
    const { promise, resolve } = Promise.withResolvers<InvitationTemplate>()
    mockGet.mockReturnValue(promise)

    renderPanel()

    expect(screen.getByTestId('invitation-loading-skeleton')).toBeInTheDocument()

    resolve(invitationDto)
    await screen.findByTestId('invitation-open-editor-btn')
  })

  it("appelle onOpenEditor quand on clique « Personnaliser avec l'éditeur »", async () => {
    const user = userEvent.setup()
    const onOpenEditor = vi.fn()
    renderPanel(onOpenEditor)

    await user.click(await screen.findByTestId('invitation-open-editor-btn'))

    expect(onOpenEditor).toHaveBeenCalledTimes(1)
  })

  it("ne rend PAS l'overlay GrapesJS (délégué au conductor)", async () => {
    renderPanel()
    await screen.findByTestId('invitation-open-editor-btn')
    expect(screen.queryByTestId('mjml-editor-overlay')).toBeNull()
    expect(screen.queryByTestId('mjml-editor-overlay-stub')).toBeNull()
  })

  // === L2 — vocabulaire « modèle » + copie réduite (en-tête déplacé) ===

  it("affiche le titre « Modèle d'invitation par défaut » (D3)", async () => {
    renderPanel()
    expect(
      await screen.findByText("Modèle d'invitation par défaut"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Gabarit d'invitation par défaut"),
    ).not.toBeInTheDocument()
  })

  it('retire le paragraphe « en-tête partagé » de la carte (déplacé au niveau commun, D4)', async () => {
    renderPanel()
    await screen.findByText("Modèle d'invitation par défaut")
    expect(
      screen.queryByText(
        /L'en-tête de ce (modèle|gabarit) est partagé entre tous les emails/i,
      ),
    ).not.toBeInTheDocument()
  })

  it('conserve la mention des variables indispensables (rôle propre au modèle)', async () => {
    renderPanel()
    expect(
      await screen.findByText(
        /variables indispensables, insérées automatiquement/i,
      ),
    ).toBeInTheDocument()
  })

  it('affiche la section « Variables disponibles » avec les 4 tokens (Drawbridge 23)', async () => {
    renderPanel()

    const section = await screen.findByTestId('invitation-template-variables')
    expect(section).toBeInTheDocument()

    expect(section).toHaveTextContent('{{event_name}}')
    expect(section).toHaveTextContent('{{event_description}}')
    expect(section).toHaveTextContent('{{magic_link}}')
    expect(section).toHaveTextContent('{{expiration_date}}')
  })

  // === Refus des appareils qui ne pourront jamais afficher l'éditeur ===

  it("garde le CTA sur un écran capable, sans explication de repli", async () => {
    renderPanel()

    expect(
      await screen.findByTestId('invitation-open-editor-btn'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('email-editor-screen-requirement')).toBeNull()
  })

  it("retire le CTA et explique, sur un écran incapable — le reste de la fiche est intact", async () => {
    setTestScreen(393, 852)

    renderPanel()

    expect(
      await screen.findByTestId('email-editor-screen-requirement'),
    ).toHaveTextContent(/quelle que soit son orientation/i)
    expect(screen.queryByTestId('invitation-open-editor-btn')).toBeNull()
    expect(screen.getByTestId('invitation-template-variables')).toBeInTheDocument()
  })
})
