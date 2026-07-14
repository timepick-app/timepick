import { AlertTriangle, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SessionWarningToastProps {
  onRefresh: () => void
  onDismiss: () => void
  timeRemaining: number
  critical?: boolean
}

/**
 * SessionWarningToast - Toast d'avertissement d'expiration de session.
 *
 * Deux niveaux d'escalade dans le même composant :
 * - Avertissement (T-5min) : orange, fermable, « Prolonger de 2h ».
 * - Critique (T-1min) : rouge, NON fermable (l'utilisateur doit prolonger
 *   ou sera déconnecté), affiche les secondes et rappelle de sauvegarder.
 */
export function SessionWarningToast({ onRefresh, onDismiss, timeRemaining, critical = false }: SessionWarningToastProps) {
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  // En mode critique (≤ 60s) minutes = 0, on affiche uniquement les secondes.
  const criticalLabel = `${seconds} seconde${seconds > 1 ? 's' : ''}`

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div
        role={critical ? 'alert' : 'status'}
        className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[320px] max-w-md',
          critical
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-orange-50 border-orange-200 text-orange-800',
        )}
      >
        {critical ? (
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        ) : (
          <Clock className="h-5 w-5 flex-shrink-0" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">
            {critical
              ? `Votre session expire dans ${criticalLabel}`
              : `Votre session expire dans ${minutes} minute${minutes > 1 ? 's' : ''}`}
          </p>
          {critical && (
            <p className="text-xs mt-0.5">Sauvegardez votre travail !</p>
          )}
        </div>
        <Button
          onClick={onRefresh}
          size="sm"
          className={cn(
            'text-white h-7',
            critical ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700',
          )}
        >
          {critical ? 'Prolonger maintenant' : 'Prolonger de 2h'}
        </Button>
        {!critical && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            aria-label="Fermer"
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
