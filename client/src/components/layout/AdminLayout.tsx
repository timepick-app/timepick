import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import { SessionWarningToast } from './SessionWarningToast'
import { SessionExpiredModal } from './SessionExpiredModal'
import { AppShell } from './AppShell'
import { getStaticTitle, isAdminEventEditRoute } from '@/config/pageTitle'

interface AdminLayoutProps {
  children: React.ReactNode
}

/**
 * AdminLayout — wrapper fin autour de `AppShell` pour la console admin.
 *
 * Conserve la logique session (timeout, toast/modales) et la
 * résolution du titre de page (déléguée au centralisé `@/config/pageTitle` via `getStaticTitle`, fallback admin « Administration »). Le chrome
 * (sidebar desktop, tiroir mobile, grille, titres `<main>`) est délégué à
 * `<AppShell>`. Le toast et la modale d'expiration restent frères d'`AppShell`.
 *
 * Signature `{ children }` inchangée (D1) : les 6 pages admin et leurs mocks
 * continuent de cibler `@/components/layout/AdminLayout`.
 */
export function AdminLayout({ children }: AdminLayoutProps) {
  const [showWarningToast, setShowWarningToast] = useState(false)
  const [warningDismissed, setWarningDismissed] = useState(false)
  const location = useLocation()
  // Route édition événement admin : le nom réel de l'événement est rendu en
  // <h1> par EventEditHeader → on supprime le pageTitle générique d'AppShell
  // (desktop h1 + mobile div) pour éviter le double <h1>. Miroir de MemberLayout.
  const pageTitle = isAdminEventEditRoute(location.pathname)
    ? null
    : (getStaticTitle(location.pathname) ?? 'Administration')

  const { refreshSession } = useAuth()
  const { timeRemaining, isExpiringSoon, isCritical, isExpired } = useSessionTimeout()

  // Synchroniser l'affichage du toast pendant le rendu (les gardes empêchent
  // toute boucle). Le toast s'affiche sur toute la fenêtre d'avertissement et,
  // en phase critique (T-1min), se RÉARME même s'il a été fermé : c'est le
  // dernier rappel avant déconnexion (il n'y a plus de modale critique dédiée).
  if (isExpiringSoon && (isCritical || !warningDismissed)) {
    if (!showWarningToast) setShowWarningToast(true)
  } else if (!isExpiringSoon) {
    if (showWarningToast) setShowWarningToast(false)
    if (warningDismissed) setWarningDismissed(false)
  }

  const handleRefresh = async () => {
    try {
      await refreshSession()
      setShowWarningToast(false)
      setWarningDismissed(true)
    } catch (error) {
      console.error('Erreur lors du rafraîchissement:', error)
    }
  }

  return (
    <>
      <AppShell
        pageTitle={pageTitle}
      >
        {children}
      </AppShell>
      {/* Toast d'avertissement (T-5min) qui escalade en critique à T-1min */}
      {showWarningToast && (
        <SessionWarningToast
          onRefresh={handleRefresh}
          onDismiss={() => {
            setShowWarningToast(false)
            setWarningDismissed(true)
          }}
          timeRemaining={timeRemaining}
          critical={isCritical}
        />
      )}
      {/* Modal d'expiration */}
      <SessionExpiredModal open={isExpired} />
    </>
  )
}
