import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * RootRedirect — aiguilleur pur de la racine `/`.
 *
 * Généralise à l'atterrissage direct la règle de redirection post-login D4
 * (story 1.4) : chaque visiteur est renvoyé vers sa « maison ».
 *
 * - `isLoading` → null (pas de flash pendant la réhydratation du token).
 * - non authentifié → `/login`. Si l'instance est vierge, `SetupRedirect`
 *   (monté au niveau App) reprend ensuite la main vers `/setup` — même
 *   enchaînement que l'ancienne page de repli, couvert par
 *   `SetupRedirect.integration.test.tsx`.
 * - membre → `/me` (Mon agenda) ; admin → `/admin` (Tableau de bord).
 *
 * Remplace la page résiduelle `Booking` (« Calendrier des Permanences »,
 * état vide permanent hérité du commit initial). Contexte et suites :
 * docs/2026-07-26-note-page-racine-identite-organisation.md.
 * Pattern identique à `AdminGuard` (garde pure, aucun chrome).
 */
export function RootRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/me'} replace />
}
