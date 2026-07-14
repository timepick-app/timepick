import { type ReactNode, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn, formatSlotRangeCompact, formatSlotDuration } from '@/lib/utils'
import type { Slot } from '@/types/slot'
import { getAvailablePlaces } from '@/types/slot'
import { getSlotStatus, getSlotStatusDescriptor } from '@/lib/slotStatus'
import { SlotStatusBadge } from '@/components/ui/SlotStatusBadge'
import { Typography } from '@/components/ui/typography'

/**
 * Liste de créneaux en « agenda » — Direction A (gouttière de date) + places E2
 * (fusionnées dans le badge). Source unique partagée par la vue Liste membre
 * (`PublicSlotList`) et la vue Liste admin (`SlotList`), différenciées par le
 * seul `renderAction`.
 *
 * Responsive par **container queries** (`@container/agenda`) : layout gouttière
 * quand le conteneur est large (≥ @xl), empilé à marqueur de jour sinon. Marche
 * dans la colonne membre, le panneau admin ET les cadres de la galerie design-system.
 *
 * Regroupement par **jour de début uniquement** : un créneau multi-jours
 * apparaît une seule fois (remarque Bridge #24 — pas de duplication sur les
 * jours suivants).
 */
export interface SlotAgendaListProps {
  /** Créneaux à afficher (regroupés par jour de début). */
  slots: Slot[]
  /** Membre : `(s) => bookedSlotIds.has(s.id)`. Admin : omis (jamais « réservé »). */
  getHasBooked?: (slot: Slot) => boolean
  /** Cluster d'action à droite (CTA membre ; Modifier + Supprimer admin). */
  renderAction: (slot: Slot) => ReactNode
  /** Bloc optionnel sous la description (admin : motif d'annulation, nb de réservations). */
  renderExtra?: (slot: Slot) => ReactNode
}

/**
 * Badge E2 : le badge porte le verdict (statut + places fusionnés).
 *  - Disponible/Partiel → « N places »
 *  - Réservé           → « Réservé · N places » (ou « Réservé · complet » si 0 place — remarque #26)
 *  - Complet/Passé/Annulé → badge de statut standard (les places n'apportent rien)
 * Le libellé court est à l'écran ; la forme longue va en `aria-label`.
 */
function AgendaBadge({ slot, hasBooked }: { slot: Slot; hasBooked: boolean }) {
  const descriptor = getSlotStatusDescriptor(slot, { hasBooked })
  const { status } = descriptor

  if (status === 'available' || status === 'partial' || status === 'reserved') {
    const places = getAvailablePlaces(slot)
    const placesText = places > 0 ? `${places} place${places > 1 ? 's' : ''}` : 'complet'
    const isReserved = status === 'reserved'
    const label = isReserved ? `${descriptor.badgeLabel} · ${placesText}` : placesText
    const ariaLabel = isReserved
      ? `Réservé — ${places > 0 ? `${placesText} disponible${places > 1 ? 's' : ''} sur ${slot.capacity}` : 'complet'}`
      : descriptor.ariaLabel
    const Icon = descriptor.Icon
    return (
      <span
        aria-label={ariaLabel}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
          descriptor.classes.surface,
        )}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', descriptor.classes.icon)} aria-hidden="true" />
        {label}
      </span>
    )
  }

  return <SlotStatusBadge slot={slot} hasBooked={hasBooked} />
}

function AgendaRow({
  slot,
  hasBooked,
  renderAction,
  renderExtra,
}: {
  slot: Slot
  hasBooked: boolean
  renderAction: (slot: Slot) => ReactNode
  renderExtra?: (slot: Slot) => ReactNode
}) {
  const isPast = getSlotStatus(slot, { hasBooked }) === 'past'
  const description = slot.description?.trim()
  const extra = renderExtra?.(slot)
  // Le badge est rendu deux fois (accolé à l'heure en conteneur étroit, dans le
  // cluster en large) ; une seule copie est visible à la fois (CSS container query).
  const badge = <AgendaBadge slot={slot} hasBooked={hasBooked} />

  return (
    <li className={cn('py-3', isPast && 'opacity-60')}>
      <div className="flex flex-col gap-2 @xl/agenda:flex-row @xl/agenda:items-start @xl/agenda:gap-4">
        {/* Heure + durée ; le badge accompagne l'heure en conteneur étroit (mobile) */}
        <div className="@xl/agenda:w-44 @xl/agenda:shrink-0">
          <div className="flex items-center justify-between gap-2 @xl/agenda:block">
            <Typography variant="body" weight="semibold" className="tabular-nums">
              {formatSlotRangeCompact(slot.startTime, slot.endTime)}
            </Typography>
            <span className="@xl/agenda:hidden">{badge}</span>
          </div>
          <Typography variant="body-sm" color="muted" className="tabular-nums">
            {formatSlotDuration(slot.startTime, slot.endTime)}
          </Typography>
        </div>

        {/* Description complète (jamais tronquée) + extra optionnel */}
        <div className="min-w-0 space-y-1 @xl/agenda:flex-1">
          {description && (
            <Typography variant="body-sm" color="muted" className="break-words">
              {description}
            </Typography>
          )}
          {extra}
        </div>

        {/* Cluster droite : badge (conteneur large) + action */}
        <div className="flex items-center justify-end gap-3 @xl/agenda:ml-auto @xl/agenda:shrink-0 @xl/agenda:flex-col @xl/agenda:items-end @xl/agenda:gap-2">
          <span className="hidden @xl/agenda:inline-flex">{badge}</span>
          {renderAction(slot)}
        </div>
      </div>
    </li>
  )
}

export function SlotAgendaList({ slots, getHasBooked, renderAction, renderExtra }: SlotAgendaListProps) {
  const groups = useMemo(() => {
    // Regroupement par jour de DÉBUT (un créneau = un seul groupe), tri chronologique.
    const byDay = new Map<string, Slot[]>()
    for (const slot of slots) {
      const key = format(parseISO(slot.startTime), 'yyyy-MM-dd')
      const bucket = byDay.get(key)
      if (bucket) bucket.push(slot)
      else byDay.set(key, [slot])
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, daySlots]) => {
        const sorted = [...daySlots].sort(
          (a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime(),
        )
        return [key, sorted] as const
      })
  }, [slots])

  if (groups.length === 0) return null

  return (
    <div className="@container/agenda">
      {groups.map(([dateKey, daySlots]) => {
        const day = parseISO(dateKey)
        return (
          <section key={dateKey} className="border-t border-border first:border-t-0">
            {/* Marqueur de jour — conteneur étroit uniquement */}
            <div className="px-1 pt-3 @xl/agenda:hidden">
              <Typography variant="body-xs" color="muted" className="font-medium first-letter:uppercase">
                {format(day, 'eee d MMM', { locale: fr })}
              </Typography>
            </div>

            <div className="@xl/agenda:grid @xl/agenda:grid-cols-[7rem_minmax(0,1fr)]">
              {/* Gouttière — conteneur large uniquement (date 1×/jour) */}
              <div className="hidden @xl/agenda:block @xl/agenda:border-r @xl/agenda:border-border @xl/agenda:py-3 @xl/agenda:pr-3">
                <Typography variant="body-sm" weight="semibold" className="leading-tight first-letter:uppercase">
                  {format(day, 'eee', { locale: fr })}
                </Typography>
                <Typography variant="body-sm" color="muted" className="leading-tight">
                  {format(day, 'd MMM', { locale: fr })}
                </Typography>
              </div>

              {/* Rangées du jour */}
              <ul className="divide-y divide-border @xl/agenda:pl-4">
                {daySlots.map((slot) => (
                  <AgendaRow
                    key={slot.id}
                    slot={slot}
                    hasBooked={getHasBooked?.(slot) ?? false}
                    renderAction={renderAction}
                    renderExtra={renderExtra}
                  />
                ))}
              </ul>
            </div>
          </section>
        )
      })}
    </div>
  )
}
