import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import {
  usePatchEmailBrandSettings,
  useResetEmailBrandSettings,
} from '../useEmailBrandSettings'
import type { EmailBrandSettings } from '../../services/email-brand-settings.service'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPatch = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

const factoryDto: EmailBrandSettings = {
  logoUrl: null,
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
  updatedAt: '2026-05-06T10:00:00Z',
}

const staleDto: EmailBrandSettings = {
  logoUrl: 'https://test.example/uploads/emails/2026/05/old.webp',
  primaryColor: '#ff00ff',
  buttonTextColor: '#101010',
  fontFamily: 'Georgia, serif',
  buttonBorderRadius: 16,
  updatedAt: '2026-05-01T10:00:00Z',
}

describe('usePatchEmailBrandSettings', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('invalide le cache global de preview de template après patch', async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: factoryDto } })
    queryClient.setQueryData(
      ['settings', 'email-template-preview', 'invitation'],
      { html: '<old/>', text: 'old' }
    )

    const { result } = renderHook(() => usePatchEmailBrandSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ primaryColor: '#ff0000' })
    })

    expect(
      queryClient.getQueryState([
        'settings',
        'email-template-preview',
        'invitation',
      ])?.isInvalidated
    ).toBe(true)
  })

  it('invalide les caches per-event de preview via predicate après patch', async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: factoryDto } })
    queryClient.setQueryData(
      ['admin', 'events', 'evt-123', 'email-template-preview'],
      { html: '<old/>', text: 'old' }
    )
    queryClient.setQueryData(['admin', 'events', 'evt-123', 'slots'], [])

    const { result } = renderHook(() => usePatchEmailBrandSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ primaryColor: '#ff0000' })
    })

    expect(
      queryClient.getQueryState([
        'admin',
        'events',
        'evt-123',
        'email-template-preview',
      ])?.isInvalidated
    ).toBe(true)
    expect(
      queryClient.getQueryState(['admin', 'events', 'evt-123', 'slots'])
        ?.isInvalidated
    ).toBe(false)
  })

  it("invalide aussi la clé ['settings', 'email-brand'] (no regression)", async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: factoryDto } })
    queryClient.setQueryData(['settings', 'email-brand'], staleDto)

    const { result } = renderHook(() => usePatchEmailBrandSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ primaryColor: '#ff0000' })
    })

    expect(
      queryClient.getQueryState(['settings', 'email-brand'])?.isInvalidated
    ).toBe(true)
  })

  it('émet le toast de succès après patch', async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: factoryDto } })

    const { result } = renderHook(() => usePatchEmailBrandSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ primaryColor: '#ff0000' })
    })

    expect(toastSuccess).toHaveBeenCalledWith(
      "Paramètres d'identité visuelle sauvegardés"
    )
  })

  // Plan 2 (2026-05-23) — EmailIdentityMenu emits a PATCH every 200 ms of
  // typing. Each tick would otherwise stack a toast.success — the menu opts
  // out via `silent: true` to keep the surface quiet during live editing.
  it("ne déclenche pas de toast de succès quand silent: true et écrit la DTO directement dans le cache (pas d'invalidation parasitique)", async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: factoryDto } })
    queryClient.setQueryData(['settings', 'email-brand'], staleDto)

    const { result } = renderHook(
      () => usePatchEmailBrandSettings({ silent: true }),
      { wrapper },
    )

    await act(async () => {
      await result.current.mutateAsync({ primaryColor: '#ff0000' })
    })

    expect(toastSuccess).not.toHaveBeenCalled()
    // Plan 2 (review EH1) — silent doit utiliser setQueryData(dto) plutôt
    // qu'invalidateQueries pour éviter un GET refetch entre chaque frappe
    // debouncée. Le cache contient la DTO serveur fraîche, pas de re-render
    // parasitique en boucle.
    expect(queryClient.getQueryData(['settings', 'email-brand'])).toEqual(
      factoryDto,
    )
    expect(
      queryClient.getQueryState(['settings', 'email-brand'])?.isInvalidated,
    ).toBe(false)
  })

  it("invalide editor-context après patch (silent ou non) pour propager le logo brand au header canvas", async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: factoryDto } })
    queryClient.setQueryData(
      ['admin', 'editor-context', 'template', 'invitation', 'invitation'],
      { header: { contentMjml: '<old/>' } },
    )

    const { result } = renderHook(
      () => usePatchEmailBrandSettings({ silent: true }),
      { wrapper },
    )

    await act(async () => {
      await result.current.mutateAsync({ logoUrl: 'https://x/y.png' })
    })

    // Plan 2 post-smoke (P2) — sans cette invalidation, le canvas garde
    // un header pré-PATCH parce que editorContext est cached et que
    // wrapBodyForEditing utilise resolvedShell.header.contentMjml.
    expect(
      queryClient.getQueryState([
        'admin',
        'editor-context',
        'template',
        'invitation',
        'invitation',
      ])?.isInvalidated,
    ).toBe(true)
  })

  it("propage toujours l'invalidation des previews quand silent: true", async () => {
    mockPatch.mockResolvedValueOnce({ data: { data: factoryDto } })
    queryClient.setQueryData(
      ['settings', 'email-template-preview', 'invitation'],
      { html: '<old/>', text: 'old' },
    )

    const { result } = renderHook(
      () => usePatchEmailBrandSettings({ silent: true }),
      { wrapper },
    )

    await act(async () => {
      await result.current.mutateAsync({ primaryColor: '#ff0000' })
    })

    // Plan 2 doit hériter de la propagation aux 4 aperçus per-template,
    // même en mode silent (le menu identité édite brand-wide).
    expect(
      queryClient.getQueryState([
        'settings',
        'email-template-preview',
        'invitation',
      ])?.isInvalidated,
    ).toBe(true)
  })

  it("supprime le toast d'erreur quand silent: true (Plan 4a — feedback agrégé par le master Save)", async () => {
    // Plan 4a (2026-05-24) — la sémantique du flag `silent` a été étendue
    // pour couvrir aussi les erreurs. L'éditeur d'email orchestre désormais
    // la mutation brand dans un `Promise.allSettled` master ; le toast
    // d'échec est émis par le master en mode agrégé (« Le visuel n'a pas
    // pu être enregistré, recommencez. ») plutôt que par le hook lui-même.
    // Sans cette extension, l'admin verrait 2 toasts pour un même échec.
    mockPatch.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(
      () => usePatchEmailBrandSettings({ silent: true }),
      { wrapper },
    )

    await act(async () => {
      await expect(
        result.current.mutateAsync({ primaryColor: '#zzz' }),
      ).rejects.toThrow()
    })

    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("émet bien le toast d'erreur quand silent est absent (comportement par défaut)", async () => {
    mockPatch.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() => usePatchEmailBrandSettings(), { wrapper })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ primaryColor: '#zzz' }),
      ).rejects.toThrow()
    })

    expect(toastError).toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('met à jour le cache brand après mutation buttonTextColor', async () => {
    const updatedDto = { ...factoryDto, buttonTextColor: '#000000' }
    mockPatch.mockResolvedValueOnce({ data: { data: updatedDto } })
    queryClient.setQueryData(['settings', 'email-brand'], staleDto)

    const { result } = renderHook(() => usePatchEmailBrandSettings({ silent: true }), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ buttonTextColor: '#000000' })
    })

    expect(mockPatch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ buttonTextColor: '#000000' }),
    )
    expect(queryClient.getQueryData(['settings', 'email-brand'])).toEqual(updatedDto)
  })
})

describe('useResetEmailBrandSettings', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('écrit directement la DTO factory dans le cache brand après reset', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: factoryDto } })
    queryClient.setQueryData(['settings', 'email-brand'], staleDto)

    const { result } = renderHook(() => useResetEmailBrandSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mockPost).toHaveBeenCalledWith('/admin/settings/email-brand/reset')
    expect(queryClient.getQueryData(['settings', 'email-brand'])).toEqual(factoryDto)
  })

  it('invalide previews + editor-context pour reconstruire le canvas au brand factory', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: factoryDto } })
    queryClient.setQueryData(
      ['settings', 'email-template-preview', 'invitation'],
      { html: '<old/>', text: 'old' },
    )
    queryClient.setQueryData(['admin', 'editor-context', 'template', 'invitation'], {})

    const { result } = renderHook(() => useResetEmailBrandSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(
      queryClient.getQueryState([
        'settings',
        'email-template-preview',
        'invitation',
      ])?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState([
        'admin',
        'editor-context',
        'template',
        'invitation',
      ])?.isInvalidated,
    ).toBe(true)
  })

  it('émet le toast de succès « Identité visuelle réinitialisée »', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: factoryDto } })

    const { result } = renderHook(() => useResetEmailBrandSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(toastSuccess).toHaveBeenCalledWith('Identité visuelle réinitialisée')
  })

  it('émet un toast d’erreur quand le reset échoue', async () => {
    mockPost.mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() => useResetEmailBrandSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync().catch(() => {})
    })

    expect(toastError).toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
