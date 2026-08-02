import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { toast } from 'sonner'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import type { Invitation, SendInvitationsResult } from '@/types/invitation'

// Ré-exporter les types pour compatibilité avec les composants
export type { Invitation }

/**
 * Type pour l'entrée d'envoi d'invitations
 */
export interface SendInvitationsInput {
  userIds: string[]
}

/**
 * useInvitations Hook
 * Gestion des invitations avec React Query pour TimePick Admin
 * Fournit les opérations d'envoi et l'historique des invitations
 */
export const useInvitations = (eventId: string) => {
  const queryClient = useQueryClient()

  // React Query pour l'historique des invitations d'un événement
  const {
    data: invitations = [],
    isLoading,
    error,
    refetch
  } = useQuery<Invitation[]>({
    queryKey: ['invitations', eventId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/events/${eventId}/invitations`)
      return data.data as Invitation[]
    },
    enabled: !!eventId
  })

  // Mutation pour envoyer les invitations
  const sendInvitationsMutation = useMutation({
    mutationFn: async (input: SendInvitationsInput) => {
      // L'envoi dispatche en parallèle (Promise.allSettled côté serveur,
      // invitations.service.ts) via le transport SMTP mutualisé et poolé
      // (socketTimeout 300s/opération, email-transport.service.ts) : pour un
      // événement à forte audience, l'attente peut légitimement dépasser les
      // 60 s par défaut sans qu'aucun envoi n'ait échoué.
      const { data } = await api.post(`/admin/events/${eventId}/invitations/send`, input, {
        timeout: 180_000,
      })
      return data.data as SendInvitationsResult
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invitations', eventId] })
      queryClient.invalidateQueries({ queryKey: ['invitationStatus', eventId] })
      // Le dashboard d'onboarding lit engagement.sent (et l'activité par événement) : sans
      // cette invalidation, le guide « Invitez et suivez » resterait affiché après envoi.
      queryClient.invalidateQueries({ queryKey: ['analytics', 'engagement'] })
      queryClient.invalidateQueries({ queryKey: ['analytics', 'event-activity'] })
      toast.success(result.message)
    },
    onError: (err) => {
      toast.error(userFacingErrorMessage(err, "L'envoi des invitations a échoué. Aucune invitation n'est partie, réessayez."))
    }
  })

  // Mutation pour renvoyer une invitation à un utilisateur spécifique
  const resendInvitationMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post(`/admin/events/${eventId}/invitations/${userId}/resend`)
      return data.data as { sent: boolean; email: string; sentAt: string }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['invitations', eventId] })
      queryClient.invalidateQueries({ queryKey: ['invitationStatus', eventId] })
      queryClient.invalidateQueries({ queryKey: ['analytics', 'engagement'] })
      queryClient.invalidateQueries({ queryKey: ['analytics', 'event-activity'] })
      toast.success(`Invitation renvoyée à ${result.email}`)
    },
    onError: (err) => {
      toast.error(userFacingErrorMessage(err, "Le renvoi a échoué. L'invitation n'est pas partie, réessayez."))
    }
  })

  return {
    invitations,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    sendInvitations: (input: SendInvitationsInput) => sendInvitationsMutation.mutate(input),
    isSending: sendInvitationsMutation.isPending,
    resendInvitation: (userId: string) => resendInvitationMutation.mutate(userId),
    isResending: resendInvitationMutation.isPending
  }
}
