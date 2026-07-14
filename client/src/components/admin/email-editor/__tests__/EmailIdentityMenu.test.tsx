import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  EmailIdentityMenu,
  type BrandSaveHandler,
} from '../EmailIdentityMenu'
import type { EmailBrandSettings } from '@/services/email-brand-settings.service'

// Hook mocks. `useEmailBrandSettings` retourne le brand chargé (hydratation
// initiale). `usePatchEmailBrandSettings` expose `mutateAsync` parce que le
// handler interne enregistré via `registerSaveHandler` attend le PATCH avec
// `await` avant de MAJ le snapshot.
let mockBrandData: EmailBrandSettings | undefined
let mockBrandLoading = false
const mockPatchMutateAsync = vi.fn()
let mockPatchPending = false
const mockResetMutateAsync = vi.fn()
let mockResetPending = false

vi.mock('@/hooks/useEmailBrandSettings', () => ({
  useEmailBrandSettings: () => ({
    data: mockBrandData,
    isLoading: mockBrandLoading,
    error: null,
  }),
  usePatchEmailBrandSettings: () => ({
    mutateAsync: mockPatchMutateAsync,
    get isPending() {
      return mockPatchPending
    },
  }),
  useResetEmailBrandSettings: () => ({
    mutateAsync: mockResetMutateAsync,
    get isPending() {
      return mockResetPending
    },
  }),
}))

const mockApiPost = vi.fn()
vi.mock('@/services/api', () => ({
  default: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

const BRAND_FIXTURE: EmailBrandSettings = {
  logoUrl: null,
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
  updatedAt: '2026-05-23T10:00:00Z',
}

describe('EmailIdentityMenu', () => {
  beforeEach(() => {
    mockBrandData = BRAND_FIXTURE
    mockBrandLoading = false
    mockPatchPending = false
    mockResetPending = false
    mockPatchMutateAsync.mockReset()
    mockResetMutateAsync.mockReset()
    mockApiPost.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // === Asymétrie cascade — visibilité conditionnelle ===

  it('ne rend rien quand ownerKind === "event"', () => {
    const { container } = render(<EmailIdentityMenu ownerKind="event" />)
    expect(container.firstChild).toBeNull()
  })

  it('ne rend rien quand ownerKind === "brand"', () => {
    const { container } = render(<EmailIdentityMenu ownerKind="brand" />)
    expect(container.firstChild).toBeNull()
  })

  it('ne rend rien quand ownerKind est undefined', () => {
    const { container } = render(<EmailIdentityMenu ownerKind={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('rend le bouton déclencheur quand ownerKind === "template"', () => {
    render(<EmailIdentityMenu ownerKind="template" />)
    const trigger = screen.getByTestId('email-identity-menu-trigger')
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent('Identité visuelle')
  })

  // === Ouverture / fermeture du Popover ===

  it("ouvre l'infobulle au clic sur le bouton déclencheur", async () => {
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    expect(screen.queryByTestId('email-identity-menu-form')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    expect(screen.getByTestId('email-identity-menu-form')).toBeInTheDocument()
  })

  it("ferme l'infobulle à la touche Échap (sans propager au Dialog parent)", async () => {
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))
    expect(screen.getByTestId('email-identity-menu-form')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByTestId('email-identity-menu-form')).not.toBeInTheDocument()
  })

  it("ferme l'infobulle au clic outside", async () => {
    const user = userEvent.setup()
    render(
      <div>
        <div data-testid="outside-target" style={{ width: 200, height: 200 }} />
        <EmailIdentityMenu ownerKind="template" />
      </div>,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))
    expect(screen.getByTestId('email-identity-menu-form')).toBeInTheDocument()

    await user.click(screen.getByTestId('outside-target'))

    expect(screen.queryByTestId('email-identity-menu-form')).not.toBeInTheDocument()
  })

  // === Plan 4a — bouton interne supprimé ===

  it("n'affiche AUCUN bouton « Enregistrer » à l'intérieur du popover", async () => {
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    expect(
      screen.queryByTestId('email-identity-menu-save'),
    ).not.toBeInTheDocument()
  })

  // === Hydratation depuis brand settings ===

  it("affiche un skeleton tant que les brand settings ne sont pas chargés", async () => {
    mockBrandData = undefined
    mockBrandLoading = true
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))
    expect(screen.getByTestId('email-identity-menu-loading')).toBeInTheDocument()
  })

  it("hydrate les champs depuis les brand settings au premier render", async () => {
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    ) as HTMLInputElement
    expect(colorInput.value).toBe('#18181b')

    const radiusInput = screen.getByTestId(
      'email-identity-menu-radius-input',
    ) as HTMLInputElement
    expect(radiusInput.value).toBe('4')
  })

  // === Plan 4a — propagation de l'état dirty au parent ===

  it("propage onDirtyChange(false) au mount (snapshot === form)", async () => {
    const onDirtyChange = vi.fn()
    render(
      <EmailIdentityMenu ownerKind="template" onDirtyChange={onDirtyChange} />,
    )
    // Attendre l'hydratation initiale (settings → form via useEffect).
    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenCalledWith(false)
    })
  })

  it("propage onDirtyChange(true) dès la première modification valide", async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu ownerKind="template" onDirtyChange={onDirtyChange} />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')

    // Le dernier appel doit être true (édit valide). Filtrage par valeur car
    // d'autres calls (false initial) précèdent.
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it("propage onDirtyChange(false) quand le hex est invalide (édit non sauvegardable)", async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu ownerKind="template" onDirtyChange={onDirtyChange} />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#zzz')

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    expect(
      screen.getByTestId('email-identity-menu-primary-color-error'),
    ).toBeInTheDocument()
  })

  it("propage onDirtyChange(false) quand le form revient à la valeur snapshot", async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu ownerKind="template" onDirtyChange={onDirtyChange} />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    await user.clear(colorInput)
    await user.type(colorInput, '#18181b')

    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  // === Plan 4a — registerSaveHandler ===

  it("n'émet AUCUN PATCH tant que le handler de save n'est pas invoqué", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')

    // Avancer le temps bien au-delà de tout debounce hypothétique. Aucun PATCH
    // ne doit partir : la persistence est désormais déclenchée exclusivement
    // par le bouton master via le handler enregistré.
    await vi.advanceTimersByTimeAsync(500)

    expect(mockPatchMutateAsync).not.toHaveBeenCalled()
  })

  it("enregistre un handler de save asynchrone qui émet un PATCH avec le delta complet", async () => {
    const handlerRef: { current: BrandSaveHandler | null } = { current: null }
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        registerSaveHandler={(handler) => {
          handlerRef.current = handler
        }}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')

    const radiusInput = screen.getByTestId(
      'email-identity-menu-radius-input',
    ) as HTMLInputElement
    fireEvent.change(radiusInput, { target: { value: '12' } })

    // À ce stade, aucun PATCH n'a été émis (assert sécurité).
    expect(mockPatchMutateAsync).not.toHaveBeenCalled()

    // Le parent invoque le handler — c'est l'analogue du clic sur le master
    // Save du header. Le menu construit le patch et émet le PATCH brand.
    mockPatchMutateAsync.mockResolvedValueOnce({
      ...BRAND_FIXTURE,
      primaryColor: '#ff0000',
      buttonBorderRadius: 12,
    })

    expect(handlerRef.current).not.toBeNull()
    let result: { status: 'ok' | 'ko' | 'skip' } | undefined
    await act(async () => {
      result = await handlerRef.current!()
    })

    expect(mockPatchMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({
      primaryColor: '#ff0000',
      buttonBorderRadius: 12,
    })
    expect(result).toEqual({ status: 'ok' })
  })

  it("retourne status='skip' quand le handler est invoqué sans édition", async () => {
    const handlerRef: { current: BrandSaveHandler | null } = { current: null }
    render(
      <EmailIdentityMenu
        ownerKind="template"
        registerSaveHandler={(handler) => {
          handlerRef.current = handler
        }}
      />,
    )

    // Attendre que le handler soit enregistré post-hydratation.
    await waitFor(() => {
      expect(handlerRef.current).not.toBeNull()
    })

    let result: { status: 'ok' | 'ko' | 'skip' } | undefined
    await act(async () => {
      result = await handlerRef.current!()
    })

    expect(mockPatchMutateAsync).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'skip' })
  })

  it("retourne status='ko' et conserve l'override preview quand le PATCH rejette", async () => {
    const handlerRef: { current: BrandSaveHandler | null } = { current: null }
    const onPreviewChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        onPreviewChange={onPreviewChange}
        registerSaveHandler={(handler) => {
          handlerRef.current = handler
        }}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')

    mockPatchMutateAsync.mockRejectedValueOnce(new Error('boom'))
    onPreviewChange.mockClear()

    let result: { status: 'ok' | 'ko' | 'skip' } | undefined
    await act(async () => {
      result = await handlerRef.current!()
    })

    expect(result).toEqual({ status: 'ko' })
    // Sur échec : aucun rollback impératif de l'override. Le form reste dirty
    // (snapshot non MAJ), le useEffect [form] préserve le delta, et l'admin
    // peut re-tenter Save sans perdre sa sélection visuelle dans le canvas.
    //
    // Plan 4a review P12 — assertion durcie : on prouve l'absence COMPLÈTE de
    // ré-émission d'override après mockClear (pas seulement l'absence de
    // `null`). La dernière valeur valide `{ primaryColor: '#ff0000' }`
    // pré-clear reste l'état courant côté parent.
    expect(onPreviewChange).not.toHaveBeenCalled()
  })

  it("MAJ le snapshot après succès — onDirtyChange(false) après save", async () => {
    const handlerRef: { current: BrandSaveHandler | null } = { current: null }
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        onDirtyChange={onDirtyChange}
        registerSaveHandler={(handler) => {
          handlerRef.current = handler
        }}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    mockPatchMutateAsync.mockResolvedValueOnce({
      ...BRAND_FIXTURE,
      primaryColor: '#ff0000',
    })

    await act(async () => {
      await handlerRef.current!()
    })

    // Snapshot resynchronisé sur la réponse serveur → dirty redevient false.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it("appelle onSaved après un save réussi pour libérer l'override parent", async () => {
    const handlerRef: { current: BrandSaveHandler | null } = { current: null }
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        onSaved={onSaved}
        registerSaveHandler={(handler) => {
          handlerRef.current = handler
        }}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')

    mockPatchMutateAsync.mockResolvedValueOnce({
      ...BRAND_FIXTURE,
      primaryColor: '#ff0000',
    })

    await act(async () => {
      await handlerRef.current!()
    })

    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it("conserve l'état dirty quand le popover se ferme sans Save (state hissé au parent)", async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <div>
        <div data-testid="outside-target" style={{ width: 200, height: 200 }} />
        <EmailIdentityMenu
          ownerKind="template"
          onDirtyChange={onDirtyChange}
        />
      </div>,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    // Fermer le popover sans Save.
    await user.click(screen.getByTestId('outside-target'))

    // Le dirty ne doit PAS retomber à false (state vit dans le composant
    // racine, pas dans PopoverContent qui se démonte).
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    // Ré-ouvrir : le champ doit toujours afficher l'édit non sauvegardé.
    await user.click(screen.getByTestId('email-identity-menu-trigger'))
    const colorInputReopened = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    ) as HTMLInputElement
    expect(colorInputReopened.value).toBe('#ff0000')
  })

  // === Plan 3a — preview overrides côté parent (canvas live) — inchangé ===

  it("propage les overrides preview au parent à chaque modification", async () => {
    const onPreviewChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        onPreviewChange={onPreviewChange}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')

    const lastCall =
      onPreviewChange.mock.calls[onPreviewChange.mock.calls.length - 1]
    expect(lastCall[0]).toEqual({ primaryColor: '#ff0000' })
  })

  it("ne propage PAS un hex partiel/invalide à la preview canvas", async () => {
    const onPreviewChange = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        onPreviewChange={onPreviewChange}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#zzz')

    for (const [arg] of onPreviewChange.mock.calls) {
      if (arg && 'primaryColor' in arg) {
        expect(arg.primaryColor).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it("conserve l'override preview quand le popover se ferme avec un edit dirty", async () => {
    // Plan 4a — le Save est externalisé au master du header ; le close-without-
    // save n'annule plus la modif. L'override doit rester actif pour que le
    // canvas conserve sa coloration tant que le form est dirty.
    const onPreviewChange = vi.fn()
    const user = userEvent.setup()
    render(
      <div>
        <div data-testid="outside-target" style={{ width: 200, height: 200 }} />
        <EmailIdentityMenu
          ownerKind="template"
          onPreviewChange={onPreviewChange}
        />
      </div>,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const colorInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    )
    await user.clear(colorInput)
    await user.type(colorInput, '#ff0000')

    onPreviewChange.mockClear()

    await user.click(screen.getByTestId('outside-target'))

    // Aucun rollback impératif émis par le close. Le delta du form est
    // préservé par le useEffect [form] et reste poussé au parent.
    //
    // Plan 4a review P12 — assertion durcie : on prouve l'absence COMPLÈTE
    // de ré-émission après le close (pas seulement l'absence de `null`).
    // L'override `{ primaryColor: '#ff0000' }` émis avant `mockClear()`
    // reste l'état courant côté parent.
    expect(onPreviewChange).not.toHaveBeenCalled()
  })

  // === Clamp border-radius client-side (inchangé sémantiquement) ===

  it("clampe la bordure arrondie à 32 px côté client (saisie de 50)", async () => {
    const handlerRef: { current: BrandSaveHandler | null } = { current: null }
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        registerSaveHandler={(handler) => {
          handlerRef.current = handler
        }}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const radiusInput = screen.getByTestId(
      'email-identity-menu-radius-input',
    ) as HTMLInputElement
    fireEvent.change(radiusInput, { target: { value: '50' } })

    expect(radiusInput.value).toBe('32')

    mockPatchMutateAsync.mockResolvedValueOnce({
      ...BRAND_FIXTURE,
      buttonBorderRadius: 32,
    })

    await act(async () => {
      await handlerRef.current!()
    })

    expect(mockPatchMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ buttonBorderRadius: 32 })
  })

  it("accepte une saisie intermédiaire (16) sans clamp", async () => {
    const handlerRef: { current: BrandSaveHandler | null } = { current: null }
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        registerSaveHandler={(handler) => {
          handlerRef.current = handler
        }}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const radiusInput = screen.getByTestId(
      'email-identity-menu-radius-input',
    ) as HTMLInputElement
    fireEvent.change(radiusInput, { target: { value: '16' } })

    expect(radiusInput.value).toBe('16')

    mockPatchMutateAsync.mockResolvedValueOnce({
      ...BRAND_FIXTURE,
      buttonBorderRadius: 16,
    })

    await act(async () => {
      await handlerRef.current!()
    })

    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ buttonBorderRadius: 16 })
  })

  it("clampe la bordure arrondie à 0 sur valeur négative", async () => {
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const radiusInput = screen.getByTestId(
      'email-identity-menu-radius-input',
    ) as HTMLInputElement
    fireEvent.change(radiusInput, { target: { value: '-3' } })

    expect(radiusInput.value).toBe('0')
  })

  it("émet buttonTextColor dans le patch quand modifié", async () => {
    const handlerRef: { current: BrandSaveHandler | null } = { current: null }
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        registerSaveHandler={(h) => { handlerRef.current = h }}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))
    const input = screen.getByTestId('email-identity-menu-button-text-color-input')
    await user.clear(input)
    await user.type(input, '#222222')

    mockPatchMutateAsync.mockResolvedValueOnce({ ...BRAND_FIXTURE, buttonTextColor: '#222222' })
    await waitFor(() => expect(handlerRef.current).not.toBeNull())
    let result: { status: string } | undefined
    await act(async () => { result = await handlerRef.current!() })
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ buttonTextColor: '#222222' })
    expect(result).toEqual({ status: 'ok' })
  })

  it("propage buttonTextColor à la preview quand hex valide", async () => {
    const onPreviewChange = vi.fn()
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" onPreviewChange={onPreviewChange} />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))
    const input = screen.getByTestId('email-identity-menu-button-text-color-input')
    await user.clear(input)
    await user.type(input, '#222222')
    const lastCall = onPreviewChange.mock.calls[onPreviewChange.mock.calls.length - 1]
    expect(lastCall[0]).toEqual({ buttonTextColor: '#222222' })
  })

  it("ne propage PAS un buttonTextColor invalide à la preview", async () => {
    const onPreviewChange = vi.fn()
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" onPreviewChange={onPreviewChange} />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))
    const input = screen.getByTestId('email-identity-menu-button-text-color-input')
    await user.clear(input)
    await user.type(input, '#zz')
    for (const [arg] of onPreviewChange.mock.calls) {
      if (arg && 'buttonTextColor' in arg) {
        expect(arg.buttonTextColor).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it("garde les erreurs hex des deux champs indépendantes (pas de clear croisé)", async () => {
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    // Hex invalide dans le champ couleur de texte → son erreur s'affiche,
    // celle de la couleur primaire reste absente.
    const buttonTextInput = screen.getByTestId('email-identity-menu-button-text-color-input')
    await user.clear(buttonTextInput)
    await user.type(buttonTextInput, '#zz')
    expect(screen.getByTestId('email-identity-menu-button-text-color-error')).toBeInTheDocument()
    expect(screen.queryByTestId('email-identity-menu-primary-color-error')).not.toBeInTheDocument()

    // Éditer l'AUTRE champ avec un hex VALIDE ne doit PAS effacer l'erreur du
    // champ couleur de texte (états invalides indépendants — anti-régression
    // du split primaryHexInvalid / buttonTextHexInvalid).
    const primaryInput = screen.getByTestId('email-identity-menu-primary-color-input')
    await user.clear(primaryInput)
    await user.type(primaryInput, '#ff0000')
    expect(screen.queryByTestId('email-identity-menu-primary-color-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('email-identity-menu-button-text-color-error')).toBeInTheDocument()
  })

  // === L1/D2 — Réinitialiser l'identité visuelle ===

  const NON_FACTORY_BRAND: EmailBrandSettings = {
    logoUrl: 'https://test.example/uploads/emails/2026/06/logo.webp',
    primaryColor: '#ff0000',
    buttonTextColor: '#101010',
    fontFamily: 'Georgia, serif',
    buttonBorderRadius: 12,
    updatedAt: '2026-06-06T10:00:00Z',
  }

  it("affiche le bouton « Réinitialiser l'identité visuelle » dans le popover", async () => {
    mockBrandData = NON_FACTORY_BRAND
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const btn = screen.getByTestId('email-identity-reset-btn')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent("Réinitialiser l'identité visuelle")
  })

  it('désactive le bouton reset quand le brand est déjà aux valeurs d’usine', async () => {
    // BRAND_FIXTURE == valeurs factory.
    mockBrandData = BRAND_FIXTURE
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    expect(screen.getByTestId('email-identity-reset-btn')).toBeDisabled()
  })

  it('active le bouton reset quand le brand diffère des valeurs d’usine', async () => {
    mockBrandData = NON_FACTORY_BRAND
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    expect(screen.getByTestId('email-identity-reset-btn')).not.toBeDisabled()
  })

  it('ouvre le dialog de confirmation et appelle la mutation reset sur confirmation', async () => {
    mockBrandData = NON_FACTORY_BRAND
    mockResetMutateAsync.mockResolvedValue(BRAND_FIXTURE)
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    await user.click(screen.getByTestId('email-identity-reset-btn'))
    const confirm = await screen.findByTestId('email-identity-reset-confirm')
    expect(confirm.textContent ?? '').toMatch(/Réinitialiser l.identité visuelle/)
    expect(mockResetMutateAsync).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('email-identity-reset-confirm-action'))
    await waitFor(() => expect(mockResetMutateAsync).toHaveBeenCalledTimes(1))
  })

  it('ne déclenche aucun reset quand on annule le dialog', async () => {
    mockBrandData = NON_FACTORY_BRAND
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    await user.click(screen.getByTestId('email-identity-reset-btn'))
    await screen.findByTestId('email-identity-reset-confirm')
    await user.click(screen.getByText('Annuler'))

    await waitFor(() =>
      expect(screen.queryByTestId('email-identity-reset-confirm')).not.toBeInTheDocument(),
    )
    expect(mockResetMutateAsync).not.toHaveBeenCalled()
    // Garde popover : annuler le dialog ne doit PAS fermer le popover
    // (le dialog est porté hors du DOM du popover ; sans la garde
    // onInteractOutside, le clic le fermerait).
    expect(screen.getByTestId('email-identity-menu-form')).toBeInTheDocument()
  })

  it('après reset, le form local reflète les valeurs factory', async () => {
    mockBrandData = NON_FACTORY_BRAND
    mockResetMutateAsync.mockResolvedValue(BRAND_FIXTURE)
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    // État initial : brand non-factory hydraté dans le form.
    const primaryInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    ) as HTMLInputElement
    expect(primaryInput.value).toBe('#ff0000')

    await user.click(screen.getByTestId('email-identity-reset-btn'))
    await user.click(screen.getByTestId('email-identity-reset-confirm-action'))

    await waitFor(() => expect(primaryInput.value).toBe('#18181b'))
    expect(
      (
        screen.getByTestId(
          'email-identity-menu-button-text-color-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('#ffffff')
    // Le logo factory est null → le placeholder « aucun logo » réapparaît.
    expect(screen.queryByTestId('email-identity-menu-logo-preview')).not.toBeInTheDocument()
  })

  it('après reset, re-synchronise le snapshot (dirty→false) et libère l’override preview', async () => {
    mockBrandData = NON_FACTORY_BRAND
    mockResetMutateAsync.mockResolvedValue(BRAND_FIXTURE)
    const onDirtyChange = vi.fn()
    const onPreviewChange = vi.fn()
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <EmailIdentityMenu
        ownerKind="template"
        onDirtyChange={onDirtyChange}
        onPreviewChange={onPreviewChange}
        onSaved={onSaved}
      />,
    )
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    // Édition locale → form dirty + override preview actif.
    const primaryInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    ) as HTMLInputElement
    await user.clear(primaryInput)
    await user.type(primaryInput, '#abcdef')
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    await user.click(screen.getByTestId('email-identity-reset-btn'))
    await user.click(screen.getByTestId('email-identity-reset-confirm-action'))

    // snapshot re-synchronisé sur la DTO factory → plus dirty.
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
    // override preview libéré (onSaved côté parent + override recalculé null).
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onPreviewChange).toHaveBeenLastCalledWith(null)
  })

  it('sur échec du reset, conserve le form et ne libère pas l’override (catch composant)', async () => {
    mockBrandData = NON_FACTORY_BRAND
    mockResetMutateAsync.mockRejectedValue(new Error('boom'))
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" onSaved={onSaved} />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    const primaryInput = screen.getByTestId(
      'email-identity-menu-primary-color-input',
    ) as HTMLInputElement
    expect(primaryInput.value).toBe('#ff0000')

    await user.click(screen.getByTestId('email-identity-reset-btn'))
    await user.click(screen.getByTestId('email-identity-reset-confirm-action'))

    await waitFor(() => expect(mockResetMutateAsync).toHaveBeenCalledTimes(1))
    // Form inchangé (pas de faux état factory), pas de crash, onSaved non appelé.
    expect(primaryInput.value).toBe('#ff0000')
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByTestId('email-identity-menu-form')).toBeInTheDocument()
  })

  it('désactive le bouton reset et les champs pendant isResetting', async () => {
    mockBrandData = NON_FACTORY_BRAND
    mockResetPending = true
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    expect(screen.getByTestId('email-identity-reset-btn')).toBeDisabled()
    // isBusy inclut isResetting → champs gelés pendant l'appel.
    expect(screen.getByTestId('email-identity-menu-primary-color-input')).toBeDisabled()
  })

  it('Échap ferme le dialog de confirmation mais garde le popover ouvert', async () => {
    mockBrandData = NON_FACTORY_BRAND
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    await user.click(screen.getByTestId('email-identity-reset-btn'))
    await screen.findByTestId('email-identity-reset-confirm')
    await user.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByTestId('email-identity-reset-confirm')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('email-identity-menu-form')).toBeInTheDocument()
  })

  it('purge les erreurs hex résiduelles après un reset', async () => {
    mockBrandData = NON_FACTORY_BRAND
    mockResetMutateAsync.mockResolvedValue(BRAND_FIXTURE)
    const user = userEvent.setup()
    render(<EmailIdentityMenu ownerKind="template" />)
    await user.click(screen.getByTestId('email-identity-menu-trigger'))

    // Saisie hex invalide → message d'erreur affiché.
    const primaryInput = screen.getByTestId('email-identity-menu-primary-color-input')
    await user.clear(primaryInput)
    await user.type(primaryInput, '#zz')
    expect(
      screen.getByTestId('email-identity-menu-primary-color-error'),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId('email-identity-reset-btn'))
    await user.click(screen.getByTestId('email-identity-reset-confirm-action'))

    // Valeurs factory (hex valides) → l'erreur fantôme doit disparaître.
    await waitFor(() =>
      expect(
        screen.queryByTestId('email-identity-menu-primary-color-error'),
      ).not.toBeInTheDocument(),
    )
    expect(
      (screen.getByTestId('email-identity-menu-primary-color-input') as HTMLInputElement)
        .value,
    ).toBe('#18181b')
  })

})
