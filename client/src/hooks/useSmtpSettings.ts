import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSmtpSettings,
  saveSmtpSettings,
  testSmtpConnection,
  clearSmtpSettings,
  getAdminHealth,
  getEmailProvidersCatalog,
  type SmtpSettings,
  type EmailSettingsPayload,
  type SmtpTestResult,
  type AdminHealthResponse,
  type ProviderMeta,
} from '../services/settings.service'
import { toast } from 'sonner'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'

/**
 * Catalogue des fournisseurs email HTTP (contrat §1/§3.1) — statique côté
 * serveur (descripteurs figés au déploiement), staleTime long pour éviter
 * un refetch à chaque montage. `variant` : `'admin'` (SmtpConfigPanel) ou
 * `'setup'` (wizard, endpoint public gated).
 */
export const useEmailProvidersCatalog = (variant: 'admin' | 'setup' = 'admin') => {
  return useQuery<ProviderMeta[]>({
    queryKey: ['settings', 'email-providers', variant],
    queryFn: () => getEmailProvidersCatalog(variant),
    staleTime: 24 * 60 * 60 * 1000,
    refetchInterval: false,
    retry: false,
  })
}

/**
 * Fetch SMTP settings with React Query
 * Cached for 5 minutes (config changes rarely)
 */
export const useSmtpSettings = () => {
  return useQuery<SmtpSettings>({
    queryKey: ['settings', 'smtp'],
    queryFn: getSmtpSettings,
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    retry: false,
  })
}

/**
 * Save SMTP settings mutation
 * Invalidates the settings cache on success and shows a toast
 */
export const useSaveSmtpSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveSmtpSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'smtp'] })
      toast.success('Paramètres SMTP sauvegardés')
    },
    onError: (err: unknown) => {
      toast.error(userFacingErrorMessage(err, "L'enregistrement de la configuration SMTP a échoué. Vos modifications sont toujours à l'écran, réessayez."))
    },
  })
}

/**
 * Test SMTP connection mutation
 * Shows success/failure toast based on result
 */
export const useTestSmtpConnection = () => {
  return useMutation<SmtpTestResult, unknown, EmailSettingsPayload>({
    mutationFn: testSmtpConnection,
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Connexion réussie ! Email de test envoyé.')
      } else {
        toast.error(`Échec de connexion : ${result.message}`)
      }
    },
    onError: (err: unknown) => {
      toast.error(userFacingErrorMessage(err, "Le test a échoué. Aucun email de test n'a été envoyé, réessayez."))
    },
  })
}

/**
 * Clear (disable) SMTP settings mutation — calls DELETE /api/admin/settings/smtp.
 * Invalidates both the settings cache and the admin health cache on success.
 */
export const useClearSmtpSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: clearSmtpSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'smtp'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'health'] })
      toast.success('Configuration SMTP désactivée')
    },
    onError: (err: unknown) => {
      toast.error(userFacingErrorMessage(err, 'La désactivation a échoué. Votre configuration reste active, réessayez.'))
    },
  })
}

/**
 * Admin health query — DB + SMTP status
 * 30s stale time, no auto-refetch, no retry (avoid hammering on failure).
 */
export const useAdminHealth = () => {
  return useQuery<AdminHealthResponse>({
    queryKey: ['admin', 'health'],
    queryFn: getAdminHealth,
    staleTime: 30 * 1000,
    refetchInterval: false,
    retry: false,
  })
}
