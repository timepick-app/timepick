import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  getOrganizationSettings,
  saveOrganizationSettings,
  uploadOrganizationLogo,
  deleteOrganizationLogo,
  type OrganizationSettingsPayload,
} from '../services/settings.service'
import type { OrganizationSettings } from '../services/organization.service'
import { toast } from 'sonner'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import { PUBLIC_ORGANIZATION_QUERY_KEY } from './usePublicOrganization'

/** Clé de cache admin — panel de configuration (Chantier A1). */
export const ORGANIZATION_QUERY_KEY = ['admin', 'organization'] as const

// PUBLIC_ORGANIZATION_QUERY_KEY (importée ci-dessus de son hook propriétaire) :
// pas de copie locale — elle dériverait en silence, invalidateQueries sur une
// clé absente étant un no-op.

const invalidateOrganizationQueries = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ORGANIZATION_QUERY_KEY })
  queryClient.invalidateQueries({ queryKey: PUBLIC_ORGANIZATION_QUERY_KEY })
}

/**
 * Fetch les réglages d'organisation (admin) avec React Query.
 * Cache de 5 minutes — la configuration change rarement.
 */
export const useOrganizationSettings = () => {
  return useQuery<OrganizationSettings>({
    queryKey: ORGANIZATION_QUERY_KEY,
    queryFn: getOrganizationSettings,
    staleTime: 5 * 60 * 1000,
    refetchInterval: false,
    retry: false,
  })
}

/**
 * Mutation de sauvegarde (nom / description / mode page d'accueil).
 * Invalide le cache admin ET le cache de la façade publique.
 */
export const useUpdateOrganizationSettings = () => {
  const queryClient = useQueryClient()

  return useMutation<OrganizationSettings, unknown, OrganizationSettingsPayload>({
    mutationFn: saveOrganizationSettings,
    onSuccess: () => {
      invalidateOrganizationQueries(queryClient)
      toast.success("Paramètres de l'organisation enregistrés")
    },
    onError: (err: unknown) => {
      toast.error(userFacingErrorMessage(err, "L'enregistrement de l'identité de l'organisation a échoué. Vos modifications sont toujours à l'écran, réessayez."))
    },
  })
}

/**
 * Mutation de téléversement du logo — part immédiatement à la sélection
 * du fichier (pas de bouton Enregistrer dédié pour le logo).
 */
export const useUploadOrganizationLogo = () => {
  const queryClient = useQueryClient()

  return useMutation<{ logo: string }, unknown, File>({
    mutationFn: uploadOrganizationLogo,
    onSuccess: () => {
      invalidateOrganizationQueries(queryClient)
      toast.success('Logo mis à jour')
    },
    onError: (err: unknown) => {
      toast.error(userFacingErrorMessage(err, "Le téléversement du logo a échoué. Le logo actuel n'a pas été modifié, réessayez."))
    },
  })
}

/**
 * Mutation de suppression du logo courant.
 */
export const useDeleteOrganizationLogo = () => {
  const queryClient = useQueryClient()

  return useMutation<void, unknown, void>({
    mutationFn: deleteOrganizationLogo,
    onSuccess: () => {
      invalidateOrganizationQueries(queryClient)
      toast.success('Logo supprimé')
    },
    onError: (err: unknown) => {
      toast.error(userFacingErrorMessage(err, "La suppression a échoué. Le logo n'a pas été supprimé, réessayez."))
    },
  })
}
