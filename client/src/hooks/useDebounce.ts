import { useEffect, useState } from 'react'

/**
 * useDebounce Hook
 *
 * Retourne une valeur débondée après un délai spécifié.
 * Utile pour retarder les appels API lors de la frappe utilisateur.
 *
 * @param value - La valeur à débonder
 * @param delay - Le délai en millisecondes (défaut: 300ms)
 * @returns La valeur débondée
 *
 * @example
 * const [search, setSearch] = useState('')
 * const debouncedSearch = useDebounce(search, 300)
 *
 * useEffect(() => {
 *   // Cette effet ne s'exécute que 300ms après que search a changé
 *   fetchResults(debouncedSearch)
 * }, [debouncedSearch])
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Créer un timer qui met à jour la valeur débondée après le délai
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Nettoyer le timer si la valeur change avant la fin du délai
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
