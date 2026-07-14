import { useState, useEffect, useCallback, useRef } from 'react'
import api from '@/services/api'
import { DEFAULT_SESSION_TTL } from './useMagicLinkConfig'

/**
 * Clés localStorage pour la persistance de session
 */
const LOGIN_TIME_KEY = 'loginTime'
const SESSION_TTL_KEY = 'sessionTTL'

/**
 * Seuils d'avertissement en secondes
 * Exportés pour être réutilisés dans AdminLayout
 */
const WARNING_THRESHOLD = 300 // 5 minutes
const CRITICAL_THRESHOLD = 60  // 1 minute

/**
 * Interface pour l'état du timeout de session
 */
export interface SessionTimeoutState {
  timeRemaining: number    // Secondes restantes
  isExpiringSoon: boolean  // T-5min ou moins
  isCritical: boolean      // T-1min ou moins
  isExpired: boolean       // T-0
  refreshSession: () => Promise<void>
}

/**
 * Charge loginTime et sessionTTL depuis localStorage.
 * Fonction pure (hors composant) : sert aussi d'init paresseux du state.
 */
function loadSessionData(): { loginTime: number | null; ttl: number | null } {
  const loginTimeStr = localStorage.getItem(LOGIN_TIME_KEY)
  const ttlStr = localStorage.getItem(SESSION_TTL_KEY)

  return {
    loginTime: loginTimeStr ? parseInt(loginTimeStr, 10) : null,
    ttl: ttlStr ? parseInt(ttlStr, 10) : null
  }
}

/**
 * Calcule le temps restant (en secondes) à partir des données de session.
 */
function calculateTimeRemaining(): number {
  const { loginTime, ttl } = loadSessionData()

  if (!loginTime || !ttl) {
    return 0
  }

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = loginTime + ttl
  return Math.max(0, expiresAt - now)
}

/**
 * Hook pour gérer le timeout de session avec avertissements et prolongation
 *
 * Ce hook :
 * - Calcule le temps restant basé sur loginTime et sessionTTL stockés
 * - Met à jour l'état chaque seconde
 * - Permet de prolonger la session via refreshSession
 * - Gère la persistance au rechargement de page
 *
 * @returns État du timeout de session et fonction de rafraîchissement
 */
export function useSessionTimeout(): SessionTimeoutState {
  // Init paresseux depuis localStorage : pose la bonne valeur dès le 1er rendu
  // et évite un setState dans l'effet (et le double-rendu associé).
  const [timeRemaining, setTimeRemaining] = useState<number>(() => calculateTimeRemaining())
  const [sessionTTL] = useState<number>(() => loadSessionData().ttl || 0)
  const intervalRef = useRef<number | null>(null)

  // Mettre à jour le temps restant chaque seconde
  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      setTimeRemaining(calculateTimeRemaining())
    }, 1000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  // Fonction pour prolonger la session
  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const response = await api.post<{ data: { token: string, expiresAt: number } }>('/auth/refresh')
      const { token, expiresAt } = response.data.data

      // Garde-fou: s'assurer que sessionTTL est valide
      const ttlToUse = sessionTTL > 0 ? sessionTTL : DEFAULT_SESSION_TTL

      // Stocker le nouveau token
      localStorage.setItem('auth_token', token)

      // Calculer et stocker le nouveau loginTime
      // NOTE: Ce calcul suppose que le sessionTTL n'a pas changé côté serveur.
      // Si le TTL a changé, le timer sera décalé mais restera fonctionnel.
      const newLoginTime = expiresAt - ttlToUse
      localStorage.setItem(LOGIN_TIME_KEY, newLoginTime.toString())

      // Mettre à jour immédiatement
      setTimeRemaining(calculateTimeRemaining())
    } catch (error) {
      console.error('Erreur lors du rafraîchissement de la session:', error)
      // En cas d'erreur, on considère la session comme expirée
      setTimeRemaining(0)
    }
  }, [sessionTTL])

  // Calculer les états dérivés
  const isExpiringSoon = timeRemaining > 0 && timeRemaining <= WARNING_THRESHOLD
  const isCritical = timeRemaining > 0 && timeRemaining <= CRITICAL_THRESHOLD
  const isExpired = timeRemaining === 0

  return {
    timeRemaining,
    isExpiringSoon,
    isCritical,
    isExpired,
    refreshSession
  }
}

/**
 * Helper pour initialiser les données de session après connexion
 * À appeler après un login réussi
 */
export function initializeSessionData(sessionTTL: number): void {
  const now = Math.floor(Date.now() / 1000)
  localStorage.setItem(LOGIN_TIME_KEY, now.toString())
  localStorage.setItem(SESSION_TTL_KEY, sessionTTL.toString())
}

/**
 * Helper pour nettoyer les données de session après déconnexion
 */
export function clearSessionData(): void {
  localStorage.removeItem(LOGIN_TIME_KEY)
  localStorage.removeItem(SESSION_TTL_KEY)
}
