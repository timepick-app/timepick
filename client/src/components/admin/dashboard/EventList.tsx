import { useMemo, useState } from 'react'
import type { Event } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'
import { FilterPills, type FilterPillOption } from '@/components/ui/filter-pills'
import { Typography } from '@/components/ui/typography'
import { EventRow } from './EventRow'
import { sortEvents, type SortKey } from './eventListSort'
import { Calendar } from 'lucide-react'

const SORT_OPTIONS: FilterPillOption<SortKey>[] = [
  { value: 'name', label: 'Nom' },
  { value: 'fill', label: 'Remplissage' },
  { value: 'date', label: 'Date' },
]

export interface EventListProps {
  events: Event[]
  stats: EventStats[]
}

/** Liste des événements en lignes compactes, triable (nom / remplissage / date). */
export function EventList({ events, stats }: EventListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const statsById = useMemo(() => new Map(stats.map((s) => [s.eventId, s])), [stats])
  const sorted = useMemo(() => sortEvents(events, statsById, sortKey), [events, statsById, sortKey])

  if (events.length === 0) {
    return (
      <div className="text-center py-12 px-4 bg-muted/50 rounded-lg border border-dashed border-border">
        <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
        <Typography variant="body" weight="medium" className="mt-2">
          Aucun événement
        </Typography>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Typography variant="body-sm" color="muted">Trier par</Typography>
        <FilterPills options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} />
      </div>
      <div>
        {sorted.map((event) => (
          <EventRow key={event.id} event={event} stats={statsById.get(event.id)} />
        ))}
      </div>
    </div>
  )
}
