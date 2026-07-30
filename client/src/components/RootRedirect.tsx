import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { usePublicOrganization } from '@/hooks/usePublicOrganization'
import { OrganizationHome } from '@/pages/OrganizationHome'

/**
 * RootRedirect — porte d'entrée de la racine `/`.
 *
 * Deux régimes selon le visiteur :
 *
 * **Connecté** — aiguilleur pur, inchangé. Généralise à l'atterrissage direct
 * la règle de redirection post-login D4 (story 1.4) : chaque visiteur est
 * renvoyé vers sa « maison ».
 * - `isLoading` → null (pas de flash pendant la réhydratation du token).
 * - membre → `/me` (Mon agenda) ; admin → `/admin` (Tableau de bord).
 *
 * **Anonyme** — façade de l'organisation (chantier A1, note du 2026-07-26) :
 * `/` affiche l'identité de l'organisation hébergée par l'instance plutôt que
 * de renvoyer sèchement vers `/login`. Le repli historique (`/login`) reste la
 * branche par défaut et couvre trois cas : endpoint en erreur, façade
 * désactivée (`homepage_mode = 'login'`), identité non configurée (nom vide).
 * Pendant le fetch on rend `null` — même contrat anti-flash que `isLoading`.
 *
 * Si l'instance est vierge, `SetupRedirect` (monté au niveau App) reprend
 * ensuite la main vers `/setup` — enchaînement couvert par
 * `SetupRedirect.integration.test.tsx`.
 *
 * Contexte et suites : docs/2026-07-26-note-page-racine-identite-organisation.md
 * (§1 orientation A1, §5 Q3 bascule façade, Q4 endpoint public).
 * Pattern identique à `AdminGuard` (garde pure, aucun chrome).
 */
export function RootRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth()
  // Hook appelé inconditionnellement (règles des hooks) ; `enabled` évite la
  // requête pour un visiteur connecté — y compris pendant la réhydratation du
  // token, où l'on ne sait pas encore s'il l'est.
  const organizationQuery = usePublicOrganization({ enabled: !isLoading && !isAuthenticated })

  if (isLoading) return null
  if (isAuthenticated) return <Navigate to={user?.role === 'admin' ? '/admin' : '/me'} replace />

  if (organizationQuery.isPending) return null
  if (organizationQuery.isError) return <Navigate to="/login" replace />

  const organization = organizationQuery.data
  if (!organization.homepageFacade || organization.name.trim() === '') {
    return <Navigate to="/login" replace />
  }

  return <OrganizationHome organization={organization} />
}
