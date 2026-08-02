import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventInvitationTemplatePanel } from '../EventInvitationTemplatePanel'
import {
  getEventEmailTemplate,
  patchEventEmailTemplate,
  resetEventEmailTemplate,
  previewEventEmailTemplate,
  type EventEmailTemplate,
  type EventEmailTemplatePreview,
} from '../../../services/event-email-templates.service'
import { setTestScreen } from '@/test/screenSize'

const EVENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

vi.mock('../../../services/event-email-templates.service', () => ({
  getEventEmailTemplate: vi.fn(),
  patchEventEmailTemplate: vi.fn(),
  resetEventEmailTemplate: vi.fn(),
  previewEventEmailTemplate: vi.fn(),
}))

vi.mock('@/hooks/useEvents', () => ({
  useEventDetails: vi.fn(() => ({ data: { name: 'Forum des assos' } })),
}))

vi.mock('../email-editor/MjmlEditorOverlay', () => ({
  MjmlEditorOverlay: ({
    open,
    initialBodyMjml,
    onSave,
    onReset,
    onCancel,
    title,
  }: {
    open: boolean
    initialBodyMjml: string
    onSave: (body: string) => Promise<void>
    onReset: () => Promise<void>
    onCancel: () => void
    title?: string
  }) =>
    open ? (
      <div data-testid="mjml-editor-overlay-stub">
        <span data-testid="overlay-initial-body">{initialBodyMjml}</span>
        <span data-testid="overlay-title">{title}</span>
        <button
          type="button"
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
          onClick={() => onSave('<mj-section><mj-text>no critical tokens</mj-text></mj-section>')}
        >
          stub-save-missing
        </button>
        <button
          type="button"
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
        <button
          type="button"
          onClick={async () => {
            try {
              await onReset()
            } catch {
              /* handled by panel — prevents vitest unhandled rejection */
            }
          }}
        >
          stub-reset
        </button>
        <button type="button" onClick={() => onCancel()}>
          stub-cancel
        </button>
      </div>
    ) : null,
}))

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: toastMocks,
}))

const mockGet = vi.mocked(getEventEmailTemplate)
const mockPatch = vi.mocked(patchEventEmailTemplate)
const mockReset = vi.mocked(resetEventEmailTemplate)
const mockPreview = vi.mocked(previewEventEmailTemplate)

const customDto: EventEmailTemplate = {
  eventId: EVENT_ID,
  templateKey: 'invitation',
  bodyMjml: '<!-- BODY:START --><mj-section>custom</mj-section><!-- BODY:END -->',
  defaultBodyMjml: '<!-- BODY:START --><mj-section>default</mj-section><!-- BODY:END -->',
  isCustom: true,
  updatedAt: '2026-05-02T12:00:00Z',
  subject: null,
  inheritedSubject: 'Inscription participation - {{event_name}}',
  subjectVariables: [],
}

const inheritedDto: EventEmailTemplate = {
  ...customDto,
  bodyMjml: customDto.defaultBodyMjml,
  isCustom: false,
}

const previewDto: EventEmailTemplatePreview = {
  html: '<html><body>HELLO_EVENT</body></html>',
  text: 'HELLO_EVENT',
  templateKey: 'invitation',
  eventId: EVENT_ID,
  subject: 'Inscription participation - Mon événement',
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <EventInvitationTemplatePanel eventId={EVENT_ID} />
    </QueryClientProvider>,
  )
  return { ...utils, queryClient }
}

describe('EventInvitationTemplatePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue(customDto)
    mockPreview.mockResolvedValue(previewDto)
  })

  afterEach(() => {
    document
      .querySelectorAll('[data-testid="overlay-preview-result"]')
      .forEach((el) => el.remove())
  })

  it('renders the loading skeleton while either query is loading', () => {
    mockGet.mockImplementation(() => new Promise(() => {}))
    mockPreview.mockImplementation(() => new Promise(() => {}))

    renderPanel()

    expect(
      screen.getByTestId('event-invitation-loading-skeleton'),
    ).toBeInTheDocument()
  })

  it('renders the error banner when the row query rejects', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'))
    mockPreview.mockResolvedValue(previewDto)

    renderPanel()

    expect(
      await screen.findByTestId('event-invitation-load-error'),
    ).toBeInTheDocument()
  })

  it('renders the iframe with srcDoc + sandbox once both queries resolve', async () => {
    renderPanel()

    const iframe = await screen.findByTestId('event-invitation-preview-iframe')
    expect(iframe).toHaveAttribute('srcdoc', previewDto.html)
    expect(iframe).toHaveAttribute('sandbox', '')
    expect(iframe).toHaveAttribute(
      'title',
      'Aperçu email invitation pour cet événement',
    )
  })

  it('shows the inheritance badge reflecting template.isCustom (custom)', async () => {
    renderPanel()

    const badge = await screen.findByTestId(
      'event-invitation-inheritance-badge',
    )
    expect(badge).toHaveTextContent('Personnalisé')
  })

  it('shows the inheritance badge reflecting template.isCustom (inherited)', async () => {
    mockGet.mockResolvedValue(inheritedDto)
    renderPanel()

    const badge = await screen.findByTestId(
      'event-invitation-inheritance-badge',
    )
    expect(badge).toHaveTextContent('Défaut')
  })

  it("opens the overlay when 'Personnaliser avec l'éditeur' is clicked", async () => {
    const user = userEvent.setup()
    renderPanel()

    const cta = await screen.findByTestId('event-invitation-open-editor-btn')
    await user.click(cta)

    expect(
      await screen.findByTestId('mjml-editor-overlay-stub'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('overlay-initial-body')).toHaveTextContent(
      customDto.bodyMjml,
    )
  })

  it('forwards body and fires success toast (no warning) when critical tokens present', async () => {
    const user = userEvent.setup()
    mockPatch.mockResolvedValue({
      ...customDto,
      bodyMjml:
        '<mj-section><mj-text>{{magic_link}} {{expiration_date}}</mj-text></mj-section>',
    })

    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    await user.click(screen.getByText('stub-save'))

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(EVENT_ID, {
        bodyMjml:
          '<mj-section><mj-text>{{magic_link}} {{expiration_date}}</mj-text></mj-section>',
      })
    })
    expect(toastMocks.warning).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Template d'invitation sauvegardé pour cet événement",
      ),
    )
    // post-5a — l'éditeur ne se ferme plus à l'enregistrement (alignement avec
    // les legs header/brand qui le laissaient déjà ouvert).
    expect(screen.getByTestId('mjml-editor-overlay-stub')).toBeInTheDocument()
  })

  it('fires the FR55 warning after a successful save (before the success toast) when both critical tokens are missing', async () => {
    const user = userEvent.setup()
    mockPatch.mockResolvedValue({
      ...customDto,
      bodyMjml: '<mj-section><mj-text>no critical tokens</mj-text></mj-section>',
    })

    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    await user.click(screen.getByText('stub-save-missing'))

    await waitFor(() => expect(toastMocks.warning).toHaveBeenCalledTimes(1))
    const warningArg = toastMocks.warning.mock.calls[0]?.[0] as string
    expect(warningArg).toContain('{{magic_link}}')
    expect(warningArg).toContain('{{expiration_date}}')
    expect(warningArg).toContain('inutilisables')

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(EVENT_ID, {
        bodyMjml: '<mj-section><mj-text>no critical tokens</mj-text></mj-section>',
      }),
    )
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Template d'invitation sauvegardé pour cet événement",
      ),
    )

    const warningCallOrder = toastMocks.warning.mock.invocationCallOrder[0]
    const successCallOrder = toastMocks.success.mock.invocationCallOrder[0]
    expect(warningCallOrder).toBeLessThan(successCallOrder)
  })

  it("calls useResetEventEmailTemplate on overlay reset but does NOT toast (overlay-driven post-26-3)", async () => {
    const user = userEvent.setup()
    mockReset.mockResolvedValue(inheritedDto)

    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    await user.click(screen.getByText('stub-reset'))

    // Story 26-3 — toast post-reset déplacé vers l'éditeur (matrice I/O AC4).
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith(EVENT_ID))
    expect(toastMocks.success).not.toHaveBeenCalledWith("Modèle d'invitation restauré")
  })

  it("propagates reset error WITHOUT toasting (overlay-owned)", async () => {
    const user = userEvent.setup()
    mockReset.mockRejectedValueOnce({
      response: { data: { error: { message: 'Réinit impossible' } } },
    })

    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    await user.click(screen.getByText('stub-reset'))

    await waitFor(() => expect(mockReset).toHaveBeenCalled())
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it('rejects from onSave when the patch service rejects, and does NOT show success', async () => {
    const user = userEvent.setup()
    const error = new Error('500')
    mockPatch.mockRejectedValueOnce(error)

    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    await user.click(screen.getByText('stub-save-throwing'))

    await waitFor(() => expect(mockPatch).toHaveBeenCalled())
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(screen.getByTestId('mjml-editor-overlay-stub')).toBeInTheDocument()
  })

  it('does NOT show the FR55 warning when the patch rejects, even with missing tokens (D1)', async () => {
    const user = userEvent.setup()
    mockPatch.mockRejectedValueOnce(new Error('500'))

    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    await user.click(screen.getByText('stub-save-missing-throwing'))

    await waitFor(() => expect(mockPatch).toHaveBeenCalled())
    // D1 (audit toasts 2026-06-07) — pas de warning quand rien n'a été persisté :
    // il affirmerait un enregistrement inexistant et doublerait l'erreur overlay.
    expect(toastMocks.warning).not.toHaveBeenCalled()
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  it('closes the overlay without API calls when stub-cancel is clicked', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    expect(screen.getByTestId('mjml-editor-overlay-stub')).toBeInTheDocument()

    await user.click(screen.getByText('stub-cancel'))

    await waitFor(() =>
      expect(screen.queryByTestId('mjml-editor-overlay-stub')).toBeNull(),
    )
    expect(mockPatch).not.toHaveBeenCalled()
    expect(mockReset).not.toHaveBeenCalled()
  })

  it("disables the 'Personnaliser' CTA while a patch mutation is pending (AC9)", async () => {
    const user = userEvent.setup()
    let resolvePatch: (dto: EventEmailTemplate) => void = () => {}
    mockPatch.mockImplementation(
      () =>
        new Promise<EventEmailTemplate>((resolve) => {
          resolvePatch = resolve
        }),
    )

    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    await user.click(screen.getByText('stub-save'))

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1))

    const primaryCta = screen.getByTestId('event-invitation-open-editor-btn')
    await waitFor(() => expect(primaryCta).toBeDisabled())

    await act(async () => {
      resolvePatch({
        ...customDto,
        bodyMjml:
          '<mj-section><mj-text>{{magic_link}} {{expiration_date}}</mj-text></mj-section>',
      })
    })
  })

  it("passe le nom de l'événement comme title à l'overlay", async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByTestId('event-invitation-open-editor-btn'))
    expect(screen.getByTestId('overlay-title')).toHaveTextContent('Forum des assos')
  })

  // === Refus des appareils qui ne pourront jamais afficher l'éditeur ===

  it("garde le CTA sur un écran capable, sans explication de repli", async () => {
    renderPanel()

    expect(
      await screen.findByTestId('event-invitation-open-editor-btn'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('email-editor-screen-requirement')).toBeNull()
  })

  it("retire le CTA et explique, sur un écran incapable — aperçu et badge restent", async () => {
    setTestScreen(393, 852)

    renderPanel()

    expect(
      await screen.findByTestId('email-editor-screen-requirement'),
    ).toHaveTextContent(/quelle que soit son orientation/i)
    expect(screen.queryByTestId('event-invitation-open-editor-btn')).toBeNull()
    expect(
      screen.getByTestId('event-invitation-preview-iframe'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('event-invitation-inheritance-badge'),
    ).toBeInTheDocument()
  })
})
