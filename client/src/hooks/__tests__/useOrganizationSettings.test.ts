import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import {
  useOrganizationSettings,
  useUpdateOrganizationSettings,
  useUploadOrganizationLogo,
  useDeleteOrganizationLogo,
  ORGANIZATION_QUERY_KEY,
} from '../useOrganizationSettings'
import type { OrganizationSettings } from '../../services/organization.service'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
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

const sampleSettings: OrganizationSettings = {
  name: 'TimePick',
  logo: 'https://test.example/uploads/organization/logo.webp',
  description: 'Une organisation de test',
  homepageFacade: true,
}

describe('useOrganizationSettings hooks', () => {
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

  it('récupère les réglages via GET /admin/settings/organization', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: sampleSettings } })

    const { result } = renderHook(() => useOrganizationSettings(), { wrapper })

    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockGet).toHaveBeenCalledWith('/admin/settings/organization')
    expect(result.current.data).toEqual(sampleSettings)
  })

  it('sauvegarde via PUT et invalide les caches admin + public', async () => {
    mockPut.mockResolvedValueOnce({ data: { data: sampleSettings } })
    queryClient.setQueryData(ORGANIZATION_QUERY_KEY, { ...sampleSettings, name: 'Old' })
    queryClient.setQueryData(['public', 'organization'], { name: 'Old' })

    const { result } = renderHook(() => useUpdateOrganizationSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        name: 'TimePick',
        description: 'Une organisation de test',
        homepageFacade: true,
      })
    })

    expect(mockPut).toHaveBeenCalledWith('/admin/settings/organization', {
      name: 'TimePick',
      description: 'Une organisation de test',
      homepageFacade: true,
    })
    expect(queryClient.getQueryState(ORGANIZATION_QUERY_KEY)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(['public', 'organization'])?.isInvalidated).toBe(true)
    expect(toastSuccess).toHaveBeenCalled()
  })

  it("n'échoue pas quand la clé publique est absente du cache (no-op sûr)", async () => {
    mockPut.mockResolvedValueOnce({ data: { data: sampleSettings } })

    const { result } = renderHook(() => useUpdateOrganizationSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ name: 'TimePick' })
    })

    expect(toastError).not.toHaveBeenCalled()
  })

  it("affiche le message de repli si la sauvegarde échoue (pas le message serveur brut)", async () => {
    mockPut.mockRejectedValueOnce({ response: { data: { error: 'Nom invalide' } } })

    const { result } = renderHook(() => useUpdateOrganizationSettings(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ name: '' }).catch(() => {})
    })

    expect(toastError).toHaveBeenCalledWith(
      "L'enregistrement de l'identité de l'organisation a échoué. Vos modifications sont toujours à l'écran, réessayez."
    )
    expect(toastError.mock.calls[0][0]).not.toContain('Nom invalide')
  })

  it('téléverse le logo via POST multipart avec le champ "logo"', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { logo: 'https://test.example/logo2.webp' } } })

    const { result } = renderHook(() => useUploadOrganizationLogo(), { wrapper })
    const file = new File(['fake'], 'logo.png', { type: 'image/png' })

    await act(async () => {
      await result.current.mutateAsync(file)
    })

    expect(mockPost).toHaveBeenCalledTimes(1)
    const [url, formData, config] = mockPost.mock.calls[0]
    expect(url).toBe('/admin/settings/organization/logo')
    expect(formData).toBeInstanceOf(FormData)
    expect((formData as FormData).get('logo')).toBe(file)
    expect(config).toMatchObject({ headers: { 'Content-Type': 'multipart/form-data' } })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('supprime le logo via DELETE et invalide les caches', async () => {
    mockDelete.mockResolvedValueOnce({ data: {} })
    queryClient.setQueryData(ORGANIZATION_QUERY_KEY, sampleSettings)

    const { result } = renderHook(() => useDeleteOrganizationLogo(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync()
    })

    expect(mockDelete).toHaveBeenCalledWith('/admin/settings/organization/logo')
    expect(queryClient.getQueryState(ORGANIZATION_QUERY_KEY)?.isInvalidated).toBe(true)
    expect(toastSuccess).toHaveBeenCalled()
  })
})
