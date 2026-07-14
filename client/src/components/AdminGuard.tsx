import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * AdminGuard — garde de route pure pour `/admin/*` (D9 story 1.4).
 *
 * Rendu comme layout-route (`<Route element={<AdminGuard/>}>`) au-dessus des
 * pages admin. Les pages admin restent wrappées individuellement par
 * `<AdminLayout>` (wrapper-per-page D1 story 1.1, inchangé) : AdminGuard ne
 * fournit AUCUN chrome — uniquement `<Outlet/>` ou un `<Navigate/>`.
 *
 * - `isLoading` → null (pas de flash pendant la réhydratation du token).
 * - non authentifié → `/login` (comportement attendu d'une route protégée).
 * - authentifié mais `role !== 'admin'` → `/me` (AC4 : un membre n'entre pas
 *   dans le shell admin ; le serveur applique déjà `requireAdmin` 403, ce garde
 *   évite le flash du shell cassé avant la première API call).
 * - admin → `<Outlet/>` (rend la page admin enfant).
 *
 * Pattern identique au `MemberLayout` guard (story 1.3 D11) et à `SetupGuard`.
 */
export function AdminGuard() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/me" replace />
  return <Outlet />
}
