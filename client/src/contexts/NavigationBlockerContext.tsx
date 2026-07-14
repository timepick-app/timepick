/**
 * NavigationBlockerContext
 *
 * Contexte pour bloquer la navigation quand l'utilisateur a des modifications non sauvegardees.
 * Permet d'afficher une boite de dialogue de confirmation avant de quitter une page.
 *
 * Utilisation:
 * - `blockNavigation(onConfirm)` - Enregistre un bloqueur avec gestionnaire de confirmation
 * - `unblockNavigation()` - Desenregistre le bloqueur
 * - `requestNavigation(path)` - Demande de navigation (affiche dialog si bloque)
 * - `confirmAndLeave()` - Execute le gestionnaire de confirmation (quitter la page)
 * - `cancelAndStay()` - Annule la navigation (rester sur la page)
 * - `triggerBlocker(path)` - Declenche programmatiquement le bloqueur avec un chemin
 *
 * Etats:
 * - `isBlocked` - Un bloqueur est actif
 * - `showConfirmDialog` - Le dialog de confirmation doit etre affiche
 * - `pendingPath` - Le chemin de navigation en attente
 */

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

// Types
export interface NavigationBlockerContextValue {
  /** Enregistre un bloqueur de navigation avec gestionnaire de confirmation */
  blockNavigation: (onConfirm: () => Promise<void>) => void
  /** Desenregistre le bloqueur de navigation */
  unblockNavigation: () => void
  /** Indique si la navigation est actuellement bloquee */
  isBlocked: boolean
  /** Demande de navigation vers un chemin - affiche dialog si bloque */
  requestNavigation: (path: string) => boolean
  /** Execute le gestionnaire de confirmation (quitter la page) */
  confirmAndLeave: () => Promise<void>
  /** Annule la navigation (rester sur la page) */
  cancelAndStay: () => void
  /** Indique si le dialog de confirmation doit etre affiche */
  showConfirmDialog: boolean
  /** Le chemin de navigation en attente */
  pendingPath: string | null
  /** Declenche programmatiquement le bloqueur avec un chemin de navigation */
  triggerBlocker: (path: string) => void
}

const NavigationBlockerContext = createContext<NavigationBlockerContextValue | null>(null)

// Props du provider
interface NavigationBlockerProviderProps {
  children: ReactNode
}

/**
 * NavigationBlockerProvider
 *
 * Fournit le contexte de blocage de navigation a l'application.
 * Stocke l'etat du bloqueur et le gestionnaire de confirmation.
 */
export function NavigationBlockerProvider({ children }: NavigationBlockerProviderProps) {
  const [isBlocked, setIsBlocked] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  // Utiliser un ref pour le handler pour eviter les re-renders
  const confirmationHandlerRef = useRef<(() => Promise<void>) | null>(null)

  /**
   * Enregistre un bloqueur de navigation
   * @param onConfirm - Gestionnaire appele quand l'utilisateur confirme vouloir quitter
   */
  const blockNavigation = useCallback((onConfirm: () => Promise<void>) => {
    setIsBlocked(true)
    confirmationHandlerRef.current = onConfirm
  }, [])

  /**
   * Desenregistre le bloqueur de navigation
   */
  const unblockNavigation = useCallback(() => {
    setIsBlocked(false)
    confirmationHandlerRef.current = null
    setShowConfirmDialog(false)
    setPendingPath(null)
  }, [])

  /**
   * Demande de navigation vers un chemin
   * @param path - Le chemin de destination
   * @returns true si la navigation est autorisee, false si bloquee
   */
  const requestNavigation = useCallback((path: string): boolean => {
    if (isBlocked) {
      setPendingPath(path)
      setShowConfirmDialog(true)
      return false
    }
    return true
  }, [isBlocked])

  /**
   * Execute le gestionnaire de confirmation (quitter la page)
   */
  const confirmAndLeave = useCallback(async () => {
    if (confirmationHandlerRef.current) {
      await confirmationHandlerRef.current()
    }
    // Reset tous les etats
    setIsBlocked(false)
    confirmationHandlerRef.current = null
    setShowConfirmDialog(false)
    setPendingPath(null)
  }, [])

  /**
   * Annule la navigation (rester sur la page)
   */
  const cancelAndStay = useCallback(() => {
    setShowConfirmDialog(false)
    setPendingPath(null)
  }, [])

  /**
   * Declenche programmatiquement le bloqueur avec un chemin de navigation
   * @param path - Le chemin de navigation a bloquer
   */
  const triggerBlocker = useCallback((path: string) => {
    setPendingPath(path)
    setShowConfirmDialog(true)
  }, [])

  const value: NavigationBlockerContextValue = {
    blockNavigation,
    unblockNavigation,
    isBlocked,
    requestNavigation,
    confirmAndLeave,
    cancelAndStay,
    showConfirmDialog,
    pendingPath,
    triggerBlocker,
  }

  return (
    <NavigationBlockerContext.Provider value={value}>
      {children}
    </NavigationBlockerContext.Provider>
  )
}

/**
 * Hook pour utiliser le contexte de blocage de navigation
 * @throws {Error} Si utilise hors du NavigationBlockerProvider
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook d'accès au contexte, co-localisé avec NavigationBlockerProvider ; l'extraire casserait les mocks par chemin (~5 fichiers de test) pour un gain HMR nul. Confort HMR uniquement, pas de correctness.
export function useNavigationBlocker(): NavigationBlockerContextValue {
  const context = useContext(NavigationBlockerContext)
  if (!context) {
    throw new Error('useNavigationBlocker must be used within a NavigationBlockerProvider')
  }
  return context
}
