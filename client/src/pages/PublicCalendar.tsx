import { useParams, Navigate } from 'react-router-dom'
import { EventCalendarContent } from '@/components/public'
import { useAuth } from '@/hooks/useAuth'

/**
 * Page calendrier public — réservée aux non-membres.
 *
 * - Anonyme : voit la page publique (carte « Accès réservé », pas de calendrier).
 * - Membre non-admin : redirigé vers son espace `/me/events/:uuid`.
 * - Admin : reste sur la page publique (aperçu de contrôle).
 *
 * @see EventCalendarContent — corps réutilisable (header injectable)
 */
export function PublicCalendar() {
  const { uuid } = useParams<{ uuid: string }>()
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return null

  if (isAuthenticated && user?.role !== 'admin' && uuid) {
    return <Navigate to={`/me/events/${uuid}`} replace />
  }

  return <EventCalendarContent uuid={uuid ?? ''} />
}
