import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn, formatSlotRangeCompact, formatSlotDuration, isMultiDaySlot } from '@/lib/utils'
import type { Slot } from '@/types/slot'
import { getAvailablePlaces } from '@/types/slot'
import { getSlotStatus, getSlotStatusDescriptor } from '@/lib/slotStatus'
import { SlotStatusBadge } from '@/components/ui/SlotStatusBadge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Typography } from '@/components/ui/typography'
import { isBooked } from './pocData'

/**
 * Helpers PARTAGÉS par les 4 directions du POC (dev-only). Ils garantissent que
 * toutes les directions rendent le statut, les places et le CTA EXACTEMENT de la
 * même manière — seul le SYSTÈME de mise en page (gouttière / liste plate /
 * table / timeline) diffère d'une direction à l'autre.
 *
 * Re-exports pratiques pour les directions.
 */
export { formatSlotDuration, isMultiDaySlot, cn }
export { Typography }
export type { Slot }

/** Largeur de rendu : mobile (cadre étroit) ou desktop (pleine largeur). */
export type ViewMode = 'mobile' | 'desktop'

/**
 * Format de l'indicateur de places (décision §11-E) :
 *  - E1 (🎨 Sally)     : « N places restantes » + preuve sociale positive
 *  - E2 (🎬 Caravaggio): places FUSIONNÉES dans le badge, pas de ligne séparée
 *  - E3                : jauge Progress neutre + nombre
 */
export type PlacesFormat = 'E1' | 'E2' | 'E3'

/** Props communes aux 4 directions du POC. */
export interface DirectionProps {
  slots: Slot[]
  mode: ViewMode
  placesFormat: PlacesFormat
}

/**
 * CTA de réservation = vrai DS <Button> (jamais un <span>).
 * Réserver (default) / Voir (outline) / Complet·Passé (disabled).
 * Cible tactile ≥44px en mobile (`min-h-11`), 36px au pointeur desktop (`min-h-9`).
 */
export function CtaButton({ slot, mode }: { slot: Slot; mode: ViewMode }) {
  const status = getSlotStatus(slot, { hasBooked: isBooked(slot.id) })
  const minH = mode === 'mobile' ? 'min-h-11' : 'min-h-9'

  if (status === 'available' || status === 'partial') {
    return <Button variant="default" size="sm" className={minH}>Réserver</Button>
  }
  if (status === 'reserved' || status === 'cancelled') {
    return <Button variant="outline" size="sm" className={minH}>Voir</Button>
  }
  if (status === 'full') {
    return <Button variant="outline" size="sm" className={minH} disabled>Complet</Button>
  }
  // past
  return <Button variant="ghost" size="sm" className={minH} disabled>Terminé</Button>
}

/**
 * Pastille de statut. En E2, pour Disponible/Partiel, le libellé du badge est
 * REMPLACÉ par les places (« 9 places ») — fusion statut↔places. Sinon, le vrai
 * SlotStatusBadge DS est utilisé tel quel.
 */
export function PocStatusBadge({ slot, format: placesFormat }: { slot: Slot; format: PlacesFormat }) {
  const hasBooked = isBooked(slot.id)
  const desc = getSlotStatusDescriptor(slot, { hasBooked })

  if (placesFormat === 'E2' && (desc.status === 'available' || desc.status === 'partial')) {
    const places = getAvailablePlaces(slot)
    const Icon = desc.Icon
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
          desc.classes.surface,
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', desc.classes.icon)} aria-hidden="true" />
        {places} place{places > 1 ? 's' : ''}
      </span>
    )
  }

  return <SlotStatusBadge slot={slot} hasBooked={hasBooked} />
}

/**
 * Indicateur de places (quantitatif), distinct du badge (qualitatif).
 * Renvoie `null` en E2 (l'info est portée par le badge).
 */
export function PlacesLabel({ slot, format: placesFormat }: { slot: Slot; format: PlacesFormat }) {
  const hasBooked = isBooked(slot.id)
  const status = getSlotStatus(slot, { hasBooked })

  if (placesFormat === 'E2') return null

  const places = getAvailablePlaces(slot)

  if (placesFormat === 'E3' && (status === 'available' || status === 'partial')) {
    const pct = Math.round(((slot.currentBookings ?? 0) / slot.capacity) * 100)
    return (
      <div className="flex items-center gap-2">
        <Progress value={pct} className="h-1.5 w-20 bg-secondary" />
        <Typography variant="body-sm" color="muted" className="tabular-nums whitespace-nowrap">
          {places} rest.
        </Typography>
      </div>
    )
  }

  // E1 (et repli E3 pour les états non-ouverts)
  if (status === 'available' || status === 'partial') {
    return (
      <Typography variant="body-sm" color="muted" className="tabular-nums whitespace-nowrap">
        {places} place{places > 1 ? 's' : ''} restante{places > 1 ? 's' : ''}
      </Typography>
    )
  }
  if (status === 'reserved') {
    return (
      <Typography variant="body-sm" color="muted" className="tabular-nums whitespace-nowrap">
        {slot.currentBookings ?? 0} inscrit{(slot.currentBookings ?? 0) > 1 ? 's' : ''} · {places} place{places > 1 ? 's' : ''}
      </Typography>
    )
  }
  // past / full
  return (
    <Typography variant="body-sm" color="muted" className="tabular-nums whitespace-nowrap">
      {slot.currentBookings ?? 0}/{slot.capacity} inscrit{(slot.currentBookings ?? 0) > 1 ? 's' : ''}
    </Typography>
  )
}

/** Heure compacte (mono-jour « 09h00 → 10h00 », multi-jours daté sans jour de semaine). */
export function compactTime(slot: Slot): string {
  return formatSlotRangeCompact(slot.startTime, slot.endTime)
}

/** Date courte d'une ligne (direction B, mono-jour) : « 28 juin ». */
export function lineDate(slot: Slot): string {
  return format(parseISO(slot.startTime), 'd MMM', { locale: fr })
}

/** Libellé de jour pour un en-tête/gouttière/marqueur : « sam. 20 juin ». */
export function dayLabel(dateKey: string): string {
  return format(parseISO(dateKey), 'eee d MMM', { locale: fr })
}

/**
 * Regroupe les créneaux par JOUR DE DÉBUT (clé `yyyy-MM-dd`), trie les jours et
 * les créneaux intra-jour chronologiquement. Commun aux directions pour une
 * comparaison équitable (le débat « buildSlotsByDate » est la décision §11-F,
 * hors POC).
 */
export function groupSlotsByStartDay(slots: Slot[]): Array<[string, Slot[]]> {
  const grouped = new Map<string, Slot[]>()
  for (const slot of slots) {
    const key = format(parseISO(slot.startTime), 'yyyy-MM-dd')
    const bucket = grouped.get(key)
    if (bucket) bucket.push(slot)
    else grouped.set(key, [slot])
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
  }
  return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))
}

/** Un créneau est-il passé / désactivé visuellement (rangée atténuée) ? */
export function isDimmed(slot: Slot): boolean {
  return getSlotStatus(slot, { hasBooked: isBooked(slot.id) }) === 'past'
}
