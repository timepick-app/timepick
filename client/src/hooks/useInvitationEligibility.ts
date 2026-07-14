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
    staleTime: 5000 // Short cache, revalidate frequently
  })
}
