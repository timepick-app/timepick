import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../services/api'
import { toast } from 'sonner'
import type { User } from '@/types/user'
import { extractErrorMessage } from '@/lib/extractErrorMessage'

import type { Event, CreateEventInput, UpdateEventInput } from '@/types/event'
export type { Event, CreateEventInput, UpdateEventInput }

/**
 * useEvents Hook
 * Gestion des événements avec React Query pour TimePick
 * Fournit les opérations CRUD et l'état de chargement
 */
export const useEvents = () => {
  // React Query pour la liste des événements
  const {
    data: events = [],
    isLoading,
    error,
    refetch
  } = useQuery<Event[]>({
    queryKey: ['events'],
    queryFn: async () => {
      const { data } = await api.get('/admin/events')
      return data.data
    }
  })

  return {
    events,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  }
}

/**
 * useEventDetails Hook
 * Récupère les détails d'un événement par ID
 */
export const useEventDetails = (eventId: string) => {
  return useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/events/${eventId}`)
      return data.data as Event
    },
    enabled: !!eventId
  })
}

/**
 * useUpdateEvent Hook
 * Met à jour un événement existant
 * Invalide le cache des événements après succès
 */
export interface UseUpdateEventOptions {
  /** Callback appelé après succès de la mutation (avec l'événement mis à jour) */
  onSuccess?: (updatedEvent: Event) => void
  /** Callback appelé après échec de la mutation */
  onError?: (error: Error) => void
}

/**
 * useUpdateEvent Hook
 * Met à jour un événement existant
 * Invalide le cache des événements après succès
 */
export const useUpdateEvent = (options?: UseUpdateEventOptions) => {
  const queryClient = useQueryClient()

  const updateEventMutation = useMutation({
    mutationFn: async ({ eventId, data }: { eventId: string; data: UpdateEventInput }) => {
      const { data: responseData } = await api.put(`/admin/events/${eventId}`, data)
      return responseData.data as Event
    },
    onSuccess: (updatedEvent) => {
      // Invalider la liste des événements
      queryClient.invalidateQueries({ queryKey: ['events'] })
      // Invalider les détails de l'événement pour que EventFormPage reçoive les nouvelles valeurs
      queryClient.invalidateQueries({ queryKey: ['event', updatedEvent.id] })
      // Also invalidate ALL public-event queries so the public calendar picks up the change immediately
      queryClient.invalidateQueries({
        predicate: (query) => {
          // Invalidate any query that starts with ['public-event']
          return Array.isArray(query.queryKey) && query.queryKey[0] === 'public-event'
        }
      })
      toast.success('Événement mis à jour avec succès')
      // Callback personnalisé après succès
      options?.onSuccess?.(updatedEvent)
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la mise à jour')
      toast.error(`Erreur: ${errorMsg}`)
      // Callback personnalisé après erreur
      options?.onError?.(new Error(errorMsg))
    }
  })

  return {
    updateEvent: (eventId: string, data: UpdateEventInput) =>
      updateEventMutation.mutateAsync({ eventId, data }),
    isUpdating: updateEventMutation.isPending
  }
}

/**
 * usePublishEvent Hook
 * Publie un événement (is_published = true)
 */
export const usePublishEvent = () => {
  const queryClient = useQueryClient()

  const publishMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { data } = await api.put(`/admin/events/${eventId}/publish`)
      return data.data as Event
    },
    onSuccess: (updatedEvent) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['event', updatedEvent.id] })
      toast.success(`Événement "${updatedEvent.name}" publié avec succès`)
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la publication')
      toast.error(`Erreur: ${errorMsg}`)
    }
  })

  return {
    publishEvent: (eventId: string) => publishMutation.mutateAsync(eventId),
    isPublishing: publishMutation.isPending
  }
}

/**
 * useUnpublishEvent Hook
 * Dépublie un événement (is_published = false)
 */
export const useUnpublishEvent = () => {
  const queryClient = useQueryClient()

  const unpublishMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { data } = await api.put(`/admin/events/${eventId}/unpublish`)
      return data.data as Event
    },
    onSuccess: (updatedEvent) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['event', updatedEvent.id] })
      toast.success(`Événement "${updatedEvent.name}" dépublié`)
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la dépublication')
      toast.error(`Erreur: ${errorMsg}`)
    }
  })

  return {
    unpublishEvent: (eventId: string) => unpublishMutation.mutate(eventId),
    isUnpublishing: unpublishMutation.isPending
  }
}

/**
 * useUpdateOpeningDate Hook
 * Met à jour la date d'ouverture des inscriptions d'un événement
 *
 * API: PUT /api/admin/events/:id/opening-date (via api.put avec préfixe /api)
 * Body: { opensAt: string | null } - ISO 8601 date string ou null
 */
export const useUpdateOpeningDate = () => {
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: async ({ eventId, opensAt }: { eventId: string; opensAt: string | null }) => {
      const { data } = await api.put(`/admin/events/${eventId}/opening-date`, { opensAt })
      return data.data as Event
    },
    onSuccess: (updatedEvent) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['event', updatedEvent.id] })
      // Also invalidate ALL public-event queries (using predicate to match any UUID)
      queryClient.invalidateQueries({
        predicate: (query) => {
          // Invalidate any query that starts with ['public-event']
          return Array.isArray(query.queryKey) && query.queryKey[0] === 'public-event'
        }
      })
      if (updatedEvent.opensAt) {
        const date = new Date(updatedEvent.opensAt)
        toast.success(`Date d'ouverture fixée au ${date.toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}`)
      } else {
        toast.success('Date d\'ouverture supprimée (ouverture immédiate)')
      }
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la mise à jour')
      toast.error(`Erreur: ${errorMsg}`)
    }
  })

  return {
    updateOpeningDate: (eventId: string, opensAt: string | null) =>
      updateMutation.mutateAsync({ eventId, opensAt }),
    isUpdating: updateMutation.isPending
  }
}

/**
 * Type utilisateur — réexporté depuis la source unique (@/types/user)
 */
export type { User }

/**
 * useEventUsers Hook
 * Récupère les utilisateurs sélectionnés pour un événement
 */
export const useEventUsers = (eventId: string) => {
  return useQuery<User[]>({
    queryKey: ['events', eventId, 'users'],
    queryFn: async () => {
      const { data } = await api.get(`/admin/events/${eventId}/users`)
      return data.data as User[]
    },
    enabled: !!eventId
  })
}

/**
 * useSetEventUsers Hook
 * Définit les utilisateurs autorisés pour un événement (remplace la sélection)
 */
export const useSetEventUsers = () => {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ eventId, userIds }: { eventId: string; userIds: string[] }) => {
      const { data } = await api.post(`/admin/events/${eventId}/users`, { userIds })
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['events', variables.eventId, 'users'] })
      queryClient.invalidateQueries({ queryKey: ['invitationStatus', variables.eventId] })
      toast.success(`Utilisateurs mis à jour (${variables.userIds.length} sélectionné${variables.userIds.length > 1 ? 's' : ''})`)
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la mise à jour')
      toast.error(`Erreur: ${errorMsg}`)
    }
  })

  return {
    setEventUsers: (eventId: string, userIds: string[]) =>
      mutation.mutateAsync({ eventId, userIds }),
    isSetting: mutation.isPending
  }
}

/**
 * useRemoveEventUser Hook
 * Retire un utilisateur de la sélection
 */
export const useRemoveEventUser = () => {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ eventId, userId }: { eventId: string; userId: string }) => {
      const { data } = await api.delete(`/admin/events/${eventId}/users/${userId}`)
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['events', variables.eventId, 'users'] })
      queryClient.invalidateQueries({ queryKey: ['invitationStatus', variables.eventId] })
      toast.success('Utilisateur retiré')
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors du retrait')
      toast.error(`Erreur: ${errorMsg}`)
    }
  })

  return {
    removeEventUser: (eventId: string, userId: string) =>
      mutation.mutate({ eventId, userId }),
    isRemoving: mutation.isPending
  }
}

/**
 * Type pour un événement public avec autorisation
 */
export interface PublicEvent extends Event {
  slots: unknown[]
  canReserve: boolean
}

/**
 * usePublicEvent Hook
 * Récupère un événement public par UUID avec vérification d'autorisation
 * GET /api/public/events/:uuid
 *
 * Features:
 * - Polling automatique pour détecter les changements de opensAt
 * - Cache React Query avec invalidation automatique
 *
 * @param uuid - UUID public de l'événement
 * @param pollingInterval - Intervalle de polling en ms (optionnel, utilise la config par défaut)
 */
export const usePublicEvent = (uuid: string, pollingInterval?: number) => {
  // Utiliser l'intervalle passé en paramètre, ou l'intervalle par défaut de l'env
  const DEFAULT_POLLING_INTERVAL = 30000
  const ENV_POLLING_INTERVAL = import.meta.env.VITE_POLLING_INTERVAL
    ? Number(import.meta.env.VITE_POLLING_INTERVAL)
    : DEFAULT_POLLING_INTERVAL
  const interval = pollingInterval ?? ENV_POLLING_INTERVAL

  return useQuery<PublicEvent>({
    queryKey: ['public-event', uuid],
    queryFn: async () => {
      const { data } = await api.get(`/public/events/${uuid}`)
      return data.data as PublicEvent
    },
    enabled: !!uuid,
    retry: false, // Ne pas réessayer si 404/403
    // Ajouter le polling pour détecter les changements de opensAt
    refetchInterval: interval > 0 && !!uuid ? interval : false,
    staleTime: 10000, // 10 secondes - les données sont considérées fraîches
    gcTime: 5 * 60 * 1000, // 5 minutes - conserver les données stale plus longtemps
    placeholderData: keepPreviousData, // garde les données de l'événement précédent pendant le chargement du nouveau (navigation event→event) → pas de skeleton/flash
  })
}

/**
 * useDeleteEvent Hook
 * Supprime un événement (suppression en cascade des créneaux et réservations)
 * API: DELETE /api/admin/events/:id
 */
export const useDeleteEvent = () => {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      await api.delete(`/admin/events/${eventId}`)
      return eventId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Événement supprimé avec succès')
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la suppression')
      toast.error(`Erreur: ${errorMsg}`)
    }
  })

  return {
    deleteEvent: (eventId: string) => deleteMutation.mutate(eventId),
    isDeleting: deleteMutation.isPending
  }
}

/**
 * useCreateEvent Hook
 * Crée un nouvel événement brouillon via un POST explicite (bouton Créer de la Sheet).
 * Les erreurs sont propagées à l'appelant via mutateAsync pour permettre la
 * gestion différenciée 409 (nom dupliqué) vs autres erreurs dans le composant.
 */
export const useCreateEvent = () => {
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async (payload: CreateEventInput) => {
      const { data } = await api.post('/admin/events', payload)
      if (!data?.data?.id) throw new Error('Réponse de création invalide')
      return data.data as Event
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
  })

  return {
    createEvent: (payload: CreateEventInput) => createMutation.mutateAsync(payload),
    isCreating: createMutation.isPending,
  }
}

/**
 * Type pour la réponse de duplication d'événement
 */
interface DuplicateEventResponse {
  data: Event
}

/**
 * Options pour useDuplicateEvent
 */
interface UseDuplicateEventOptions {
  /** Callback appelé après succès avec l'ID du nouvel événement (ex: pour navigation) */
  onSuccess?: (newEventId: string) => void
}

/**
 * useDuplicateEvent Hook
 * Duplique un événement existant
 * API: POST /api/admin/events/:id/duplicate
 *
 * Story 10-4: Dupliquer un Événement
 *
 * Comportement:
 * - Crée une copie avec le nom suffixé " (copie)"
 * - L'état est forcé à "Brouillon" (isPublished = false)
 * - Les créneaux et utilisateurs ne sont pas copiés
 * - Accepte un callback onSuccess pour la navigation vers l'édition
 *
 * @param options - Options de configuration (callback onSuccess)
 */
export const useDuplicateEvent = (options?: UseDuplicateEventOptions) => {
  const queryClient = useQueryClient()

  const duplicateMutation = useMutation({
    mutationFn: async (eventId: string): Promise<{ newEventId: string }> => {
      const { data } = await api.post<DuplicateEventResponse>(`/admin/events/${eventId}/duplicate`)
      return { newEventId: data.data.id }
    },
    onSuccess: ({ newEventId }) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      toast.success('Événement dupliqué avec succès')
      // Appeler le callback onSuccess personnalisé si fourni (pour la navigation)
      options?.onSuccess?.(newEventId)
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la duplication')
      toast.error(`Erreur: ${errorMsg}`)
    }
  })

  return {
    duplicateEvent: (eventId: string) => duplicateMutation.mutate(eventId),
    isDuplicating: duplicateMutation.isPending,
    newEventId: duplicateMutation.data?.newEventId
  }
}

/**
 * Type de retour pour la suppression en masse d'événements.
 */
interface BulkDeleteEventsResult {
  deleted: number
  deletedBookings: number
  notFound: number
}

/**
 * useBulkDeleteEvents Hook
 * Suppression en masse d'événements avec confirmation.
 * Invalide les caches événements et statistiques après succès.
 */
export const useBulkDeleteEvents = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await api.post('/admin/events/bulk-delete', { ids })
      return res.data as BulkDeleteEventsResult
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })

      const bookingMsg = data.deletedBookings > 0
        ? ` (${data.deletedBookings} réservation(s) supprimée(s))`
        : ''

      if (data.deleted > 0) {
        toast.success(`${data.deleted} événement(s) supprimé(s)${bookingMsg}`)
      } else {
        toast.error('Aucune suppression effectuée')
      }
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la suppression')
      toast.error(`Erreur: ${errorMsg}`)
    },
  })
}

/**
 * Generate the public URL for an event
 * @param eventId - The UUID of the event
 * @returns The full public URL for the event
 */
export function getEventPublicUrl(eventId: string): string {
  const baseUrl = window.location.origin
  return `${baseUrl}/events/${eventId}`
}

// Réexport des hooks de statistiques pour convenience
// useAllEventsStats est utilisé par EventsListPage
export { useAllEventsStats } from './useStats'
