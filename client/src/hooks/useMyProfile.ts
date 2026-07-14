import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import api from '@/services/api'
import type { ApiPatchMyProfileInput } from '@/types/user'

/**
 * Profil membre renvoyé par `GET /api/me/profile` (forme camelCase après
 * conversion par `snakeToCamelMiddleware`).
 *
 * Miroir du type serveur (`MyProfileRow` dans `server/src/services/me.service.ts`).
 * `hasMemberAccess` n'est PAS renvoyé par /me/profile (déjà connu côté client via
 * `useAuth().user` et recalculé par `requireAuth` à chaque requête).
 */
export interface MyProfile {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  profession: string | null
  informations: string | null
  phone: string | null
  role: 'user' | 'admin'
  createdAt: string
  updatedAt?: string
}

/**
 * useMyProfile — charge le profil complet du membre connecté via
 * `GET /me/profile`.
 *
 * - `queryKey: ['me', 'profile']` (cohérent avec `['me', 'events']`).
 * - `staleTime: 30 s` : la donnée change rarement, mais reste fraîche assez
 *   longtemps pour qu'un re-mount immédiat (ex. navigation sidebar) ne relance
 *   pas de requête inutile.
 * - NE PAS réutiliser `useUserDetails` (`GET /admin/users/:id`, admin-only → 403).
 * - Le GET est requis : le payload de login omet `phone`/`profession`/
 *   `informations`, donc `useAuth().user` ne peut pas pré-remplir le formulaire
 *   (smoke CP4).
 */
export function useMyProfile() {
  return useQuery<MyProfile>({
    queryKey: ['me', 'profile'],
    queryFn: async () => {
      const { data } = await api.get('/me/profile')
      return data.data as MyProfile
    },
    staleTime: 30 * 1000,
    retry: (failureCount, error) => {
      const err = error as AxiosError
      return failureCount < 3 && err.response?.status !== 401
    },
  })
}

/**
 * useUpdateMyProfile — met à jour le profil membre via `PATCH /me/profile`.
 *
 * Réécrit directement le cache `['me', 'profile']` (`setQueryData`) avec la
 * réponse serveur plutôt que d'invalider : pas de refetch, la donnée est déjà
 * fraîche (source de vérité serveur). L'espace membre est isolé : on ne touche
 * JAMAIS au cache `['users']` (admin).
 *
 * NE PAS réutiliser `useUpdateUser` (`PUT /admin/users/:id`, admin-only → 403).
 */
export function useUpdateMyProfile() {
  const queryClient = useQueryClient()
  return useMutation<MyProfile, Error, ApiPatchMyProfileInput>({
    mutationFn: async (input) => {
      const { data } = await api.patch('/me/profile', input)
      return data.data as MyProfile
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['me', 'profile'], data)
    },
  })
}
