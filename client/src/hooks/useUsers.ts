import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { toast } from 'sonner'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import type { User, ApiCreateUserInput, ApiUpdateUserInput, PaginatedUsersResponse, UsersQueryParams, BulkDeleteUsersResult, BulkDeleteSkipReason } from '../types/user'

/** Libellés FR des raisons d'ignorement renvoyées par bulk-delete. */
const SKIP_REASON_LABELS: Record<BulkDeleteSkipReason, string> = {
  self: 'votre compte',
  last_admin: 'dernier administrateur',
  not_found: 'introuvable(s)',
}

/**
 * useDeleteUser Hook
 * Mutation pour supprimer un utilisateur avec gestion des toasts
 * Invalide le cache React Query après suppression et affiche les notifications
 */
export const useDeleteUser = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/users/${id}`)
      return res.data as { deletedBookings: number }
    },
    onSuccess: (data) => {
      // Invalider le cache de la liste des utilisateurs
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // Invalider aussi le cache des détails utilisateurs
      queryClient.invalidateQueries({ queryKey: ['user'] })

      // Toast de confirmation avec le nombre de réservations supprimées
      const bookingMsg = data.deletedBookings > 0
        ? ` (${data.deletedBookings} réservation(s) supprimée(s))`
        : ''
      toast.success(`Utilisateur supprimé avec succès${bookingMsg}`)
    },
    onError: (err) => {
      toast.error(userFacingErrorMessage(err, "La suppression a échoué. Rien n'a été supprimé, réessayez."))
    }
  })
}

/**
 * useBulkDeleteUsers Hook
 * Suppression en masse de membres via POST /admin/users/bulk-delete.
 * Le serveur applique les garde-fous (auto-suppression, dernier admin) en mode
 * "skip" : la réponse détaille les supprimés et les ignorés (avec raison).
 */
export const useBulkDeleteUsers = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await api.post('/admin/users/bulk-delete', { ids })
      return res.data as BulkDeleteUsersResult
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['user'] })

      const bookingMsg = data.deletedBookings > 0
        ? ` (${data.deletedBookings} réservation(s) supprimée(s))`
        : ''

      // Agrège les ignorés par raison pour un message actionnable (qui / pourquoi).
      const skipDetail = (Object.keys(SKIP_REASON_LABELS) as BulkDeleteSkipReason[])
        .map((reason) => ({
          reason,
          count: data.skipped.filter((s) => s.reason === reason).length,
        }))
        .filter(({ count }) => count > 0)
        .map(({ reason, count }) => `${count} ${SKIP_REASON_LABELS[reason]}`)
        .join(', ')

      if (data.deleted > 0) {
        toast.success(
          `${data.deleted} membre(s) supprimé(s)${bookingMsg}` +
            (skipDetail ? ` — ignoré(s) : ${skipDetail}` : '')
        )
      } else {
        toast.error(
          skipDetail
            ? `Aucune suppression — ignoré(s) : ${skipDetail}`
            : 'Aucune suppression effectuée'
        )
      }
    },
    onError: (err) => {
      toast.error(userFacingErrorMessage(err, "La suppression a échoué. Aucun membre n'a été supprimé, réessayez."))
    }
  })
}

/**
 * useUsers Hook
 * Gestion des utilisateurs avec React Query pour TimePick
 * Supporte la pagination, la recherche et le filtrage par rôle côté serveur
 */
export const useUsers = (params: UsersQueryParams = {}) => {
  const queryClient = useQueryClient()

  // Construction des query parameters
  const queryParams = new URLSearchParams()
  if (params.page) queryParams.append('page', params.page.toString())
  if (params.limit) queryParams.append('limit', params.limit.toString())
  if (params.search) queryParams.append('search', params.search)
  if (params.role) queryParams.append('role', params.role)

  const queryString = queryParams.toString()
  const url = `/admin/users${queryString ? `?${queryString}` : ''}`

  // Query key pour le cache React Query
  const queryKey = ['users', params]

  // React Query pour la liste des utilisateurs
  const {
    data: responseData,
    isLoading,
    error,
    refetch,
  } = useQuery<PaginatedUsersResponse>({
    queryKey,
    queryFn: async () => {
      const res = await api.get(url)
      return res.data as PaginatedUsersResponse
    },
    // Activé par défaut ; peut être inhibé via params.enabled=false (ex. : gating d'onboarding)
    enabled: params.enabled ?? true,
    // Réessayer 3 fois en cas d'erreur réseau (sauf 404/401/403)
    retry: (failureCount, error) => {
      const err = error as { response?: { status?: number } }
      const status = err.response?.status
      // Ne pas réessayer pour les erreurs client (4xx)
      if (status && status >= 400 && status < 500) return false
      return failureCount < 3
    },
  })

  // Mutation pour créer un utilisateur
  const createMutation = useMutation({
    mutationFn: async (input: ApiCreateUserInput) => {
      const res = await api.post('/admin/users', input)
      return res.data as User
    },
    onSuccess: () => {
      // Invalider le cache pour recharger la liste
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  // Mutation pour mettre à jour un utilisateur
  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ApiUpdateUserInput }) => {
      const res = await api.put(`/admin/users/${id}`, input)
      // Return full response including selfDemoted flag
      return res.data as User & { selfDemoted?: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  return {
    users: responseData?.users || [],
    loading: isLoading,
    error: error ? userFacingErrorMessage(error, "La liste des utilisateurs n'a pas pu être chargée. Réessayez.") : null,
    pagination: responseData?.pagination || null,
    refetch,
    createUser: (input: ApiCreateUserInput) => createMutation.mutateAsync(input),
    updateUser: (id: string, input: ApiUpdateUserInput) =>
      updateMutation.mutateAsync({ id, input }),
  }
}

