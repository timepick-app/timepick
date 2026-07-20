import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSmtpSettings,
  saveSmtpSettings,
  testSmtpConnection,
  clearSmtpSettings,
  getAdminHealth,
  type SmtpSettings,
  type EmailSettingsPayload,
  type SmtpTestResult,
  type AdminHealthResponse,
} from '../services/settings.service'
import { toast } from 'sonner'
import { extractErrorMessage } from '@/lib/extractErrorMessage'

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
      toast.error(extractErrorMessage(err, 'Erreur lors de la sauvegarde'))
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
      toast.error(extractErrorMessage(err, 'Erreur lors du test'))
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
      toast.error(extractErrorMessage(err, 'La désactivation a échoué. Votre configuration reste active.'))
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
