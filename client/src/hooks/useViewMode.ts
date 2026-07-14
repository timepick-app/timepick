import { useState, useCallback } from 'react'

/**
 * View mode type for event display
 * Story 19.5: Extended to include 'week' view
 */
export type ViewMode = 'calendar' | 'week' | 'list'

/**
 * Current storage version
 */
const STORAGE_VERSION = 1

/**
 * Result type for useViewMode hook
 */
export interface ViewModeResult {
  /** Current view mode ('calendar', 'week', or 'list') */
  viewMode: ViewMode
  /** Function to update the view mode */
  setViewMode: (mode: ViewMode) => void
}

/**
 * Valid view modes for validation
 * Story 19.5: Extended to include 'week'
 */
const VALID_VIEW_MODES: ViewMode[] = ['calendar', 'week', 'list']

/**
 * Get the default view mode based on screen width
 * Mobile (< 768px) -> list, Desktop (>= 768px) -> calendar
 */
function getDefaultViewMode(): ViewMode {
  // SSR fallback - return calendar as safe default
  if (typeof window === 'undefined') {
    return 'calendar'
  }
  // Mobile gets list view, desktop gets calendar view
  return window.innerWidth < 768 ? 'list' : 'calendar'
}

/**
 * Lit et valide le mode de vue persisté dans localStorage pour l'événement.
 *
 * Lecture SYNCHRONE : appelée depuis l'initialiseur paresseux du `useState` afin
 * que le premier rendu utilise DÉJÀ la valeur persistée. Cela supprime le
 * bascule post-mount (anciennement dans un `useEffect`) qui provoquait un
 * remontage complet de `<CalendarView key={viewMode}>` et donc le « flash de
 * reconstruction » blanc sur la navigation membre.
 *
 * @param eventUuid - UUID de l'événement (namespacing localStorage)
 * @returns Le mode validé persisté, ou `getDefaultViewMode()` si absent/invalide
 */
function readStoredViewMode(eventUuid: string | null | undefined): ViewMode {
  // Pas d'UUID -> on conserve le défaut responsive
  if (!eventUuid) {
    return getDefaultViewMode()
  }

  const storageKey = `timepick-view-mode-${eventUuid}`

  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)

      // Validate storage structure
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'version' in parsed &&
        'mode' in parsed
      ) {
        const storage = parsed as { version: number; mode: string }

        // Validate version and mode
        if (
          storage.version === STORAGE_VERSION &&
          typeof storage.mode === 'string' &&
          VALID_VIEW_MODES.includes(storage.mode as ViewMode)
        ) {
          return storage.mode as ViewMode
        } else {
          // Version mismatch or invalid mode, use default
          if (import.meta.env.DEV) {
            console.warn('Invalid view mode storage version or mode, using default')
          }
        }
      }
    }
  } catch (error) {
    // Gracefully handle localStorage errors (private browsing, quota exceeded, etc.)
    if (import.meta.env.DEV) {
      console.warn('Failed to load view mode from localStorage:', error)
    }
  }

  return getDefaultViewMode()
}

/**
 * Hook useViewMode for managing view mode state with localStorage persistence
 *
 * The view mode is stored in localStorage with event-UUID namespacing
 * to support per-event view preferences. Gracefully handles localStorage
 * errors (e.g., private browsing mode, quota exceeded).
 *
 * First-time visitors get a responsive default based on screen width:
 * - Mobile (< 768px) -> list view
 * - Desktop (>= 768px) -> calendar view
 *
 * The persisted value is read SYNCHRONOUSLY during the first render (no
 * post-mount effect), so the very first paint already reflects the user's
 * preference — this avoids the white "flash de reconstruction" caused by
 * remounting `<CalendarView key={viewMode}>` when a `useEffect` flipped the
 * mode after mount.
 *
 * @param eventUuid - UUID of the event for namespacing localStorage
 * @returns Object with viewMode state, setViewMode function, and isInitialized flag
 *
 * @example
 * const { viewMode, setViewMode, isInitialized } = useViewMode(eventUuid)
 *
 * // View mode is loaded from localStorage synchronously on first render
 * // isInitialized is always true (synchronous read)
 *
 * // Switch to list view
 * setViewMode('list')
 */
export function useViewMode(eventUuid: string | null | undefined): ViewModeResult {
  // Lecture SYNCHRONE dans l'initialiseur paresseux : le premier rendu utilise
  // déjà la valeur persistée (anti-flash, plus de bascule post-mount).
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    readStoredViewMode(eventUuid),
  )

  // Réagit aux changements d'eventUuid SANS effet post-commit : on ajuste l'état
  // pendant le rendu (pattern React « adjust state during render ») afin de
  // re-rendre AVANT le commit DOM -> aucun remontage visible lors de la
  // navigation entre événements.
  const [prevUuid, setPrevUuid] = useState(eventUuid)
  if (eventUuid !== prevUuid) {
    setPrevUuid(eventUuid)
    setViewModeState(readStoredViewMode(eventUuid))
  }

  // setViewMode function with localStorage persistence
  const setViewMode = useCallback((mode: ViewMode) => {
    // Validate mode
    if (!VALID_VIEW_MODES.includes(mode)) {
      if (import.meta.env.DEV) {
        console.warn(`Invalid view mode: ${mode}. Must be 'calendar', 'week', or 'list'.`)
      }
      return
    }

    // Update state immediately
    setViewModeState(mode)

    // Skip localStorage persistence if no event UUID
    if (!eventUuid) {
      return
    }

    const storageKey = `timepick-view-mode-${eventUuid}`

    try {
      const storage: { version: number; mode: string } = {
        version: STORAGE_VERSION,
        mode,
      }
      localStorage.setItem(storageKey, JSON.stringify(storage))
    } catch (error) {
      // Gracefully handle localStorage errors (silent fallback)
      if (import.meta.env.DEV) {
        console.warn('Failed to save view mode to localStorage:', error)
      }
      // State is already updated, so the view mode works for current session
    }
  }, [eventUuid])

  return {
    viewMode,
    setViewMode,
  }
}
