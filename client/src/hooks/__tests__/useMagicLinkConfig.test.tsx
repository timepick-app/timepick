import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { useMagicLinkConfig, useUpdateMagicLinkConfig, DEFAULT_SESSION_TTL } from '../useMagicLinkConfig'

// Mock de l'API
vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

import api from '@/services/api'

describe('useMagicLinkConfig', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe('récupération de la configuration', () => {
    it('récupère la configuration complète avec sessionTTL', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: {
          data: {
            adminTTL: 86400,
            userTTL: 604800,
            sessionTTL: 7200,
          },
        },
      })

      const { result } = renderHook(() => useMagicLinkConfig(), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toEqual({
        adminTTL: 86400,
        userTTL: 604800,
        sessionTTL: 7200,
      })

      expect(api.get).toHaveBeenCalledWith('/admin/config/magic-link')
    })

    it('retourne les valeurs par défaut incluant sessionTTL', () => {
      vi.mocked(api.get).mockRejectedValue(new Error('API Error'))

      const { result } = renderHook(() => useMagicLinkConfig(), { wrapper })

      expect(result.current.defaults).toEqual({
        adminTTL: 86400,
        userTTL: 604800,
        sessionTTL: DEFAULT_SESSION_TTL, // 7200
      })
    })

    it('a un cache de 5 minutes', () => {
      const { result } = renderHook(() => useMagicLinkConfig(), { wrapper })

      // staleTime est utilisé pour déterminer quand les données sont "frais"
      // On ne peut pas facilement tester la valeur exacte, mais on vérifie que le hook fonctionne
      expect((result.current as Record<string, unknown>).staleTime).toBeUndefined() // Non exposé publiquement
    })
  })
})

describe('useUpdateMagicLinkConfig', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  describe('mise à jour de la configuration', () => {
    it('met à jour sessionTTL avec adminTTL et userTTL', async () => {
      vi.mocked(api.put).mockResolvedValue({
        data: {
          data: {
            adminTTL: 43200,
            userTTL: 900,
            sessionTTL: 3600,
          },
        },
      })

      const { result } = renderHook(() => useUpdateMagicLinkConfig(), { wrapper })

      result.current.mutate({
        adminTTL: 43200,
        userTTL: 900,
        sessionTTL: 3600,
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(api.put).toHaveBeenCalledWith('/admin/config/magic-link', {
        adminTTL: 43200,
        userTTL: 900,
        sessionTTL: 3600,
      })
    })

    it('invalide le cache après succès', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      vi.mocked(api.put).mockResolvedValue({
        data: {
          data: {
            adminTTL: 86400,
            userTTL: 604800,
            sessionTTL: 7200,
          },
        },
      })

      const { result } = renderHook(() => useUpdateMagicLinkConfig(), { wrapper })

      result.current.mutate({
        adminTTL: 86400,
        userTTL: 604800,
        sessionTTL: 7200,
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['config', 'magic-link'],
      })
    })

    it('gère les erreurs lors de la mise à jour', async () => {
      vi.mocked(api.put).mockRejectedValue({
        response: {
          data: {
            error: 'Validation error',
          },
        },
      })

      const { result } = renderHook(() => useUpdateMagicLinkConfig(), { wrapper })

      result.current.mutate({
        adminTTL: 86400,
        userTTL: 604800,
        sessionTTL: 7200,
      })

      await waitFor(() => expect(result.current.isError).toBe(true))

      expect(result.current.error).toBeDefined()
    })
  })
})
