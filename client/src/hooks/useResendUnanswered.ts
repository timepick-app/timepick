import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { toast } from 'sonner'
import { extractErrorMessage } from '@/lib/extractErrorMessage'

/**
 * useResendUnanswered Hook
 * Relance les invitations sans réponse depuis plus de 3 jours pour un événement.
 *
 * Le serveur renvoie `{ targeted, resent, failed }` : destinataires ciblés, envois
 * réussis, et la différence (échecs d'envoi par destinataire). Le toast reflète
 * fidèlement ces cas — un échec partiel n'est jamais présenté comme un succès
 * complet (correctif C1).
 *
 * `resend` accepte les options de `mutate` (onSuccess/onError/onSettled) afin que
 * l'appelant ferme le dialog de confirmation AU SUCCÈS seulement : sur erreur le
 * dialog reste ouvert, le toast d'erreur s'affiche et l'admin peut réessayer.
 */
export const useResendUnanswered = (eventId: string) => {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/admin/events/${eventId}/invitations/resend-unanswered`)
      return data.data as { targeted: number; resent: number; failed: number }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'event-activity'] })
      queryClient.invalidateQueries({ queryKey: ['analytics', 'engagement'] })
      const { targeted, resent, failed } = result
      if (targeted === 0) {
        toast.info('Aucune invitation à relancer')
      } else if (failed === 0) {
        toast.success(`${resent} invitation(s) relancée(s)`)
      } else if (resent > 0) {
        toast.warning(`${resent} relancée(s), ${failed} échec(s) d'envoi`)
      } else {
        toast.error("Échec de la relance : aucun email n'a pu être envoyé")
      }
    },
    onError: (err) => {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      const errorMsg = extractErrorMessage(error, 'Erreur lors de la relance des invitations')
      toast.error(`Erreur: ${errorMsg}`)
    },
  })

  return {
    resend: (opts?: Parameters<typeof mutation.mutate>[1]) => mutation.mutate(undefined, opts),
    isResending: mutation.isPending,
  }
}
