/**
 * Tests pour useBulkDeleteUsers hook
 * Feature: DataTable + migration Membres + bulk-delete
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useBulkDeleteUsers } from '../useUsers'

// Mock de l'API
vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn()
  }
}))

import api from '../../services/api'
import type { AxiosResponse } from 'axios'
import { toast } from 'sonner'

const mockToast = vi.mocked(toast)

describe('useBulkDeleteUsers', () => {
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
   * (a) deleted>0 avec bookings et skipped self →
   * toast.success contenant deleted, bookings, et skipped agrégé ;
   * invalidateQueries pour ['users'] ET ['user'].
   */
  it('(a) toast.success avec deleted, bookings et skipped self ; invalide les deux caches', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        deleted: 2,
        deletedBookings: 3,
        skipped: [{ id: 'x', email: 'a@b.c', reason: 'self' }]
      }
    } as unknown as AxiosResponse)

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useBulkDeleteUsers(), { wrapper })

    result.current.mutate(['id1', 'id2', 'x'])

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled()
    })

    const msg = vi.mocked(toast.success).mock.calls[0][0] as string
    expect(msg).toContain('2 membre(s) supprimé(s)')
    expect(msg).toContain('(3 réservation(s) supprimée(s))')
    expect(msg).toContain('ignoré(s) : 1 votre compte')

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user'] })
  })

  /**
   * (b) deleted==0 avec skipped self + last_admin →
   * toast.error contenant 'Aucune suppression — ignoré(s) :',
   * '1 votre compte' et '1 dernier administrateur'.
   */
  it('(b) toast.error avec "Aucune suppression" et skipped self + last_admin', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        deleted: 0,
        deletedBookings: 0,
        skipped: [
          { id: 'x', email: 'a@b.c', reason: 'self' },
          { id: 'y', email: 'b@c.d', reason: 'last_admin' }
        ]
      }
    } as unknown as AxiosResponse)

    const { result } = renderHook(() => useBulkDeleteUsers(), { wrapper })

    result.current.mutate(['x', 'y'])

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled()
    })

    const msg = vi.mocked(toast.error).mock.calls[0][0] as string
    expect(msg).toContain('Aucune suppression — ignoré(s) :')
    expect(msg).toContain('1 votre compte')
    expect(msg).toContain('1 dernier administrateur')
  })

  /**
   * (c) deleted==0, skipped vide →
   * toast.error('Aucune suppression effectuée') exactement.
   */
  it('(c) toast.error("Aucune suppression effectuée") si skipped vide', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        deleted: 0,
        deletedBookings: 0,
        skipped: []
      }
    } as unknown as AxiosResponse)

    const { result } = renderHook(() => useBulkDeleteUsers(), { wrapper })

    result.current.mutate(['id1'])

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Aucune suppression effectuée')
    })
  })

  /**
   * (d) api.post rejette { response: { data: { error: 'Boom' } } } →
   * toast.error('Erreur: Boom').
   */
  it('(d) toast.error("Erreur: Boom") sur rejet API avec message serveur', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: { data: { error: 'Boom' } }
    })

    const { result } = renderHook(() => useBulkDeleteUsers(), { wrapper })

    result.current.mutate(['id1'])

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Erreur: Boom')
    })
  })

  /**
   * (e) Bonus : ordre d'agrégation self → last_admin → not_found
   * Les trois raisons mélangées → le message respecte l'ordre canonique.
   */
  it('(e) ordre des raisons dans le détail : self → last_admin → not_found', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        deleted: 0,
        deletedBookings: 0,
        skipped: [
          { id: 'a', email: 'a@b.c', reason: 'not_found' },
          { id: 'b', email: 'b@c.d', reason: 'last_admin' },
          { id: 'c', email: 'c@d.e', reason: 'self' },
          { id: 'd', email: 'd@e.f', reason: 'not_found' }
        ]
      }
    } as unknown as AxiosResponse)

    const { result } = renderHook(() => useBulkDeleteUsers(), { wrapper })

    result.current.mutate(['a', 'b', 'c', 'd'])

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled()
    })

    const msg = vi.mocked(toast.error).mock.calls[0][0] as string
    // Ordre self → last_admin → not_found dans le message
    const idxSelf = msg.indexOf('votre compte')
    const idxLastAdmin = msg.indexOf('dernier administrateur')
    const idxNotFound = msg.indexOf('introuvable(s)')
    expect(idxSelf).toBeGreaterThanOrEqual(0)
    expect(idxLastAdmin).toBeGreaterThanOrEqual(0)
    expect(idxNotFound).toBeGreaterThanOrEqual(0)
    expect(idxSelf).toBeLessThan(idxLastAdmin)
    expect(idxLastAdmin).toBeLessThan(idxNotFound)
  })
})
