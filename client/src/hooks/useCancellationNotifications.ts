import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { toast } from 'sonner'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'

/**
 * useCancellationNotifications
 *
 * Lecture et renvoi des notifications d'annulation de créneau « en attente »
 * (créneau annulé dont la notification email n'a pas pu être envoyée). Calqué
 * sur `useInvitations` : query d'historique + mutation de renvoi avec toast.
 *
 * Deux surfaces consomment ce hook : la carte du Tableau de bord (global, sans
 * eventId) et la section de l'onglet Emails d'un événement (filtrée par eventId).
 * Le renvoi est groupé et idempotent (cf. cancellation-notification.service).
 */

interface PendingRecipient {
  bookingId: string
  email: string
  firstName: string
  lastName: string | null
}

interface PendingSlot {
  slotId: string
  startTime: string
  endTime: string
  cancellationReason: string | null
  recipients: PendingRecipient[]
}

interface PendingEvent {
  eventId: string
  eventName: string
  pendingCount: number
  slots: PendingSlot[]
}

export interface PendingNotifications {
  pending: number
  events: PendingEvent[]
}

interface ResendResult {
  sent: number
  failed: number
}

// Clé de query partagée : préfixe commun pour invalider toutes les surfaces
// (globale ET par-événement) après un renvoi, quel que soit son périmètre.
const CANCELLATION_NOTIFICATIONS_KEY = 'cancellation-notifications'

/**
 * Lecture des notifications en attente. Sans `eventId` = global (carte) ;
 * avec `eventId` = un seul événement (section onglet Emails).
 */
export const useCancellationNotifications = (eventId?: string) => {
  return useQuery<PendingNotifications>({
    queryKey: [CANCELLATION_NOTIFICATIONS_KEY, eventId ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get('/admin/cancellation-notifications', {
        params: eventId ? { eventId } : undefined,
      })
      return data.data as PendingNotifications
    },
  })
}

/**
 * Renvoi groupé idempotent. `mutate(undefined)` = global (« Tout renvoyer ») ;
 * `mutate(eventId)` = un seul événement (« Renvoyer »). Invalide toutes les
 * surfaces de notifications après succès.
 */
export const useResendCancellationNotifications = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventId?: string) => {
      const { data } = await api.post(
        '/admin/cancellation-notifications/resend',
        eventId ? { eventId } : {}
      )
      return data.data as ResendResult
    },
    onSuccess: ({ sent, failed }) => {
      queryClient.invalidateQueries({ queryKey: [CANCELLATION_NOTIFICATIONS_KEY] })

      if (failed > 0 && sent > 0) {
        toast.warning(`${sent} notification(s) renvoyée(s), ${failed} échec(s).`)
      } else if (failed > 0) {
        toast.error(`Échec du renvoi : ${failed} notification(s) n'ont pas pu être envoyées.`)
      } else if (sent > 0) {
        toast.success(`${sent} notification(s) renvoyée(s).`)
      } else {
        toast.info('Aucune notification en attente à renvoyer.')
      }
    },
    onError: (err) => {
      toast.error(userFacingErrorMessage(err, "Le renvoi des notifications a échoué. Aucune notification n'est partie, réessayez."))
    },
  })
}
