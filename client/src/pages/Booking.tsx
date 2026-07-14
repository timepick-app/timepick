import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Typography } from '@/components/ui/typography'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAuth } from '../hooks/useAuth'

/**
 * Page de repli pour les membres authentifiés atteignant `/` ou `/booking`.
 *
 * L'accès aux créneaux d'un événement se fait exclusivement via le lien
 * d'invitation, qui redirige le membre vers son espace `/me/events/:uuid`.
 * Cette page ne reçoit jamais d'événement ciblé : elle affiche donc toujours
 * l'état vide invitant à ouvrir le calendrier depuis l'invitation.
 */
export default function Booking() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth()

  useDocumentTitle()

  // Redirige vers la connexion si l'utilisateur n'est pas authentifié
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Attend la vérification d'authentification avant de rendre la page
  if (isAuthLoading) {
    return (
      <Layout user={undefined}>
        <div className="space-y-6">
          <Typography variant="h1">Calendrier des Permanences</Typography>
          <div className="p-8 text-center">Chargement...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout user={user}>
      <div className="space-y-6">
        <Typography variant="h1">Calendrier des Permanences</Typography>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-600">
          Aucun événement sélectionné. Ouvrez le calendrier depuis le lien de votre invitation.
        </div>
      </div>
    </Layout>
  )
}
