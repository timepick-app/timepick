import { useCallback, useEffect, useRef } from 'react'

/**
 * Hook pour gérer le long-press sur mobile
 * Story 19.6: Support touch pour les tooltips
 *
 * NOTE: Ce hook est conçu pour les composants React classiques.
 * Pour FullCalendar, on utilise une implémentation inline car les événements
 * sont des éléments DOM générés dynamiquement (pas des composants React).
 *
 * @param callback - Fonction à appeler après le long-press
 * @param duration - Durée en ms avant déclenchement (défaut: 500ms)
 * @returns Objet avec les handlers d'événements touch à attacher
 */
export function useLongPress(
  callback: () => void,
  duration = 500
): {
  onTouchStart: () => void
  onTouchEnd: () => void
  onTouchCancel: () => void
} {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)

  // Garder la callback à jour (mise à jour hors rendu : la ref n'est lue que
  // dans les handlers/timeout, jamais pendant le rendu).
  useEffect(() => {
    callbackRef.current = callback
  })

  const start = useCallback(() => {
    timerRef.current = setTimeout(() => {
      callbackRef.current()
    }, duration)
  }, [duration])

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return {
    onTouchStart: start,
    onTouchEnd: stop,
    onTouchCancel: stop,
  }
}
