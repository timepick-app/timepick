import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { AlertTriangle, Send } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  useCancellationNotifications,
  useResendCancellationNotifications,
} from '@/hooks/useCancellationNotifications'
import { formatFullName } from '@/lib/formatFullName'
import { formatTimeRangeFrench } from '@/lib/utils'

interface EventCancellationNotificationsSectionProps {
  eventId: string
}

/**
 * Surface B — Section de l'onglet « Emails » d'un événement.
 *
 * N'apparaît QUE si CET événement a des notifications d'annulation en attente.
 * Liste les créneaux annulés concernés et leurs destinataires, avec un bouton
 * « Renvoyer » scoppé à l'événement (gestion en contexte, indépendante de la
 * carte globale du Tableau de bord). Disparaît une fois tout renvoyé.
 */
export function EventCancellationNotificationsSection({
  eventId,
}: EventCancellationNotificationsSectionProps) {
  const { data } = useCancellationNotifications(eventId)
  const resend = useResendCancellationNotifications()

  const pending = data?.pending ?? 0
  const event = data?.events[0]
  if (pending === 0 || !event) return null

  const plural = pending > 1
  const formatSlot = (startISO: string, endISO: string) => {
    const start = new Date(startISO)
    return `${format(start, 'dd/MM/yyyy', { locale: fr })} · ${formatTimeRangeFrench(startISO, endISO)}`
  }

  return (
    <Card
      className="mb-6 border-amber-300 bg-amber-50"
      role="alert"
      data-testid="event-cancellation-notifications-section"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          Notifications d'annulation en attente
        </CardTitle>
        <CardDescription className="text-amber-800">
          {pending} participant{plural ? 's' : ''} de cet événement {plural ? "n'ont" : "n'a"} pas
          reçu la notification d'annulation de son créneau (panne d'envoi d'email).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {event.slots.map((slot) => (
            <li key={slot.slotId} className="rounded-md border border-amber-200 bg-white/60 p-3">
              <div className="text-sm font-medium text-gray-900">
                {formatSlot(slot.startTime, slot.endTime)}
              </div>
              <ul className="mt-2 space-y-1">
                {slot.recipients.map((recipient) => (
                  <li key={recipient.bookingId} className="text-sm text-gray-600">
                    {formatFullName(recipient.firstName, recipient.lastName) || 'Sans nom'}{' '}
                    <span className="text-gray-400">· {recipient.email}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button
            onClick={() => resend.mutate(eventId)}
            disabled={resend.isPending}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {resend.isPending ? 'Renvoi en cours...' : 'Renvoyer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
