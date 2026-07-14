import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  getEmailBrandSettings,
  patchEmailBrandSettings,
  resetEmailBrandSettings,
  type EmailBrandSettings,
  type EmailBrandSettingsPatch,
} from '../services/email-brand-settings.service'
import { toast } from 'sonner'
import { extractErrorMessage } from '@/lib/extractErrorMessage'

const invalidateAllTemplatePreviews = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({
    queryKey: ['settings', 'email-template-preview'],
  })
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      return (
        Array.isArray(key) &&
        key[0] === 'admin' &&
        key[1] === 'events' &&
        key[3] === 'email-template-preview'
      )
    },
  })
}

export const useEmailBrandSettings = () => {
  return useQuery<EmailBrandSettings>({
    queryKey: ['settings', 'email-brand'],
    queryFn: getEmailBrandSettings,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export interface UsePatchEmailBrandSettingsOptions {
  /** When true, suppresses both the success and the error toast. Used by
   * orchestrated callers (e.g. EmailIdentityMenu via the master Save of
   * the email editor) where feedback is surfaced as a single aggregated
   * toast in the parent rather than per-leg. */
  silent?: boolean
}

export const usePatchEmailBrandSettings = (
  options: UsePatchEmailBrandSettingsOptions = {},
) => {
  const queryClient = useQueryClient()
  const { silent = false } = options

  return useMutation<EmailBrandSettings, unknown, EmailBrandSettingsPatch>({
    mutationFn: patchEmailBrandSettings,
    onSuccess: (dto) => {
      if (silent) {
        // Plan 2 (review EH1) — un PATCH debouncé toutes les 200 ms en pleine
        // frappe ferait spammer un GET par invalidation, créant des refetches
        // parasitiques qui re-render et peuvent rebuilder le canvas pendant
        // que l'utilisateur tape. On écrit directement la réponse serveur
        // dans le cache pour éviter le round-trip GET inutile.
        queryClient.setQueryData(['settings', 'email-brand'], dto)
      } else {
        queryClient.invalidateQueries({ queryKey: ['settings', 'email-brand'] })
      }
      invalidateAllTemplatePreviews(queryClient)
      // Plan 2 post-smoke P2 (2026-05-23) — le shell résolu côté serveur
      // (editor-context) inclut le brand.logoUrl dans la branche hardcoded
      // fallback du header. Sans invalidation, le canvas garde l'ancien
      // header après PATCH brand.logoUrl. On invalide systématiquement
      // (silent inclus) : la requête editor-context est peu fréquente,
      // un seul refetch par PATCH brand est tolérable.
      queryClient.invalidateQueries({ queryKey: ['admin', 'editor-context'] })
      if (!silent) {
        toast.success("Paramètres d'identité visuelle sauvegardés")
      }
    },
    onError: (err: unknown) => {
      if (silent) return
      toast.error(extractErrorMessage(err, 'Erreur lors de la sauvegarde'))
    },
  })
}

export const useResetEmailBrandSettings = () => {
  const queryClient = useQueryClient()

  return useMutation<EmailBrandSettings, unknown, void>({
    mutationFn: resetEmailBrandSettings,
    onSuccess: (dto) => {
      // Reset immédiat (D2) — on écrit directement la DTO factory renvoyée
      // par le serveur dans le cache. Mêmes invalidations que le PATCH
      // non-silent (previews + editor-context) pour que le canvas se
      // reconstruise avec le brand d'usine.
      queryClient.setQueryData(['settings', 'email-brand'], dto)
      invalidateAllTemplatePreviews(queryClient)
      queryClient.invalidateQueries({ queryKey: ['admin', 'editor-context'] })
      toast.success('Identité visuelle réinitialisée')
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err, 'Erreur lors de la réinitialisation'))
    },
  })
}
