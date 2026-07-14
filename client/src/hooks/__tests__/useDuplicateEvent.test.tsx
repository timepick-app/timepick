/**
 * Tests pour useDuplicateEvent hook
 * Story 10-4: Dupliquer un Événement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useDuplicateEvent } from '../useEvents'

// Mock de l'API
vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn()
  }
}))

import api from '../../services/api'
import type { AxiosResponse } from 'axios'
import { toast } from 'sonner'

// Get reference to mocked toast functions
const mockToast = vi.mocked(toast)

describe('useDuplicateEvent', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: {
          retry: false
        }
      }
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )

  /**
   * T5.2: Tester que la mutation appelle le bon endpoint
   */
  it('should call POST /api/admin/events/:id/duplicate', async () => {
    const mockResponse = {
      data: {
        data: {
          id: 'new-event-id',
          name: 'Test Event (copie)',
          description: 'Original description',
          isPublished: false,
          opensAt: null,
          createdAt: '2026-01-26T10:00:00.000Z',
          updatedAt: '2026-01-26T10:00:00.000Z'
        }
      }
    }

    vi.mocked(api.post).mockResolvedValueOnce(mockResponse as unknown as AxiosResponse)

    const { result } = renderHook(() => useDuplicateEvent(), { wrapper })

    result.current.duplicateEvent('event-id-123')

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/admin/events/event-id-123/duplicate')
    })
  })

  /**
   * T5.3: Tester que le cache est invalidé après succès
   */
  it('should invalidate events cache on success', async () => {
    const mockResponse = {
      data: {
        data: {
          id: 'new-event-id',
          name: 'Test Event (copie)',
          description: 'Original description',
          isPublished: false,
          opensAt: null,
          createdAt: '2026-01-26T10:00:00.000Z',
          updatedAt: '2026-01-26T10:00:00.000Z'
        }
      }
    }

    vi.mocked(api.post).mockResolvedValueOnce(mockResponse as unknown as AxiosResponse)

    // Espionner invalidateQueries
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDuplicateEvent(), { wrapper })

    result.current.duplicateEvent('event-id-123')

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['events'] })
    })
  })

  /**
   * T5.4: Tester l'affichage du toast succès
   */
  it('should show success toast on success', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        data: {
          id: 'new-event-id',
          name: 'Test Event (copie)',
          description: 'Original description',
          isPublished: false,
          opensAt: null,
          createdAt: '2026-01-26T10:00:00.000Z',
          updatedAt: '2026-01-26T10:00:00.000Z'
        }
      }
    } as unknown as AxiosResponse)

    const { result } = renderHook(() => useDuplicateEvent(), { wrapper })

    result.current.duplicateEvent('event-id-123')

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Événement dupliqué avec succès')
    })
  })

  /**
   * T5.5: Tester l'affichage du toast erreur
   */
  it('should show error toast on error', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: {
        data: {
          error: 'Événement non trouvé'
        }
      }
    } as unknown as AxiosResponse)

    const { result } = renderHook(() => useDuplicateEvent(), { wrapper })

    result.current.duplicateEvent('non-existent-id')

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Erreur: Événement non trouvé')
    })
  })

  /**
   * T5.6: Tester le retour de isDuplicating
   */
  it('should return isDuplicating state', async () => {
    let resolveApi!: (value: AxiosResponse) => void

    vi.mocked(api.post).mockImplementationOnce(
      () => new Promise(resolve => {
        resolveApi = resolve
      })
    )

    const { result } = renderHook(() => useDuplicateEvent(), { wrapper })

    result.current.duplicateEvent('event-id-123')

    // Pendant la duplication, isDuplicating doit être true
    await waitFor(() => {
      expect(result.current.isDuplicating).toBe(true)
    })

    // Résoudre la promesse
    resolveApi({
      data: {
        data: {
          id: 'new-event-id',
          name: 'Test Event (copie)',
          description: 'Original description',
          isPublished: false,
          opensAt: null,
          createdAt: '2026-01-26T10:00:00.000Z',
          updatedAt: '2026-01-26T10:00:00.000Z'
        }
      }
    } as unknown as AxiosResponse)

    // Après la duplication, isDuplicating doit être false
    await waitFor(() => {
      expect(result.current.isDuplicating).toBe(false)
    })
  })

  /**
   * T5.7: Tester le retour de newEventId après succès
   */
  it('should return newEventId on success', async () => {
    const newEventId = 'new-event-id-123'
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        data: {
          id: newEventId,
          name: 'Test Event (copie)',
          description: 'Original description',
          isPublished: false,
          opensAt: null,
          createdAt: '2026-01-26T10:00:00.000Z',
          updatedAt: '2026-01-26T10:00:00.000Z'
        }
      }
    } as unknown as AxiosResponse)

    const { result } = renderHook(() => useDuplicateEvent(), { wrapper })

    result.current.duplicateEvent('event-id-123')

    await waitFor(() => {
      expect(result.current.newEventId).toBe(newEventId)
    })
  })
})
