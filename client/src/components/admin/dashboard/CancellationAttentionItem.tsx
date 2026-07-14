import { Link } from 'react-router-dom'
import { AlertTriangle, Send, ChevronRight } from 'lucide-react'
import {
  useCancellationNotifications,
  useResendCancellationNotifications,
} from '@/hooks/useCancellationNotifications'
import { Button } from '@/components/ui/button'
import { AttentionRow } from './AttentionRow'

/**
 * Alerte d'annulation intégrée à la zone « À traiter » (remplace la carte autonome
 * CancellationNotificationsCard). En tête de zone, ton ambre (sévérité la plus haute).
 * N'apparaît que si des notifications sont en attente (panne d'envoi). Réutilise les
 * hooks existants ; aucun travail serveur.
 */
export function CancellationAttentionItem() {
  const { data } = useCancellationNotifications()
  const resend = useResendCancellationNotifications()

  const pending = data?.pending ?? 0
  if (pending === 0) return null

  const events = data?.events ?? []
  const plural = pending > 1
  const message =
    `${pending} notification${plural ? 's' : ''} d'annulation ${plural ? "n'ont" : "n'a"} ` +
    `pas pu être envoyée${plural ? 's' : ''} — participant${plural ? 's' : ''} non prévenu${plural ? 's' : ''}`

  return (
    <AttentionRow
      tone="warning"
      role="alert"
      data-testid="cancellation-attention-item"
      icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
      action={
        <Button
          onClick={() => resend.mutate(undefined)}
          disabled={resend.isPending}
          variant="outline-warning"
          size="sm"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {resend.isPending ? 'Renvoi en cours...' : 'Tout renvoyer'}
        </Button>
      }
    >
      <span className="text-body-sm font-medium">{message}</span>
      <ul className="mt-2 space-y-1">
        {events.map((event) => (
          <li key={event.eventId}>
            <Link
              to={`/admin/events/${event.eventId}/edit#emails`}
              className="inline-flex items-center gap-1 text-sm text-amber-800 hover:underline"
            >
              {event.eventName} · {event.pendingCount} en attente
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </AttentionRow>
  )
}
