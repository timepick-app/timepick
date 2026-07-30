import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

/** Spinner partagé par les deux états de reconnexion. */
const RetrySpinner = (
  <svg
    className="w-3 h-3 animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

/**
 * Props pour le composant ConnectionStatusIndicator
 */
export interface ConnectionStatusIndicatorProps {
  /** Erreur actuelle (si présente) */
  error: Error | null | unknown
  /** Indique si un rechargement est en cours */
  isRefetching: boolean
  /** Callback pour le bouton de rechargement manuel */
  onRetry: () => void
  /** Date de la dernière mise à jour réussie (optionnel) */
  lastUpdateDate?: Date | null
  /** Nombre d'échecs consécutifs (optionnel, pour déterminer l'état) */
  failureCount?: number
  /** Classe CSS optionnelle pour le conteneur */
  className?: string
}

/**
 * ConnectionStatusIndicator Component
 *
 * Indicateur d'état de connexion pour le polling automatique.
 * Trois états possibles :
 * 1. Connected (normal) : rien n'est affiché
 * 2. Retrying : badge discret "Reconnexion..." pendant les tentatives
 * 3. Error : badge "Mise à jour indisponible" avec bouton "Réessayer" après 3 échecs
 *
 * @example
 * <ConnectionStatusIndicator
 *   error={error}
 *   isRefetching={isRefetching}
 *   onRetry={() => refetch()}
 *   lastUpdateDate={dataUpdatedAt}
 *   failureCount={failureCount}
 * />
 */
export function ConnectionStatusIndicator({
  error,
  isRefetching,
  onRetry,
  lastUpdateDate,
  failureCount = 0,
  className = '',
}: ConnectionStatusIndicatorProps) {
  // État 1 : Connected - ne rien afficher si pas d'erreur et pas de rechargement
  if (!error && !isRefetching) {
    return null
  }

  // Calculer si l'erreur est "persistante" (3 échecs ou plus)
  const isPersistentError = error !== null && failureCount >= 3

  // État 2 : Retrying - badge discret pendant les tentatives
  if (!isPersistentError && isRefetching) {
    return (
      <Badge
        appearance="soft"
        variant="warning"
        className={className}
        aria-label="Reconnexion en cours"
        icon={RetrySpinner}
      >
        Reconnexion...
      </Badge>
    )
  }

  // État 3 : Error persistante - badge avec bouton de retry
  if (isPersistentError) {
    const lastUpdateText = lastUpdateDate
      ? `Dernière mise à jour ${formatDistanceToNow(lastUpdateDate, { addSuffix: true, locale: fr })}`
      : 'Mise à jour indisponible'

    return (
      <div
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 border border-red-200',
          className
        )}
        role="status"
        aria-live="polite"
      >
        {/* Icône d'avertissement */}
        <svg
          className="w-4 h-4 flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>

        <span className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span>Mise à jour indisponible</span>
          {lastUpdateDate && (
            <span className="text-red-600 text-xs">({lastUpdateText})</span>
          )}
        </span>

        {/* Bouton de rechargement manuel */}
        <Button
          variant="outline-destructive"
          size="sm"
          onClick={onRetry}
          disabled={isRefetching}
          className="ml-1"
          aria-label="Réessayer de mettre à jour les données"
        >
          {isRefetching ? '...' : 'Réessayer'}
        </Button>
      </div>
    )
  }

  // État intermédiaire : erreur récente mais encore en train de retenter
  if (error && failureCount > 0 && failureCount < 3) {
    return (
      <Badge
        appearance="soft"
        variant="warning"
        className={className}
        aria-label="Tentative de reconnexion"
        icon={RetrySpinner}
      >
        Reconnexion... ({failureCount}/3)
      </Badge>
    )
  }

  return null
}
