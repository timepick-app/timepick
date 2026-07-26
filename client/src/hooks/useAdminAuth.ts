import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

/**
 * Hook pour vérifier l'authentification admin côté client.
 *
 * IMPORTANT: Ceci est une vérification UX uniquement pour améliorer
 * l'expérience utilisateur (redirection rapide). La véritable sécurité
 * est assurée par le middleware requireAdmin sur le serveur.
 *
 * Redirige vers /auth/login si non authentifié,
 * ou vers /me si authentifié mais pas admin (aligné sur AdminGuard, AC12).
 *
 * NOTE: Uses AuthProvider context (useAuth) instead of reading localStorage
 * directly to avoid race conditions and ensure a single source of truth.
 */
export function useAdminAuth() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading } = useAuth()
  // Dérivé pendant le rendu : l'accès admin est validé dès que l'auth est chargée.
  // Évite un setState dans l'effet (et le double-rendu associé) tout en préservant
  // exactement la condition d'origine (authentifié + rôle admin).
  const isAuthChecked = !isLoading && isAuthenticated && user?.role === 'admin'
  const hasNavigatedRef = useRef(false)

  useEffect(() => {
    // Wait for AuthProvider to finish loading
    if (isLoading) return

    // Prevent multiple navigations if effect runs multiple times
    if (hasNavigatedRef.current) return

    if (!isAuthenticated) {
      hasNavigatedRef.current = true
      navigate('/login', { replace: true })
      return
    }

    // Check if user has admin role
    if (user?.role !== 'admin') {
      hasNavigatedRef.current = true
      navigate('/me', { replace: true })
      return
    }

    // Cleanup function to reset navigation flag on unmount
    return () => {
      hasNavigatedRef.current = false
    }
  }, [navigate, isAuthenticated, user, isLoading])

  return { isAuthChecked }
}
