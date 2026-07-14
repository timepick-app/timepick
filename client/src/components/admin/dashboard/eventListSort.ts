import type { Event } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'

export type SortKey = 'name' | 'fill' | 'date'

/** Tri pur des événements selon la clé choisie (testable hors UI). */
export function sortEvents(events: Event[], statsById: Map<string, EventStats>, key: SortKey): Event[] {
  const arr = [...events]
  switch (key) {
    case 'name':
      return arr.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    case 'fill':
      return arr.sort(
        (a, b) => (statsById.get(b.id)?.fillRate ?? 0) - (statsById.get(a.id)?.fillRate ?? 0),
      )
    case 'date':
      return arr.sort((a, b) => {
        const ta = a.periodStart ? new Date(a.periodStart).getTime() : Infinity
        const tb = b.periodStart ? new Date(b.periodStart).getTime() : Infinity
        return ta - tb
      })
  }
}
