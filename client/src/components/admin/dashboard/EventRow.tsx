import type { HTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ExternalLink, Settings, Send } from 'lucide-react'
import type { Event } from '@/hooks/useEvents'
import { usePublishEvent, getEventPublicUrl } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'
import { deriveEventStatus, type EventStatusKey } from '@/lib/dashboard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<EventStatusKey, { variant: 'draft' | 'info' | 'success' | 'default'; label: string }> = {
  draft: { variant: 'draft', label: 'Brouillon' },
  upcoming: { variant: 'info', label: 'À venir' },
  ongoing: { variant: 'success', label: 'En cours' },
  past: { variant: 'default', label: 'Terminé' },
}

export interface EventRowProps extends HTMLAttributes<HTMLDivElement> {
  event: Event
  stats?: EventStats
  now?: Date
}

/** Ligne compacte d'événement (zone « Vos événements ») : nom, statut, période, remplissage, actions. */
export function EventRow({ event, stats, now = new Date(), className, ...rest }: EventRowProps) {
  const badge = STATUS_BADGE[deriveEventStatus(event, now)]
  const { publishEvent, isPublishing } = usePublishEvent()
  const isDraft = !event.isPublished

  const fillRate = stats?.fillRate ?? 0
  const filled = stats?.filledSlots ?? 0
  const vacant = stats?.vacantSlots ?? 0

  const period =
    event.periodStart && event.periodEnd
      ? `${format(new Date(event.periodStart), 'd MMM', { locale: fr })} – ${format(new Date(event.periodEnd), 'd MMM', { locale: fr })}`
      : null

  return (
    <div
      className={cn('flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between', className)}
      {...rest}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/admin/events/${event.id}/edit`} className="hover:underline">
            <Typography variant="body-lg" weight="semibold">{event.name}</Typography>
          </Link>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        {period && <Typography variant="body-sm" color="muted">{period}</Typography>}
        <div className="flex items-center gap-3">
          <Progress value={fillRate} className="h-1.5 w-32" />
          <Typography variant="body-sm" color="muted">{`${fillRate} %`}</Typography>
          <Typography variant="body-sm" color="muted">{`${filled} remplis · ${vacant} vacants`}</Typography>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <a href={getEventPublicUrl(event.id)} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Voir la page
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/admin/events/${event.id}/edit`}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            Gérer
          </Link>
        </Button>
        {isDraft && (
          <Button size="sm" onClick={() => publishEvent(event.id)} disabled={isPublishing}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {isPublishing ? 'Publication...' : 'Publier'}
          </Button>
        )}
      </div>
    </div>
  )
}
