import { useQuery } from '@tanstack/react-query'
import api, { type ApiResponse } from '../services/api'

/**
 * Response from eligibility check endpoint
 */
export interface EligibilityResponse {
  canSend: boolean
  errorCode?: string
  errorMessage?: string
}

/**
 * Hook to check if an event is eligible for receiving invitations
 * Used to disable the "Send invitations" button when event has no slots or is past
 *
 * @param eventId - UUID of the event to check
 * @returns Query result with eligibility data
 */
export const useInvitationEligibility = (eventId: string) => {
  return useQuery<EligibilityResponse>({
    queryKey: ['invitation-eligibility', eventId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<EligibilityResponse>>(
        `/admin/events/${eventId}/invitations/eligibility`
      )
      return data.data
    },
    enabled: !!eventId,
    // 30 s — aligné sur `useInvitationStatus`, la requête voisine du même onglet.
    // L'éligibilité ne dépend que de deux choses : le nombre de créneaux (invalidé
    // explicitement par les mutations de créneaux) et le passage de la date de fin.
    // Elle ne pilote qu'un état `disabled` de bouton — le serveur revalide de toute
    // façon à l'envoi — donc une borne courte n'achète aucune correction, seulement
    // des requêtes : depuis l'activation du rafraîchissement au retour d'onglet,
    // `staleTime` est ce qui décide de refetcher, et 5 s (valeur d'origine, sans
    // rationnel) faisait refetcher à chaque bascule d'onglet.
    staleTime: 30_000,
  })
}
