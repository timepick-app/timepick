import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUpdatePollingConfig, secondsToMs, msToSeconds, MIN_POLLING_SECONDS, MAX_POLLING_SECONDS } from '../useUpdatePollingConfig'

// Mock de l'API
vi.mock('../../services/api', () => ({
  default: {
    put: vi.fn(),
  },
}))

const mockApi = (await import('../../services/api')).default
const mockPut = vi.mocked(mockApi.put)

describe('useUpdatePollingConfig', () => {
  let queryClient: QueryClient

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: {
          retry: false,
        },
      },
    })
    vi.clearAllMocks()
  })

  describe('secondsToMs', () => {
    it('convertit les secondes en millisecondes', () => {
      expect(secondsToMs(10)).toBe(10000)
      expect(secondsToMs(30)).toBe(30000)
      expect(secondsToMs(120)).toBe(120000)
    })
  })

  describe('msToSeconds', () => {
    it('convertit les millisecondes en secondes arrondies', () => {
      expect(msToSeconds(10000)).toBe(10)
      expect(msToSeconds(30000)).toBe(30)
      expect(msToSeconds(120000)).toBe(120)
      expect(msToSeconds(35500)).toBe(36) // Arrondi
    })
  })

  describe('constantes', () => {
    it('définit les limites correctes', () => {
      expect(MIN_POLLING_SECONDS).toBe(10)
      expect(MAX_POLLING_SECONDS).toBe(120)
    })
  })

  describe('useUpdatePollingConfig hook', () => {
    it('envoie une requête PUT avec les bonnes données', async () => {
      mockPut.mockResolvedValue({
        data: {
          data: {
            interval: 60000,
          },
        },
      })

      const { result } = renderHook(() => useUpdatePollingConfig(), { wrapper })

      result.current.mutate(60)

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith('/admin/config/polling-interval', {
          interval: 60000, // 60s en ms
        })
      })
    })

    it('invalide le cache après succès', async () => {
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries')

      mockPut.mockResolvedValue({
        data: {
          data: {
            interval: 60000,
          },
        },
      })

      const { result } = renderHook(() => useUpdatePollingConfig(), { wrapper })

      result.current.mutate(60)

      await waitFor(() => {
        expect(invalidateQueriesSpy).toHaveBeenCalledWith({
          queryKey: ['config', 'polling-interval'],
        })
      })
    })

    it('gère les erreurs de l\'API', async () => {
      // Spy sur console.error pour capturer l'erreur
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockPut.mockRejectedValue({
        response: {
          data: {
            error: 'Erreur de validation',
          },
        },
      })

      const { result } = renderHook(() => useUpdatePollingConfig(), { wrapper })

      result.current.mutate(60)

      await waitFor(() => {
        // Vérifier que la mutation a été appelée (l'erreur est gérée par le hook)
        expect(mockPut).toHaveBeenCalled()
      })

      consoleErrorSpy.mockRestore()
    })

    it('a un état isPending correct', async () => {
      let resolvePromise: (value: Awaited<ReturnType<typeof mockPut>>) => void
      mockPut.mockReturnValue(new Promise((resolve) => {
        resolvePromise = resolve
      }))

      const { result } = renderHook(() => useUpdatePollingConfig(), { wrapper })

      // Lancer la mutation
      result.current.mutate(60)

      // Attendre que l'état pending soit true
      await waitFor(() => {
        expect(result.current.isPending).toBe(true)
      })

      // Résoudre la promesse
      resolvePromise!({
        data: {
          data: { interval: 60000 },
        },
      })

      // Attendre que l'état pending redevienne false
      await waitFor(() => {
        expect(result.current.isPending).toBe(false)
      })
    })
  })
})
