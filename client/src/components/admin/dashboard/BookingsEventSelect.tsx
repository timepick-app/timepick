import * as React from 'react'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Typography } from '@/components/ui/typography'
import type { Event } from '@/hooks/useEvents'
import type { ChartEventMode } from '@/lib/dashboard'

export type BookingsEventSelection =
  | { kind: 'mode'; mode: ChartEventMode }
  | { kind: 'event'; id: string }

const MODE_LABELS: Record<ChartEventMode, string> = {
  nearest: 'Événement actif ou imminent',
  recentCampaign: 'Dernière campagne envoyée',
  recentActivity: 'Dernière activité de réservation',
}

const MODES: ChartEventMode[] = ['nearest', 'recentCampaign', 'recentActivity']

export interface BookingsEventSelectProps extends React.HTMLAttributes<HTMLDivElement> {
  events: Event[]
  selection: BookingsEventSelection
  resolvedEventName?: string | null
  onSelectionChange: (selection: BookingsEventSelection) => void
}

/**
 * Menu déroulant combiné pour le graphique « Réservations dans le temps » :
 * 3 sélections intelligentes (par défaut « actif ou imminent ») + un item par
 * événement. Émet `{ kind:'mode' | 'event' }`. Le nom de l'événement réellement
 * résolu est affiché sous le sélecteur.
 */
export function BookingsEventSelect({
  events, selection, resolvedEventName, onSelectionChange, className, ...rest
}: BookingsEventSelectProps) {
  const value = selection.kind === 'mode' ? `mode:${selection.mode}` : `event:${selection.id}`

  const handleChange = (v: string) => {
    if (v.startsWith('mode:')) onSelectionChange({ kind: 'mode', mode: v.slice(5) as ChartEventMode })
    else if (v.startsWith('event:')) onSelectionChange({ kind: 'event', id: v.slice(6) })
  }

  return (
    <div className={className} data-testid="bookings-event-select" {...rest}>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Sélection intelligente</SelectLabel>
            {MODES.map(mode => (
              <SelectItem key={mode} value={`mode:${mode}`}>{MODE_LABELS[mode]}</SelectItem>
            ))}
          </SelectGroup>
          {events.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Événements</SelectLabel>
                {events.map(e => (
                  <SelectItem key={e.id} value={`event:${e.id}`}>{e.name}</SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      {resolvedEventName && (
        <Typography variant="body-sm" color="muted" className="mt-1">{resolvedEventName}</Typography>
      )}
    </div>
  )
}
