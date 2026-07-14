import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import type { InvitationStatusUser } from '@/types/invitation'

export type { InvitationStatusUser }

/**
 * useInvitationStatus Hook
 * Récupère le statut d'invitation de tous les utilisateurs sélectionnés pour un événement
 * Inclut les utilisateurs sans invitation (statut: pending)
 */
export const useInvitationStatus = (eventId: string) => {
  const {
    data: users = [],
    isLoading,
    error,
    refetch
  } = useQuery<InvitationStatusUser[]>({
    queryKey: ['invitationStatus', eventId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/events/${eventId}/invitations/status`)
      return data.data as InvitationStatusUser[]
    },
    enabled: !!eventId,
    staleTime: 30000, // 30 secondes
    refetchInterval: 60000 // Rafraîchir toutes les minutes
  })

  return {
    users,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch
  }
}
