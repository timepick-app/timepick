/**
 * Props pour le composant PollingIndicator
 */
export interface PollingIndicatorProps {
  /** Indique si un rechargement est en cours */
  isRefetching: boolean
  /** Classe CSS optionnelle pour le conteneur */
  className?: string
}

/**
 * PollingIndicator Component
 *
 * Indicateur visuel subtil affiché pendant le rechargement automatique des données.
 * Utilise `isRefetching` de React Query qui est true uniquement pendant les
 * rechargements en arrière-plan (pas lors du premier chargement).
 *
 * @example
 * <PollingIndicator isRefetching={isRefetching} />
 */
export function PollingIndicator({ isRefetching, className = '' }: PollingIndicatorProps) {
  // Ne pas afficher si pas de rechargement
  if (!isRefetching) {
    return null
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200 animate-pulse ${className}`}
      aria-label="Mise à jour des données en cours"
    >
      <svg
        className="h-3 w-3 md:h-4 md:w-4 animate-spin" // Mobile: 12px, Desktop: 16px (25% reduction)
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      Mise à jour...
    </span>
  )
}
