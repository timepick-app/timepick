import { useQuery } from '@tanstack/react-query'
import { getPublicOrganization } from '@/services/organization.service'

/**
 * Clé de cache **contractuelle** : le panneau Paramètres → Organisation
 * l'invalide après enregistrement pour que la façade et l'en-tête public
 * reflètent immédiatement la nouvelle identité. Ne pas renommer.
 */
export const PUBLIC_ORGANIZATION_QUERY_KEY = ['public', 'organization'] as const

/** L'identité change rarement — 5 min de fraîcheur suffisent. */
const PUBLIC_ORGANIZATION_STALE_TIME_MS = 5 * 60_000

/**
 * Identité publique de l'organisation (nom / logo / description + bascule façade).
 *
 * `retry: false` est délibéré : les deux consommateurs ont un repli immédiat et
 * sûr (façade → `/login`, en-tête → « TimePick »). Retenter trois fois avec
 * backoff maintiendrait la racine sur un écran vide plusieurs secondes pour
 * n'aboutir qu'au même repli.
 */
export function usePublicOrganization({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: PUBLIC_ORGANIZATION_QUERY_KEY,
    queryFn: getPublicOrganization,
    staleTime: PUBLIC_ORGANIZATION_STALE_TIME_MS,
    retry: false,
    enabled,
  })
}
