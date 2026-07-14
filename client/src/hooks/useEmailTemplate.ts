import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getEmailTemplate,
  patchEmailTemplate,
  resetAllEmailTemplates,
  type ResetAllEmailTemplatesResult,
  type TemplateKey,
  type TemplateForKey,
  type PatchForKey,
} from '../services/email-templates.service'
import { toast } from 'sonner'
import { extractErrorMessage } from '@/lib/extractErrorMessage'

export const emailTemplateQueryKey = (templateKey: TemplateKey) =>
  ['settings', 'email-template', templateKey] as const

export const emailTemplatePreviewQueryKey = (templateKey: TemplateKey) =>
  ['settings', 'email-template-preview', templateKey] as const

const STALE_TIME_MS = 5 * 60 * 1000

export const useEmailTemplate = <K extends TemplateKey>(templateKey: K) =>
  useQuery<TemplateForKey<K>>({
    queryKey: emailTemplateQueryKey(templateKey),
    queryFn: () => getEmailTemplate(templateKey),
    staleTime: STALE_TIME_MS,
    retry: false,
  })

export const usePatchEmailTemplate = <K extends TemplateKey>(templateKey: K) => {
  const queryClient = useQueryClient()
  return useMutation<TemplateForKey<K>, unknown, PatchForKey<K>>({
    mutationFn: (patch) => patchEmailTemplate(templateKey, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailTemplateQueryKey(templateKey) })
      queryClient.invalidateQueries({
        queryKey: emailTemplatePreviewQueryKey(templateKey),
      })
      queryClient.invalidateQueries({ queryKey: ['admin', 'editor-context'] })
    },
  })
}

export const useResetAllEmailTemplates = () => {
  const queryClient = useQueryClient()
  return useMutation<ResetAllEmailTemplatesResult, unknown, void>({
    mutationFn: resetAllEmailTemplates,
    onSuccess: () => {
      // Shared design + 4 bodies back to factory: refresh canvas/cascade γ (4
      // tabs), template DTOs, template previews — by prefix. NOT brand (preserved).
      queryClient.invalidateQueries({ queryKey: ['admin', 'editor-context'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'email-template'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'email-template-preview'] })
      toast.success('Tous les modèles d’emails ont été réinitialisés.')
    },
    onError: (err: unknown) => {
      toast.error(extractErrorMessage(err, 'Erreur lors de la réinitialisation des modèles'))
    },
  })
}

