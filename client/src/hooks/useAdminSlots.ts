import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { usePollingConfig } from './usePollingConfig'
import { toast } from 'sonner'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import type { Slot } from '@/types/slot'

// Ré-exporter le type Slot pour compatibilité avec les composants existants
export type { Slot }

/**
 * Type pour la création d'un créneau
 */
export interface CreateSlotInput {
  startTime: string
  endTime: string
  capacity: number
  description?: string
}

/**
 * Résultat renvoyé par DELETE /admin/slots/:id (annulation/suppression).
 * `failed > 0` ⇒ une notification d'annulation n'a pas pu être envoyée.
 */
interface CancelSlotResult {
  cancelled: boolean
  hadReservations: boolean
  notified: number
  failed: number
}

/**
 * Type pour la mise à jour d'un créneau
 */
export interface UpdateSlotInput {
  startTime?: string
  endTime?: string
  capacity?: number
  description?: string
  notifyBookings?: boolean
  onSuccess?: () => void
}

/**
 * useAdminSlots Hook
 * Gestion des créneaux horaires avec React Query pour TimePick Admin
 * Fournit les opérations CRUD et l'état de chargement
 */
export const useAdminSlots = (eventId: string) => {
  const queryClient = useQueryClient()
  // Polling automatique piloté par la config (app_config.polling_interval)
  const { data: pollingConfig, fallbackInterval } = usePollingConfig()
  const interval = pollingConfig?.interval ?? fallbackInterval

  // React Query pour la liste des créneaux d'un événement
  const {
    data: slots = [],
    isLoading,
    error,
    refetch
  } = useQuery<Slot[]>({
    queryKey: ['slots', eventId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/events/${eventId}/slots`)
      return data.data as Slot[]
    },
    enabled: !!eventId,
    refetchInterval: interval > 0 && !!eventId ? interval : false,
  })

  // Mutation pour créer un créneau
  const createSlotMutation = useMutation({
    mutationFn: async (slotData: CreateSlotInput) => {
      const { data } = await api.post(`/admin/events/${eventId}/slots`, slotData)
      return data.data as Slot
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slots', eventId] })
      queryClient.invalidateQueries({ queryKey: ['invitation-eligibility', eventId] })
      // Invalidate public-slot queries so calendar updates immediately
      queryClient.invalidateQueries({
        predicate: (query) => {
          return Array.isArray(query.queryKey) && query.queryKey[0] === 'public-slots'
        }
      })
      toast.success('Créneau créé avec succès')
    },
    onError: (err) => {
      toast.error(userFacingErrorMessage(err, 'La création du créneau a échoué. Vos informations sont toujours à l\'écran, réessayez.'))
    }
  })

  // Mutation pour mettre à jour un créneau
  const updateSlotMutation = useMutation({
    mutationFn: async ({ slotId, data }: { slotId: string; data: UpdateSlotInput }) => {
      const { data: responseData } = await api.put(`/admin/slots/${slotId}`, data)
      // Garde de contrat : l'absence de notified/failed (≠ valeur 0) signale une
      // réponse serveur non conforme (régression/déploiement désaligné) — on la
      // trace au lieu de la masquer silencieusement via `?? 0`.
      if (responseData.notified === undefined || responseData.failed === undefined) {
        console.warn('[useAdminSlots] PUT /admin/slots: réponse sans notified/failed — contrat API possiblement rompu', responseData)
      }
      return { slot: responseData.data as Slot, notified: (responseData.notified ?? 0) as number, failed: (responseData.failed ?? 0) as number }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['slots', eventId] })
      queryClient.invalidateQueries({ queryKey: ['invitation-eligibility', eventId] })
      // Invalidate public-slot queries so calendar updates immediately
      queryClient.invalidateQueries({
        predicate: (query) => {
          return Array.isArray(query.queryKey) && query.queryKey[0] === 'public-slots'
        }
      })
      if (_data.notified > 0) {
        toast.success(`Créneau mis à jour · ${_data.notified} inscrit${_data.notified > 1 ? 's' : ''} notifié${_data.notified > 1 ? 's' : ''}`)
      } else {
        toast.success('Créneau mis à jour avec succès')
      }
      if (_data.failed > 0) {
        toast.warning(`La notification n'a pas pu être envoyée à ${_data.failed} inscrit${_data.failed > 1 ? 's' : ''}.`)
      }
      // Appeler le callback onSuccess si fourni dans data
      if (variables.data.onSuccess && typeof variables.data.onSuccess === 'function') {
        variables.data.onSuccess()
      }
    },
    onError: (err) => {
      toast.error(userFacingErrorMessage(err, 'La modification du créneau a échoué. Vos modifications sont toujours à l\'écran, réessayez.'))
    }
  })

  // Mutation pour annuler/supprimer un créneau
  // Plan 5b defer-A L3-data-F : la mutation accepte un cancellationReason
  // optionnel propagé dans le body DELETE. Le serveur l'inclut dans le mail
  // d'annulation envoyé à chaque participant d'un créneau réservé.
  // `hadReservations` ne sert qu'au wording du toast (suppression définitive vs
  // annulation, spec-conditional-slot-cancellation) : le serveur reste seul
  // décideur de l'action réelle (DELETE si 0 inscrit, soft-delete sinon).
  const deleteSlotMutation = useMutation({
    mutationFn: async ({ slotId, cancellationReason }: { slotId: string; cancellationReason?: string; hadReservations?: boolean }) => {
      const { data } = await api.delete(`/admin/slots/${slotId}`, {
        data: cancellationReason ? { cancellationReason } : undefined,
      })
      return data.data as CancelSlotResult
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['slots', eventId] })
      queryClient.invalidateQueries({ queryKey: ['invitation-eligibility', eventId] })
      // Rafraîchir les surfaces de notifications en attente (carte Tableau de bord
      // + section onglet Emails) : une notification qui vient d'échouer doit y
      // apparaître immédiatement.
      queryClient.invalidateQueries({ queryKey: ['cancellation-notifications'] })
      // Invalidate public-slot queries so calendar updates immediately
      queryClient.invalidateQueries({
        predicate: (query) => {
          return Array.isArray(query.queryKey) && query.queryKey[0] === 'public-slots'
        }
      })

      // Si une notification d'annulation n'a pas pu partir (panne d'envoi), on
      // alerte spécifiquement l'admin et on l'oriente vers le renvoi — sinon toast
      // de succès habituel (le serveur reste seul décideur de l'action réelle).
      if (result && result.failed > 0) {
        toast.warning(
          `Créneau annulé, mais la notification n'a pas pu être envoyée à ${result.failed} participant${result.failed > 1 ? 's' : ''}. Vous pouvez la renvoyer depuis le tableau de bord.`
        )
      } else {
        toast.success(variables.hadReservations ? 'Créneau annulé' : 'Créneau supprimé')
      }
    },
    onError: (err) => {
      toast.error(userFacingErrorMessage(err, "La suppression du créneau a échoué. Rien n'a été supprimé, réessayez."))
    }
  })

  return {
    slots,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    createSlot: (input: CreateSlotInput) => createSlotMutation.mutate(input),
    createSlotAsync: (input: CreateSlotInput) => createSlotMutation.mutateAsync(input),
    isCreating: createSlotMutation.isPending,
    updateSlot: (slotId: string, data: UpdateSlotInput) =>
      updateSlotMutation.mutate({ slotId, data }),
    isUpdating: updateSlotMutation.isPending,
    deleteSlot: (slotId: string, cancellationReason?: string, hadReservations?: boolean) =>
      deleteSlotMutation.mutate({ slotId, cancellationReason, hadReservations }),
    deleteSlotAsync: (slotId: string, cancellationReason?: string, hadReservations?: boolean) =>
      deleteSlotMutation.mutateAsync({ slotId, cancellationReason, hadReservations }),
    isDeleting: deleteSlotMutation.isPending
  }
}
