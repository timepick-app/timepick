import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MjmlEditorOverlay } from '../MjmlEditorOverlay'
import { initEmailEditor } from '../grapesConfig'
import { SYSTEM_EDIT_INTRO_CLASS, SYSTEM_EDIT_SIG_CLASS } from '../systemCanvas'
import { makeDefaultResolvedShell } from './_resolvedShellFactory'

// ============================================================================
// MOCKS
// ============================================================================

// Programmable editor stub: tests mutate `currentBody` / `currentHeader` /
// `currentFooter` / `currentMjBodyAttrs` / `currentCardAttrs` pour simuler des
// éditions, puis invoquent `registeredOnUpdate?.()`. La structure complète
// (header, mj-wrapper carte content-wrapper, BODY:START/END, footer) est exigée
// par `extractShellSections` + `isShellMarkersIntact` dans l'orchestrateur save
// (Lot 2). `null` pour currentMjBodyAttrs ⇒ `<mj-body>` nu (extraction →
// défauts hardcodés #ffffff/0/0).
let currentBody = ''
let currentHeader =
  '<mj-section><mj-column><mj-text>HEADER</mj-text></mj-column></mj-section>'
let currentFooter =
  '<mj-section><mj-column><mj-text>FOOTER</mj-text></mj-column></mj-section>'
let currentMjBodyAttrs: {
  backgroundColor?: string
  paddingTop?: string
  paddingBottom?: string
} | null = null
let currentCardAttrs = 'background-color="#ffffff"'
// L3a (système) — zones texte programmables. Les tests mutent
// `currentZones[cls]` puis invoquent `registeredOnUpdate?.()` ; le stub
// `editor.getWrapper().find(...)` les renvoie avec `getInnerHTML()` (cf. systemCanvas).
let currentZones: Record<string, string | undefined> = {}
let registeredOnUpdate: (() => void) | undefined
let registeredOnLockedShellSelection:
  | ((payload: { partKind: 'header' | 'footer' } | null) => void)
  | undefined
let identityProps: IdentityMenuStubProps | null = null
let testSendProps: TestSendMenuStubProps | null = null
let capturedInitOpts: { constrainedEditableZoneClasses?: readonly string[] } = {}
let capturedInitialMjml: string | null = null
const brandSaveHandlerMock = vi.fn().mockResolvedValue({ status: 'ok' })

interface IdentityMenuStubProps {
  ownerKind?: string
  ownerId?: string
  onDirtyChange?: (dirty: boolean) => void
  onPreviewChange?: (overrides: Record<string, unknown>) => void
  registerSaveHandler?: (
    handler: (() => Promise<{ status: 'ok' | 'ko' | 'skip' }>) | null,
  ) => void
}

interface TestSendMenuStubProps {
  templateKey?: string
  ownerKind?: string
  ownerId?: string
  disabled?: boolean
}

function bodyToMjml(body: string): string {
  const attrs = currentMjBodyAttrs
    ? ` background-color="${currentMjBodyAttrs.backgroundColor ?? '#ffffff'}" padding-top="${currentMjBodyAttrs.paddingTop ?? '0'}" padding-bottom="${currentMjBodyAttrs.paddingBottom ?? '0'}"`
    : ''
  return `<mjml><mj-body${attrs}>${currentHeader}<mj-wrapper ${currentCardAttrs} css-class="locked-card" data-part-kind="content-wrapper"><!-- BODY:START -->\n${body}\n<!-- BODY:END --></mj-wrapper>${currentFooter}</mj-body></mjml>`
}

// Miroir GrapesJS `editor.getWrapper().find('[css-class~="cls"]')` — renvoie des
// composants dont `getInnerHTML()` reflète `currentZones[cls]`.
function systemFind(selector: string): Array<{ getInnerHTML: () => string }> {
  const m = /\[css-class~="([^"]+)"\]/.exec(selector)
  if (!m) return []
  const html = currentZones[m[1]]
  if (html === undefined) return []
  return [{ getInnerHTML: () => html }]
}

const editorStub = {
  editor: { getWrapper: () => ({ find: systemFind }) } as unknown,
  getMjml: vi.fn(() => bodyToMjml(currentBody)),
  setMjmlSilently: vi.fn((mjml: string) => {
    // Mirror behavior: tests can read back what was set.
    currentBody = mjml
  }),
  destroy: vi.fn(),
}

vi.mock('../grapesConfig', () => ({
  initEmailEditor: vi.fn(
    (
      _container: HTMLElement,
      _initialMjml: string,
      opts: {
        onEditorUpdate?: () => void
        onLockedShellSelection?: (
          payload: { partKind: 'header' | 'footer' } | null,
        ) => void
        constrainedEditableZoneClasses?: readonly string[]
      },
    ) => {
      registeredOnUpdate = opts.onEditorUpdate
      registeredOnLockedShellSelection = opts.onLockedShellSelection
      capturedInitOpts = opts
      capturedInitialMjml = _initialMjml
      return editorStub
    },
  ),
}))

// Lot 2 — l'inner consomme useUpsertShellPart + useDeleteShellPart (mode raw,
// skipInvalidate) dans l'orchestrateur handleSave. Les mocks exposent un
// `mutateAsync` programmable que les tests configurent par cas.
const upsertMutateAsync = vi.fn().mockResolvedValue(undefined)
const deleteMutateAsync = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/useUpsertShellPart', () => ({
  useUpsertShellPart: () => ({ mutateAsync: upsertMutateAsync, isPending: false }),
}))

vi.mock('@/hooks/useDeleteShellPart', () => ({
  useDeleteShellPart: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}))

const brandSettings = {
  logoUrl: null,
  primaryColor: '#18181b',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
  updatedAt: '2026-05-01T00:00:00Z',
}

vi.mock('@/hooks/useEmailBrandSettings', () => ({
  useEmailBrandSettings: () => ({
    data: brandSettings,
    isLoading: false,
    error: null,
  }),
}))

let editorContextValue: {
  data: {
    header: { contentMjml: string; origin: string }
    body: { contentMjml: string; origin: string }
    footer: { contentMjml: string; origin: string }
    // ⚠️ PIÈGE mocks editor-context — toCanvasShell lit resolved.mjBody.attrs
    // et resolved.contentWrapper. Sans ces champs, l'init crash (TypeError).
    mjBody: {
      attrs: { backgroundColor: string; paddingTop: string; paddingBottom: string }
      origin: string
    }
    contentWrapper: { contentMjml: string; origin: string } | null
  } | undefined
  isLoading: boolean
  error: unknown
  refetch?: () => Promise<{ data: typeof editorContextValue.data }>
} = { data: undefined, isLoading: false, error: null }

vi.mock('@/hooks/useEditorContext', () => ({
  useEditorContext: () => ({
    // Default refetch reads from the live editorContextValue so tests that
    // don't set a spy still get a working (no-op) refetch.
    refetch: () => Promise.resolve({ data: editorContextValue.data }),
    ...editorContextValue,
  }),
}))

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
}

vi.mock('sonner', () => ({
  toast: toastMock,
}))

vi.mock('../EmailIdentityMenu', () => ({
  EmailIdentityMenu: (props: IdentityMenuStubProps) => {
    identityProps = props
    // Immediately register the brand save handler so Inner stores it before handleSave runs.
    props.registerSaveHandler?.(brandSaveHandlerMock)
    return (
      <div data-testid="email-identity-menu-stub">
        <button
          data-testid="stub-identity-dirty"
          onClick={() => props.onDirtyChange?.(true)}
        />
        <button
          data-testid="stub-identity-preview"
          onClick={() => props.onPreviewChange?.({ primaryColor: '#ff0000' })}
        />
      </div>
    )
  },
}))

vi.mock('../EmailTestSendMenu', () => ({
  EmailTestSendMenu: (props: TestSendMenuStubProps) => {
    testSendProps = props
    return (
      <div data-testid="email-test-send-stub" data-disabled={String(!!props.disabled)} />
    )
  },
}))

// ============================================================================
// TEST UTILITIES
// ============================================================================

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>
  )
}

function makeProps(overrides: Partial<Parameters<typeof MjmlEditorOverlay>[0]> = {}) {
  return {
    open: true,
    templateKey: 'invitation',
    initialBodyMjml: '<mj-section><mj-text>Initial</mj-text></mj-section>',
    defaultBodyMjml: '<mj-section><mj-text>Default</mj-text></mj-section>',
    variables: ['event_name', 'magic_link'] as readonly string[],
    onSave: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    ...overrides,
  }
}

async function renderAndWaitForInner(props: Parameters<typeof MjmlEditorOverlay>[0]) {
  const result = render(<MjmlEditorOverlay {...props} />, { wrapper: Wrapper })
  await screen.findByTestId('mjml-editor-inner')
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  currentZones = {}
  currentBody = ''
  currentHeader =
    '<mj-section><mj-column><mj-text>HEADER</mj-text></mj-column></mj-section>'
  currentFooter =
    '<mj-section><mj-column><mj-text>FOOTER</mj-text></mj-column></mj-section>'
  currentMjBodyAttrs = null
  currentCardAttrs = 'background-color="#ffffff"'
  registeredOnUpdate = undefined
  registeredOnLockedShellSelection = undefined
  editorContextValue = { data: undefined, isLoading: false, error: null }
  capturedInitOpts = {}
  capturedInitialMjml = null
  upsertMutateAsync.mockReset().mockResolvedValue(undefined)
  deleteMutateAsync.mockReset().mockResolvedValue(undefined)
})

// ============================================================================
// TESTS
// ============================================================================

describe('MjmlEditorOverlay — outer behavior', () => {
  it('does not render the editor when open=false', () => {
    render(<MjmlEditorOverlay {...makeProps({ open: false })} />, { wrapper: Wrapper })
    expect(screen.queryByTestId('mjml-editor-inner')).toBeNull()
    expect(screen.queryByTestId('mjml-editor-overlay')).toBeNull()
  })

  it('renders the editor when open=true after lazy-load resolves', async () => {
    render(<MjmlEditorOverlay {...makeProps({ open: true })} />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(screen.getByTestId('mjml-editor-overlay')).toBeInTheDocument()
    })
    await screen.findByTestId('mjml-editor-inner')
  })
})

describe('MjmlEditorOverlay — Save flow', () => {
  it('Enregistrer button is disabled when not dirty', async () => {
    const props = makeProps({ initialBodyMjml: 'INITIAL' })
    currentBody = 'INITIAL'
    await renderAndWaitForInner(props)
    expect(screen.getByTestId('mjml-editor-save-btn')).toBeDisabled()
  })

  it('Enregistrer becomes enabled and calls onSave with extracted body when dirty', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const props = makeProps({ initialBodyMjml: 'INITIAL', onSave })
    currentBody = 'INITIAL'
    const user = userEvent.setup()
    await renderAndWaitForInner(props)

    // Simulate an edit: editor's body changes, then update event fires.
    currentBody = 'EDITED'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())

    await user.click(saveBtn)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('EDITED')
    })
  })

  it('resets dirty state after a successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const props = makeProps({ initialBodyMjml: 'INITIAL', onSave })
    currentBody = 'INITIAL'
    const user = userEvent.setup()
    await renderAndWaitForInner(props)

    currentBody = 'EDITED'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(saveBtn).toBeDisabled()
    })
  })
})

describe('MjmlEditorOverlay — Cancel flow', () => {
  it('Fermer button calls onCancel directly when not dirty', async () => {
    const onCancel = vi.fn()
    const props = makeProps({ onCancel })
    const user = userEvent.setup()
    await renderAndWaitForInner(props)

    await user.click(screen.getByTestId('mjml-editor-cancel-btn'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('mjml-editor-close-confirm')).toBeNull()
  })

  it('Fermer button shows confirmation dialog when dirty', async () => {
    const onCancel = vi.fn()
    const props = makeProps({ initialBodyMjml: 'INITIAL', onCancel })
    currentBody = 'INITIAL'
    const user = userEvent.setup()
    await renderAndWaitForInner(props)

    currentBody = 'EDITED'
    act(() => {
      registeredOnUpdate?.()
    })

    await user.click(screen.getByTestId('mjml-editor-cancel-btn'))

    await screen.findByTestId('mjml-editor-close-confirm')
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(screen.getByText('Quitter'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('MjmlEditorOverlay — Reset flow', () => {
  it('Restaurer button shows confirmation, then calls onReset on confirm', async () => {
    const refetchMock = vi.fn()
    editorContextValue = {
      data: makeDefaultResolvedShell(),
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }
    refetchMock.mockResolvedValue({ data: editorContextValue.data })
    const onReset = vi.fn().mockResolvedValue(undefined)
    const props = makeProps({ onReset, ownerKind: 'event', ownerId: 'evt-1' })
    const user = userEvent.setup()
    await renderAndWaitForInner(props)

    await user.click(screen.getByTestId('mjml-editor-reset-btn'))

    await screen.findByTestId('mjml-editor-reset-confirm')
    expect(onReset).not.toHaveBeenCalled()

    await user.click(screen.getByText('Restaurer'))

    await waitFor(() => {
      expect(onReset).toHaveBeenCalledTimes(1)
      // Vérifie que la coque est re-dérivée avec le contexte frais post-reset.
      expect(refetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('GAP-2 — canvas re-dérivé avec le contexte FRAIS (FRESH présent, STALE absent)', async () => {
    // Contexte PÉRIMÉ capturé dans la closure : header event avec marqueur distinctif.
    const staleData = makeDefaultResolvedShell({
      header: {
        contentMjml:
          '<mj-section><mj-column><mj-text>STALE-EVENT-HEADER</mj-text></mj-column></mj-section>',
        origin: 'event',
      },
      body: {
        contentMjml: '<mj-section><mj-column></mj-column></mj-section>',
        origin: 'event',
      },
    })
    // Contexte FRAIS renvoyé par refetch après reset : header template re-résolu.
    const freshData = makeDefaultResolvedShell({
      header: {
        contentMjml:
          '<mj-section><mj-column><mj-text>FRESH-TPL-HEADER</mj-text></mj-column></mj-section>',
        origin: 'template',
      },
      body: {
        contentMjml: '<mj-section><mj-column></mj-column></mj-section>',
        origin: 'event',
      },
    })

    const refetchMock = vi.fn().mockResolvedValue({ data: freshData })
    editorContextValue = {
      data: staleData,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    }

    const onReset = vi.fn().mockResolvedValue(undefined)
    const props = makeProps({ onReset, ownerKind: 'event', ownerId: 'evt-1' })
    const user = userEvent.setup()
    await renderAndWaitForInner(props)

    await user.click(screen.getByTestId('mjml-editor-reset-btn'))
    await screen.findByTestId('mjml-editor-reset-confirm')
    await user.click(screen.getByText('Restaurer'))

    // Attend que le canvas soit re-dérivé avec le contexte frais.
    await waitFor(() => expect(editorStub.setMjmlSilently).toHaveBeenCalled())
    const payload = editorStub.setMjmlSilently.mock.calls.at(-1)![0] as string
    // (a) Canvas re-wrappé avec les données fraîches (header template re-résolu).
    expect(payload).toContain('FRESH-TPL-HEADER')
    // (b) Données périmées (header event) absentes du canvas re-dérivé.
    expect(payload).not.toContain('STALE-EVENT-HEADER')
  })

  it('onReset rejette → un SEUL toast.error, message non cryptique', async () => {
    editorContextValue = {
      data: makeDefaultResolvedShell(),
      isLoading: false,
      error: null,
    }
    const onReset = vi.fn().mockRejectedValue(new Error('boom'))
    const props = makeProps({ ownerKind: 'event', ownerId: 'evt-1', onReset })
    const user = userEvent.setup()
    await renderAndWaitForInner(props)

    await user.click(screen.getByTestId('mjml-editor-reset-btn'))
    await screen.findByTestId('mjml-editor-reset-confirm')
    await user.click(screen.getByText('Restaurer'))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1))
    expect(toastMock.error.mock.calls[0]?.[0]).not.toContain('reset-failed')
  })
})

describe('MjmlEditorOverlay — gating capability : reset rendu ssi onReset câblé', () => {
  beforeEach(() => {
    editorContextValue = {
      data: makeDefaultResolvedShell(),
      isLoading: false,
      error: null,
    }
  })

  it("(a) template SANS onReset — bouton reset et dialog non rendus", async () => {
    await renderAndWaitForInner(makeProps({ ownerKind: 'template', ownerId: 'invitation' }))
    // Garantit que l'inner est monté (save-btn toujours présent dans tous les modes)
    expect(screen.getByTestId('mjml-editor-save-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('mjml-editor-reset-btn')).toBeNull()
    expect(screen.queryByTestId('mjml-editor-reset-confirm')).toBeNull()
  })

  it("(b) template AVEC onReset — bouton reset rendu (sémantique capability)", async () => {
    await renderAndWaitForInner(makeProps({ ownerKind: 'template', ownerId: 'invitation', onReset: vi.fn().mockResolvedValue(undefined) }))
    expect(screen.getByTestId('mjml-editor-reset-btn')).toBeInTheDocument()
  })

  it("(c) mode système — bouton reset non rendu", async () => {
    editorContextValue = systemContext
    await renderAndWaitForInner(makeSystemProps())
    // Garantit que l'inner est monté (save-btn toujours présent dans tous les modes)
    expect(screen.getByTestId('mjml-editor-save-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('mjml-editor-reset-btn')).toBeNull()
  })
})

describe('MjmlEditorOverlay — dirty state tracking', () => {
  it('starts in non-dirty state when open', async () => {
    const props = makeProps({ initialBodyMjml: 'INITIAL' })
    currentBody = 'INITIAL'
    await renderAndWaitForInner(props)
    expect(screen.getByTestId('mjml-editor-save-btn')).toBeDisabled()
  })

  it('flips to dirty when editor reports an update with a different body', async () => {
    const props = makeProps({ initialBodyMjml: 'INITIAL' })
    currentBody = 'INITIAL'
    await renderAndWaitForInner(props)

    expect(screen.getByTestId('mjml-editor-save-btn')).toBeDisabled()

    currentBody = 'EDITED-CONTENT'
    act(() => {
      registeredOnUpdate?.()
    })

    await waitFor(() => {
      expect(screen.getByTestId('mjml-editor-save-btn')).not.toBeDisabled()
    })
  })

  it('stays clean when editor reports an update with identical body', async () => {
    const props = makeProps({ initialBodyMjml: 'IDENTICAL' })
    currentBody = 'IDENTICAL'
    await renderAndWaitForInner(props)

    act(() => {
      registeredOnUpdate?.()
    })

    expect(screen.getByTestId('mjml-editor-save-btn')).toBeDisabled()
  })

  it('preserves dirty state and toasts when onSave rejects (AC9)', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Network down'))
    const props = makeProps({ initialBodyMjml: 'INITIAL', onSave })
    currentBody = 'INITIAL'
    const user = userEvent.setup()
    await renderAndWaitForInner(props)

    currentBody = 'EDITED'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled()
    })
    expect(saveBtn).not.toBeDisabled()
  })
})

describe('MjmlEditorOverlay — templateKey wiring (AC1 / M3 fix)', () => {
  it('exposes templateKey as data-template-key on the inner root', async () => {
    const props = makeProps({ templateKey: 'invitation' })
    await renderAndWaitForInner(props)
    const inner = screen.getByTestId('mjml-editor-inner')
    expect(inner.getAttribute('data-template-key')).toBe('invitation')
  })
})

describe('MjmlEditorOverlay — Story 26-2 ownerKind/ownerId plumbing (AC7)', () => {
  it('renders the editor without ownerKind/ownerId (backward compat — editor context skipped)', async () => {
    editorContextValue = { data: undefined, isLoading: false, error: null }
    await renderAndWaitForInner(makeProps())
    expect(screen.getByTestId('mjml-editor-inner')).toBeInTheDocument()
  })

  it('blocks editor init while editor context is loading (when ownerKind/ownerId are provided)', async () => {
    editorContextValue = { data: undefined, isLoading: true, error: null }
    render(
      <MjmlEditorOverlay
        {...makeProps({ ownerKind: 'event', ownerId: 'evt-1' })}
      />,
      { wrapper: Wrapper },
    )
    // P11 — assert positively that the loading state is rendered AND that
    // the editor init path was not invoked. The previous form only checked
    // the absence of `mjml-editor-inner`, which would also pass if Suspense
    // had not resolved yet.
    await screen.findByTestId('mjml-editor-context-loading')
    expect(vi.mocked(initEmailEditor)).not.toHaveBeenCalled()
    expect(screen.queryByTestId('mjml-editor-inner')).toBeNull()
  })

  it('surfaces an error message when the editor context fetch fails', async () => {
    editorContextValue = { data: undefined, isLoading: false, error: new Error('boom') }
    render(
      <MjmlEditorOverlay
        {...makeProps({ ownerKind: 'event', ownerId: 'evt-1' })}
      />,
      { wrapper: Wrapper },
    )
    await screen.findByTestId('mjml-editor-context-error')
  })
})

describe('MjmlEditorOverlay — Story 26-2 LockedShellInfoPanel routing (P4 + P12)', () => {
  const buildContext = (overrides?: {
    headerOrigin?: 'template' | 'brand' | 'hardcoded' | 'event'
    footerOrigin?: 'template' | 'brand' | 'hardcoded' | 'event'
  }) => {
    // Override shallow au niveau racine : un block entier (header/footer) n'est
    // remplacé que si une origin explicite est fournie. Sinon → défaut usine
    // (header origin 'template', footer origin 'brand' — identiques au défaut).
    const shell: Parameters<typeof makeDefaultResolvedShell>[0] = {}
    const ho = overrides?.headerOrigin
    if (ho) {
      shell.header = { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: ho }
    }
    const fo = overrides?.footerOrigin
    if (fo) {
      shell.footer = { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: fo }
    }
    return {
      data: makeDefaultResolvedShell(shell),
      isLoading: false,
      error: null,
    }
  }

  it('mounts the inheritance panel when origin differs from ownerKind', async () => {
    editorContextValue = buildContext({ headerOrigin: 'template' })
    await renderAndWaitForInner(
      makeProps({ ownerKind: 'event', ownerId: 'evt-1' }),
    )

    act(() => {
      registeredOnLockedShellSelection?.({ partKind: 'header' })
    })

    await waitFor(() => {
      expect(
        screen.getByTestId('mjml-editor-locked-panel-overlay'),
      ).toBeInTheDocument()
    })
  })

  it('does NOT mount the inheritance panel when origin matches ownerKind (P12 gate)', async () => {
    editorContextValue = buildContext({ headerOrigin: 'brand' })
    await renderAndWaitForInner(
      makeProps({ ownerKind: 'brand', ownerId: 'brand' }),
    )

    act(() => {
      registeredOnLockedShellSelection?.({ partKind: 'header' })
    })

    // After the selection event, the panel must not appear — editing brand
    // and clicking a header whose origin IS brand means the user is already
    // at the right scope.
    await waitFor(() => {
      expect(
        screen.queryByTestId('mjml-editor-locked-panel-overlay'),
      ).toBeNull()
    })
  })

  it('dismisses the panel when a click outside any locked-shell signals null (P4)', async () => {
    editorContextValue = buildContext({ headerOrigin: 'template' })
    await renderAndWaitForInner(
      makeProps({ ownerKind: 'event', ownerId: 'evt-1' }),
    )

    act(() => {
      registeredOnLockedShellSelection?.({ partKind: 'header' })
    })
    await waitFor(() => {
      expect(
        screen.getByTestId('mjml-editor-locked-panel-overlay'),
      ).toBeInTheDocument()
    })

    act(() => {
      registeredOnLockedShellSelection?.(null)
    })

    await waitFor(() => {
      expect(
        screen.queryByTestId('mjml-editor-locked-panel-overlay'),
      ).toBeNull()
    })
  })
})

describe('MjmlEditorOverlay — StructuralBadge appears on selection, not permanently (Story 26-2 fix)', () => {
  const buildContext = () => ({
    data: makeDefaultResolvedShell({
      header: { contentMjml: '<mj-section></mj-section>', origin: 'template' },
      body: { contentMjml: '<mj-section></mj-section>', origin: 'template' },
      footer: { contentMjml: '<mj-section></mj-section>', origin: 'brand' },
    }),
    isLoading: false,
    error: null,
  })

  it('does NOT render any StructuralBadge before any selection (no permanent badges)', async () => {
    editorContextValue = buildContext()
    await renderAndWaitForInner(makeProps({ ownerKind: 'event', ownerId: 'evt-1' }))
    expect(screen.queryByTestId('structural-badge-header')).toBeNull()
    expect(screen.queryByTestId('structural-badge-body')).toBeNull()
    expect(screen.queryByTestId('structural-badge-footer')).toBeNull()
  })

  it('renders the "En-tête" StructuralBadge when the header is selected', async () => {
    editorContextValue = buildContext()
    await renderAndWaitForInner(makeProps({ ownerKind: 'event', ownerId: 'evt-1' }))

    act(() => {
      registeredOnLockedShellSelection?.({ partKind: 'header' })
    })

    await waitFor(() => {
      expect(screen.getByTestId('structural-badge-header')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('structural-badge-footer')).toBeNull()
  })

  it('renders the "Pied" StructuralBadge when the footer is selected', async () => {
    editorContextValue = buildContext()
    await renderAndWaitForInner(makeProps({ ownerKind: 'event', ownerId: 'evt-1' }))

    act(() => {
      registeredOnLockedShellSelection?.({ partKind: 'footer' })
    })

    await waitFor(() => {
      expect(screen.getByTestId('structural-badge-footer')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('structural-badge-header')).toBeNull()
  })

  it('removes the StructuralBadge when the selection is dismissed (click outside shell)', async () => {
    editorContextValue = buildContext()
    await renderAndWaitForInner(makeProps({ ownerKind: 'event', ownerId: 'evt-1' }))

    act(() => {
      registeredOnLockedShellSelection?.({ partKind: 'header' })
    })
    await waitFor(() => {
      expect(screen.getByTestId('structural-badge-header')).toBeInTheDocument()
    })

    act(() => {
      registeredOnLockedShellSelection?.(null)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('structural-badge-header')).toBeNull()
    })
  })
})

// ============================================================================
// L3a (D5/D6) — mode système contraint : rendu, save intro/sig, gate FR55.
// Greffe minimale (pas d'orchestrateur shell-parts). Le stub editor.getWrapper()
// .find() renvoie les zones depuis currentZones (cf. systemFind ci-dessus).
// ============================================================================

function makeSystemProps(
  overrides: Partial<Parameters<typeof MjmlEditorOverlay>[0]> = {},
) {
  return {
    open: true,
    templateKey: 'magic_link_login',
    variables: ['magic_link', 'expiration_date'] as readonly string[],
    onCancel: vi.fn(),
    ownerKind: 'template' as const,
    ownerId: 'magic_link_login',
    mode: 'system' as const,
    systemIntroText: 'Bonjour {{user_first_name}},',
    systemSignatureText: 'Lien valable jusqu’au {{expiration_date}}.',
    isCustom: true,
    onSaveSystem: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// Contexte système complet (mjBody/contentWrapper requis par toCanvasShell).
const systemContext = {
  data: makeDefaultResolvedShell({
    body: { contentMjml: '<mj-section></mj-section>', origin: 'template' },
    footer: { contentMjml: '<mj-section></mj-section>', origin: 'brand' },
  }),
  isLoading: false,
  error: null,
}

describe('MjmlEditorOverlay — mode système contraint (L3a)', () => {
  it("monte l'éditeur en mode système sans crash", async () => {
    editorContextValue = systemContext
    await renderAndWaitForInner(makeSystemProps())
    expect(screen.getByTestId('mjml-editor-inner')).toHaveAttribute(
      'data-template-key',
      'magic_link_login',
    )
  })

  it("édition d'une zone → dirty → Enregistrer appelle onSaveSystem avec les zones extraites", async () => {
    editorContextValue = systemContext
    const onSaveSystem = vi.fn().mockResolvedValue(undefined)
    await renderAndWaitForInner(makeSystemProps({ onSaveSystem }))

    // Simule l'édition des 2 zones puis déclenche le dirty tracker.
    currentZones[SYSTEM_EDIT_INTRO_CLASS] = 'Nouvelle accroche'
    currentZones[SYSTEM_EDIT_SIG_CLASS] = 'Expire le {{expiration_date}}'
    act(() => registeredOnUpdate?.())

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await userEvent.click(saveBtn)

    await waitFor(() => expect(onSaveSystem).toHaveBeenCalledTimes(1))
    expect(onSaveSystem).toHaveBeenCalledWith({
      introText: 'Nouvelle accroche',
      signatureText: 'Expire le {{expiration_date}}',
    })
  })

  it('gate FR55 — zone sans {{expiration_date}} bloque le save (toast erreur, pas d’onSaveSystem)', async () => {
    editorContextValue = systemContext
    const onSaveSystem = vi.fn().mockResolvedValue(undefined)
    await renderAndWaitForInner(makeSystemProps({ onSaveSystem }))

    // magic_link_login exige {{expiration_date}} (cf. SYSTEM_TEMPLATE_CRITICAL_VARIABLES).
    currentZones[SYSTEM_EDIT_INTRO_CLASS] = 'Sans variable critique'
    currentZones[SYSTEM_EDIT_SIG_CLASS] = 'Signature sans variable non plus'
    act(() => registeredOnUpdate?.())

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await userEvent.click(saveBtn)

    expect(onSaveSystem).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('expiration_date'))
  })

  it("P3 — un override brand déclenche un rebuild SYSTÈME qui préserve les zones courantes et applique le brand", async () => {
    editorContextValue = systemContext
    await renderAndWaitForInner(makeSystemProps())

    // Édits EN COURS dans les 2 zones, volontairement différents des props
    // serveur — preuve qu'on extrait le canvas et non les props (édits non perdus).
    currentZones[SYSTEM_EDIT_INTRO_CLASS] = 'Accroche éditée {{user_first_name}}'
    currentZones[SYSTEM_EDIT_SIG_CLASS] = 'Signature éditée {{expiration_date}}'

    // L'admin change la couleur de marque dans le menu Identité visuelle.
    await act(async () => {
      identityProps?.onPreviewChange?.({ primaryColor: '#abcdef' })
    })

    // Le garde `if (isSystem) return` ne court-circuite plus → rebuild déclenché.
    expect(editorStub.setMjmlSilently).toHaveBeenCalledTimes(1)
    const payload = editorStub.setMjmlSilently.mock.calls[0][0] as string

    // Recomposé via le chemin SYSTÈME : les 2 zones éditables sont présentes
    // avec leur css-class (non corrompues, toujours ciblables/éditables).
    expect(payload).toContain(`css-class="${SYSTEM_EDIT_INTRO_CLASS}"`)
    expect(payload).toContain(`css-class="${SYSTEM_EDIT_SIG_CLASS}"`)
    // Édits EN COURS préservés (extraits du canvas, pas les props serveur).
    expect(payload).toContain('Accroche éditée {{user_first_name}}')
    expect(payload).toContain('Signature éditée {{expiration_date}}')
    expect(payload).not.toContain('Bonjour {{user_first_name}},')
    // Brand effectif appliqué (couleur primaire → fond du CTA).
    expect(payload).toContain('background-color="#abcdef"')
  })

  it('B2 — mode système : initEmailEditor reçoit constrainedEditableZoneClasses (zones intro/sig)', async () => {
    editorContextValue = systemContext
    await renderAndWaitForInner(makeSystemProps())
    expect(capturedInitOpts.constrainedEditableZoneClasses).toEqual([
      SYSTEM_EDIT_INTRO_CLASS,
      SYSTEM_EDIT_SIG_CLASS,
    ])
  })

  it('B2 — mode invitation : initEmailEditor sans constrainedEditableZoneClasses (corps libre)', async () => {
    await renderAndWaitForInner(makeProps())
    expect(capturedInitOpts.constrainedEditableZoneClasses).toBeUndefined()
  })
})

describe('MjmlEditorOverlay — bouton Restaurer grisé selon isCustom', () => {
  beforeEach(() => {
    editorContextValue = {
      data: makeDefaultResolvedShell(),
      isLoading: false,
      error: null,
    }
  })

  it('isCustom=false → bouton reset désactivé', async () => {
    await renderAndWaitForInner(makeProps({ isCustom: false, ownerKind: 'event', ownerId: 'evt-1', onReset: vi.fn().mockResolvedValue(undefined) }))
    expect(screen.getByTestId('mjml-editor-reset-btn')).toBeDisabled()
  })

  it('isCustom=true → bouton reset actif', async () => {
    await renderAndWaitForInner(makeProps({ isCustom: true, ownerKind: 'event', ownerId: 'evt-1', onReset: vi.fn().mockResolvedValue(undefined) }))
    expect(screen.getByTestId('mjml-editor-reset-btn')).not.toBeDisabled()
  })
})

// ============================================================================
// Toolbar menus wiring — EmailIdentityMenu + EmailTestSendMenu
// ============================================================================

describe('toolbar menus wiring', () => {
  beforeEach(() => {
    identityProps = null
    testSendProps = null
    // Provide a resolved editor context so the (mocked) editor initializes —
    // handleSave and the live-preview effect both no-op while editorRef is null.
    editorContextValue = {
      data: makeDefaultResolvedShell(),
      isLoading: false,
      error: null,
    }
  })

  it('renders both menus in the toolbar and passes correct props to EmailTestSendMenu', async () => {
    await renderAndWaitForInner(makeProps({ ownerKind: 'template', ownerId: 'invitation' }))

    expect(screen.getByTestId('email-identity-menu-stub')).toBeInTheDocument()
    expect(screen.getByTestId('email-test-send-stub')).toBeInTheDocument()
    expect(testSendProps?.templateKey).toBe('invitation')
    expect(testSendProps?.ownerKind).toBe('template')
    expect(testSendProps?.ownerId).toBe('invitation')
    expect(identityProps?.ownerKind).toBe('template')
  })

  it('test-send disabled reflects identity dirty state', async () => {
    const user = userEvent.setup()
    await renderAndWaitForInner(makeProps({ ownerKind: 'template', ownerId: 'invitation' }))

    expect(screen.getByTestId('email-test-send-stub').getAttribute('data-disabled')).toBe('false')

    await user.click(screen.getByTestId('stub-identity-dirty'))

    await waitFor(() => {
      expect(screen.getByTestId('email-test-send-stub').getAttribute('data-disabled')).toBe('true')
    })
  })

  it('combined identity dirty enables the Save button with data-dirty="true"', async () => {
    const user = userEvent.setup()
    await renderAndWaitForInner(makeProps({ ownerKind: 'template', ownerId: 'invitation' }))

    expect(screen.getByTestId('mjml-editor-save-btn')).toBeDisabled()

    await user.click(screen.getByTestId('stub-identity-dirty'))

    await waitFor(() => {
      const saveBtn = screen.getByTestId('mjml-editor-save-btn')
      expect(saveBtn).not.toBeDisabled()
      expect(saveBtn.getAttribute('data-dirty')).toBe('true')
    })
  })

  it('master Save invokes the registered brand save handler', async () => {
    const user = userEvent.setup()
    await renderAndWaitForInner(makeProps({ ownerKind: 'template', ownerId: 'invitation' }))

    // Enable Save via identity dirty signal
    await user.click(screen.getByTestId('stub-identity-dirty'))

    const saveBtn = screen.getByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())

    await user.click(saveBtn)

    await waitFor(() => {
      expect(brandSaveHandlerMock).toHaveBeenCalledTimes(1)
    })
  })

  it('live-preview rebuild: clicking stub-identity-preview calls setMjmlSilently', async () => {
    const user = userEvent.setup()
    await renderAndWaitForInner(makeProps({ ownerKind: 'template', ownerId: 'invitation' }))

    await screen.findByTestId('email-identity-menu-stub')
    const callsBefore = editorStub.setMjmlSilently.mock.calls.length

    await user.click(screen.getByTestId('stub-identity-preview'))

    await waitFor(() => {
      expect(editorStub.setMjmlSilently.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('warns before closing when only the brand identity is dirty (P1 — no silent loss)', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    await renderAndWaitForInner(
      makeProps({ ownerKind: 'template', ownerId: 'invitation', onCancel }),
    )

    // Identity-only dirty: body/zones untouched.
    await user.click(screen.getByTestId('stub-identity-dirty'))
    await user.click(screen.getByTestId('mjml-editor-cancel-btn'))

    // The close-confirm must appear and onCancel must NOT fire (no silent discard).
    expect(await screen.findByTestId('mjml-editor-close-confirm')).toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('surfaces the brand error toast when the brand save leg fails (KO) and keeps Save enabled', async () => {
    const user = userEvent.setup()
    brandSaveHandlerMock.mockResolvedValueOnce({ status: 'ko' })
    await renderAndWaitForInner(makeProps({ ownerKind: 'template', ownerId: 'invitation' }))

    await user.click(screen.getByTestId('stub-identity-dirty'))
    const saveBtn = screen.getByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())

    await user.click(saveBtn)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "Certaines modifications n'ont pas pu être enregistrées",
      )
    })
    // Identity stays dirty (snapshot not advanced on KO) → Save remains retryable.
    expect(screen.getByTestId('mjml-editor-save-btn')).not.toBeDisabled()
  })
})


// ============================================================================
// Template-switcher (multi-modèles) — Select dans la barre d'outils + dirty-guard.
// Le wrapper intercepte onRequestSwitch : propre → transmet ; sale → confirmation.
// ============================================================================

const switcherOptions = [
  { value: 'template-invitation', label: 'Invitation' },
  { value: 'template-reset', label: 'Réinitialisation' },
  { value: 'template-magic-link', label: 'Lien magique' },
]

describe('MjmlEditorOverlay — template-switcher', () => {
  it('renders the switcher (trigger + options) when templateSwitcher is provided', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderAndWaitForInner(
      makeProps({
        templateSwitcher: {
          options: switcherOptions,
          value: 'template-invitation',
          onRequestSwitch: vi.fn(),
        },
      }),
    )
    const trigger = screen.getByTestId('mjml-editor-template-switcher')
    expect(trigger).toBeInTheDocument()

    // Ouvre le sélecteur et vérifie que toutes les options sont listées.
    await user.click(trigger)
    for (const opt of switcherOptions) {
      expect(screen.getByRole('option', { name: opt.label })).toBeInTheDocument()
    }
  })

  it('does NOT render the switcher when templateSwitcher is omitted (backward compat)', async () => {
    await renderAndWaitForInner(makeProps())
    expect(screen.queryByTestId('mjml-editor-template-switcher')).toBeNull()
  })

  it('dirty-guard: when dirty, selecting a new model opens switch-confirm; confirm calls onRequestSwitch', async () => {
    const onRequestSwitch = vi.fn()
    const props = makeProps({
      initialBodyMjml: 'INITIAL',
      templateSwitcher: {
        options: switcherOptions,
        value: 'template-invitation',
        onRequestSwitch,
      },
    })
    currentBody = 'INITIAL'
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderAndWaitForInner(props)

    // Simule une édition → dirty.
    currentBody = 'EDITED'
    act(() => {
      registeredOnUpdate?.()
    })

    // Ouvre le switcher et choisit un autre modèle.
    await user.click(screen.getByTestId('mjml-editor-template-switcher'))
    await user.click(screen.getByRole('option', { name: 'Réinitialisation' }))

    // La confirmation de bascule s'ouvre ; le callback hôte n'est PAS encore appelé.
    expect(await screen.findByTestId('mjml-editor-switch-confirm')).toBeInTheDocument()
    expect(onRequestSwitch).not.toHaveBeenCalled()

    // Confirme → le callback hôte reçoit la valeur cible.
    await user.click(screen.getByText('Quitter'))
    expect(onRequestSwitch).toHaveBeenCalledWith('template-reset')
  })

  it('clean switch: when not dirty, selecting a new model calls onRequestSwitch immediately (no confirm)', async () => {
    const onRequestSwitch = vi.fn()
    await renderAndWaitForInner(
      makeProps({
        templateSwitcher: {
          options: switcherOptions,
          value: 'template-invitation',
          onRequestSwitch,
        },
      }),
    )
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    await user.click(screen.getByTestId('mjml-editor-template-switcher'))
    await user.click(screen.getByRole('option', { name: 'Lien magique' }))

    await waitFor(() => {
      expect(onRequestSwitch).toHaveBeenCalledWith('template-magic-link')
    })
    expect(screen.queryByTestId('mjml-editor-switch-confirm')).toBeNull()
  })
})

// ============================================================================
// Lot 2 — Factories editor-context shell-parts pour la matrice I/O save.
// ============================================================================

const HEADER_RESOLVED =
  '<mj-section background-color="#000"><mj-column><mj-text>H</mj-text></mj-column></mj-section>'
const FOOTER_RESOLVED =
  '<mj-section padding="10px"><mj-column><mj-text>F</mj-text></mj-column></mj-section>'

function makeFullContext(
  headerOrigin: 'event' | 'template' | 'brand' | 'hardcoded' = 'template',
) {
  return {
    data: makeDefaultResolvedShell({
      header: { contentMjml: HEADER_RESOLVED, origin: headerOrigin },
      body: {
        contentMjml: '<mj-section><mj-column><mj-text>B</mj-text></mj-column></mj-section>',
        origin: 'event',
      },
      footer: { contentMjml: FOOTER_RESOLVED, origin: 'brand' },
      // Plan carte-éditable — carte résolue (factory blanc, brand). Requise pour
      // que le canvas émette un <mj-wrapper> (sinon isShellMarkersIntact rejette).
      contentWrapper: {
        contentMjml: '<mj-section background-color="#ffffff"></mj-section>',
        origin: 'brand',
      },
    }),
    isLoading: false,
    error: null,
  }
}

// ============================================================================
// Lot 2 — matrice I/O save orchestration (branche INVITATION uniquement).
// L'implémentation actuelle est SIMPLIFIÉE vs 5eebca2e^ : pas de legs
// shell-parts en mode système, toasts agrégés génériques (pas de matrice
// legLabelize), content-wrapper → COMMON_SHELL_OWNER (template[invitation]).
// Body extrait SANS marqueurs (extractBodyFragment strippe BODY:START/END).
// ============================================================================

describe('MjmlEditorOverlay — save orchestration (matrice I/O invitation)', () => {
  it('header seul modifié → 1 PUT shell-parts header (data-part-kind=header), aucun PATCH body', async () => {
    editorContextValue = makeFullContext('template')
    const onSave = vi.fn().mockResolvedValue(undefined)
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    // Édite uniquement le header.
    currentHeader =
      '<mj-section background-color="#ff0000"><mj-column><mj-text>NEW H</mj-text></mj-column></mj-section>'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(upsertMutateAsync).toHaveBeenCalledTimes(1)
    })
    expect(upsertMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: expect.stringContaining('data-part-kind="header"'),
      }),
    )
    expect(onSave).not.toHaveBeenCalled()
    expect(deleteMutateAsync).not.toHaveBeenCalled()
  })

  it('header + footer modifiés → 2 PUT shell-parts en parallèle, pas de PATCH body', async () => {
    editorContextValue = makeFullContext('template')
    const onSave = vi.fn().mockResolvedValue(undefined)
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    currentHeader =
      '<mj-section><mj-column><mj-text>NEW H</mj-text></mj-column></mj-section>'
    currentFooter =
      '<mj-section><mj-column><mj-text>NEW F</mj-text></mj-column></mj-section>'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(upsertMutateAsync).toHaveBeenCalledTimes(2)
    })
    expect(upsertMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ partKind: 'header' }),
    )
    expect(upsertMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ partKind: 'footer' }),
    )
    expect(onSave).not.toHaveBeenCalled()
    expect(deleteMutateAsync).not.toHaveBeenCalled()
  })

  it('header + body modifiés → 1 PUT header + onSave(body SANS marqueurs) en parallèle', async () => {
    editorContextValue = makeFullContext('template')
    const onSave = vi.fn().mockResolvedValue(undefined)
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    currentHeader =
      '<mj-section><mj-column><mj-text>NEW H</mj-text></mj-column></mj-section>'
    currentBody = 'B-EDITED'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(upsertMutateAsync).toHaveBeenCalledTimes(1)
      // Body extrait SANS marqueurs (extractBodyFragment strippe BODY:START/END).
      expect(onSave).toHaveBeenCalledWith('B-EDITED')
    })
  })

  it('header édité puis ramené au résolu cascade ET origin === ownerKind → DELETE header', async () => {
    // Phase 1 : premier save header→PUT avance l'ancre vers TEMP.
    // Phase 2 : retour canvas vers HEADER_RESOLVED (résolu cascade). Maintenant
    // ancre=TEMP (≠RESOLVED → dirty), canvas=RESOLVED → matchesCascade=true.
    // origin='template' === ownerKind='template' → route='delete'.
    editorContextValue = makeFullContext('template')
    const onSave = vi.fn().mockResolvedValue(undefined)
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    // Phase 1 — premier save header→PUT.
    const tempHeader =
      '<mj-section><mj-column><mj-text>TEMP</mj-text></mj-column></mj-section>'
    currentHeader = tempHeader
    act(() => {
      registeredOnUpdate?.()
    })
    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)
    await waitFor(() => {
      expect(upsertMutateAsync).toHaveBeenCalledTimes(1)
    })
    // Bouton retombe désactivé après l'avancée d'ancre.
    await waitFor(() => expect(saveBtn).toBeDisabled())

    // Phase 2 — ramène le canvas vers HEADER_RESOLVED (résolu cascade).
    currentHeader = HEADER_RESOLVED
    act(() => {
      registeredOnUpdate?.()
    })
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    // Preuve directe que la branche DELETE est empruntée.
    await waitFor(() => {
      expect(deleteMutateAsync).toHaveBeenCalledTimes(1)
    })
    expect(deleteMutateAsync).toHaveBeenCalledWith({
      ownerKind: 'template',
      ownerId: 'invitation',
      partKind: 'header',
    })
    // Le PUT header ne doit pas être re-déclenché par ce second save.
    expect(upsertMutateAsync).toHaveBeenCalledTimes(1)
    // Bouton retombe désactivé après succès DELETE.
    await waitFor(() => expect(saveBtn).toBeDisabled())
  })

  it('mj-body dirty → PUT /template/invitation/mj-body (contentMjml = <mj-body ...>)', async () => {
    editorContextValue = makeFullContext('template')
    const onSave = vi.fn().mockResolvedValue(undefined)
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    // Édite uniquement les attrs <mj-body> (fond + marges).
    currentMjBodyAttrs = { backgroundColor: '#ff0000', paddingTop: '10px', paddingBottom: '20px' }
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(upsertMutateAsync).toHaveBeenCalledTimes(1)
    })
    expect(upsertMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'mj-body',
        contentMjml: expect.stringContaining('<mj-body'),
      }),
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  it('content-wrapper dirty → PUT vers template/invitation/content-wrapper (COMMON_SHELL_OWNER)', async () => {
    editorContextValue = makeFullContext('template')
    const onSave = vi.fn().mockResolvedValue(undefined)
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    // Édite uniquement la carte content-wrapper (changement de fond).
    currentCardAttrs = 'background-color="#abcdef"'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(upsertMutateAsync).toHaveBeenCalledTimes(1)
    })
    // Carte → COMMON_SHELL_OWNER (template[invitation]), JAMAIS owner-spécifique.
    expect(upsertMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'content-wrapper',
      }),
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  it('échec partiel header (PUT KO) + body OK → toast générique, header reste dirty (legs OK avancent)', async () => {
    editorContextValue = makeFullContext('template')
    const onSave = vi.fn().mockResolvedValue(undefined)
    upsertMutateAsync.mockRejectedValueOnce(new Error('Network down'))
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    currentHeader =
      '<mj-section><mj-column><mj-text>NEW H</mj-text></mj-column></mj-section>'
    currentBody = 'B-EDITED'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    // Toast agrégé générique (≥1 leg shell/brand KO).
    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "Certaines modifications n'ont pas pu être enregistrées",
      )
    })
    // Body OK → onSave appelé une fois. Header KO → ancre non avancée → dirty.
    expect(onSave).toHaveBeenCalledWith('B-EDITED')
    // Le bouton reste actif (header reste dirty).
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
  })

  it('aller-retour cascade (origin !== ownerKind) → pas de mutation, dirty reset', async () => {
    // Phase 1 : header édité → PUT (canvas ≠ résolu). Ancre avance vers TEMP.
    // Phase 2 : retour canvas vers résolu. dirty (≠TEMP) + matchesCascade=true
    // + origin='brand' !== ownerKind='template' → route='skip' (aller-retour
    // vers un parent de cascade : rien à matérialiser). Tous legs skip →
    // avancement d'ancres + setDirty(false), AUCUNE mutation.
    editorContextValue = makeFullContext('brand')
    const onSave = vi.fn().mockResolvedValue(undefined)
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    // Phase 1 — édite header → PUT.
    const tempHeader =
      '<mj-section><mj-column><mj-text>TEMP</mj-text></mj-column></mj-section>'
    currentHeader = tempHeader
    act(() => {
      registeredOnUpdate?.()
    })
    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)
    await waitFor(() => {
      expect(upsertMutateAsync).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => expect(saveBtn).toBeDisabled())

    // Phase 2 — ramène le canvas vers le résolu cascade (origin='brand').
    currentHeader = HEADER_RESOLVED
    act(() => {
      registeredOnUpdate?.()
    })
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    // Aucune NOUVELLE mutation (PUT reste à 1, DELETE jamais, onSave jamais).
    await waitFor(() => expect(saveBtn).toBeDisabled())
    expect(upsertMutateAsync).toHaveBeenCalledTimes(1)
    expect(deleteMutateAsync).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('dirty-then-save → bouton désactivé après succès via avancée d’ancre (anti-régression C1)', async () => {
    editorContextValue = makeFullContext('template')
    const onSave = vi.fn().mockResolvedValue(undefined)
    currentBody = 'B-INITIAL'
    currentHeader = HEADER_RESOLVED
    currentFooter = FOOTER_RESOLVED
    const user = userEvent.setup()
    await renderAndWaitForInner(
      makeProps({
        initialBodyMjml: 'B-INITIAL',
        onSave,
        ownerKind: 'template',
        ownerId: 'invitation',
      }),
    )

    currentHeader =
      '<mj-section background-color="#00ff00"><mj-column><mj-text>NEW H</mj-text></mj-column></mj-section>'
    act(() => {
      registeredOnUpdate?.()
    })

    const saveBtn = await screen.findByTestId('mjml-editor-save-btn')
    await waitFor(() => expect(saveBtn).not.toBeDisabled())
    await user.click(saveBtn)

    // CRITICAL — le bouton doit retomber désactivé après succès, prouvant que
    // l'ancre header a été avancée et que `recomputedDirty=false`.
    await waitFor(() => {
      expect(saveBtn).toBeDisabled()
    })

    // Un second update canvas (même valeur) ne doit JAMAIS re-déclencher
    // upsertMutateAsync — preuve que le dirty tracker voit clean.
    const upsertBefore = upsertMutateAsync.mock.calls.length
    act(() => {
      registeredOnUpdate?.()
    })
    expect(saveBtn).toBeDisabled()
    expect(upsertMutateAsync.mock.calls.length).toBe(upsertBefore)
  })
})

// ============================================================================
// Lot 2 — condition d’éditabilité de la coque (data-inherited).
// En mode invitation (ownerKind=template && !isSystem), wrapBodyForEditing
// n'injecte PAS data-inherited sur header/footer (éditable). En mode système,
// header/footer portent data-inherited (verrouillé).
// ============================================================================

describe('MjmlEditorOverlay — Lot 2 condition éditabilité coque (data-inherited)', () => {
  it('mode invitation (ownerKind=template) → header/footer sans data-inherited (éditable)', async () => {
    editorContextValue = makeFullContext('template')
    await renderAndWaitForInner(
      makeProps({ ownerKind: 'template', ownerId: 'invitation' }),
    )
    // editableShell = true (template && !isSystem) → header/footer non hérités.
    expect(capturedInitialMjml).not.toContain('data-inherited')
  })

  it('mode système → header/footer avec data-inherited (verrouillé)', async () => {
    editorContextValue = systemContext
    await renderAndWaitForInner(makeSystemProps())
    // editableShell = false (isSystem) → header/footer hérités (deep-lock).
    expect(capturedInitialMjml).toContain('data-inherited')
  })
})
