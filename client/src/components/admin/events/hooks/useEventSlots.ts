import { useMemo } from 'react'
import { useAdminSlots } from '@/hooks/useAdminSlots'
import type { Slot } from '@/types/slot'
import { isSlotCancelled } from '@/types/slot'
import { getSlotClassNames } from '@/lib/slotClassNames'
import { formatTimeRangeFrench, formatSlotRangeCompact, isSlotPast, isMultiDaySlot, getAllDayExclusiveEnd } from '@/lib/utils'

/**
 * FullCalendar Event format for displaying slots
 * Note: FullCalendar uses 'className' property (not 'eventClassNames') for event-specific classes
 */
export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  extendedProps: {
    capacity: number
    currentBookings: number
    availablePlaces: number
    status: 'available' | 'partial' | 'full'
    description?: string
    cancelledAt?: string | null
    /**
     * Libellé jour-aware pré-formaté pour la **barre multi-jours** (vue Mois) :
     * `formatSlotRange` (« du … au … ») + occupation. Absent pour un mono-jour
     * (la barre utilise alors `title`). Calculé ici car l'event FullCalendar
     * all-day perd l'heure de `start`/`end` (date tronquée) : `eventContent` ne
     * peut pas reconstruire la plage réelle côté admin.
     */
    multiDayLabel?: string
  }
  /**
   * CSS classes for coloration using theme variables
   * Passed as 'className' property to FullCalendar events
   */
  classNames: string[]
  /**
   * Événement « toute la journée » FullCalendar. `true` pour un créneau
   * multi-jours (rendu en barre continue / bandeau all-day), `false` sinon.
   * Source : `isMultiDaySlot` (comparaison jour calendaire LOCAL, DST-safe).
   */
  allDay?: boolean
}

/**
 * Type d'erreur retourné par le hook
 * React Query peut retourner: string | Error | null | undefined
 */
export type HookError = string | Error | null | undefined

/**
 * Hook wrapper qui transforme les données Slot en format FullCalendar Event
 * Wrap l'existant useAdminSlots et délègue tous les états (loading, error, refetch)
 *
 * @param eventId - UUID de l'événement
 * @returns { events, isLoading, error, refetch }
 */
export const useEventSlots = (eventId: string) => {
  const { slots, isLoading, error, refetch } = useAdminSlots(eventId)

  // Transform Slot → CalendarEvent
  const events = useMemo(() => {
    return slots.map((slot: Slot): CalendarEvent => {
      const availablePlaces =
        slot.availablePlaces !== undefined
          ? slot.availablePlaces
          : Math.max(0, slot.capacity - (slot.currentBookings ?? 0))

      const isFull = availablePlaces === 0
      const isPartial = availablePlaces > 0 && (slot.currentBookings ?? 0) > 0
      const status: 'available' | 'partial' | 'full' = isFull
        ? 'full'
        : isPartial
          ? 'partial'
          : 'available'

      // Classes CSS de coloration partagées avec le calendrier public (source
      // unique : lib/slotClassNames). Un créneau annulé (soft-delete) prime sur
      // le statut ; un créneau passé reçoit le modificateur `slot-past`.
      const isPast = isSlotPast(slot)
      const isCancelled = isSlotCancelled(slot)
      // Créneau multi-jours → barre continue (vue Mois) / bandeau all-day (vue
      // Semaine). Le flag `allDay` et le modificateur `fc-event--multiday`
      // dérivent du même calcul DST-safe (isMultiDaySlot, jour calendaire LOCAL).
      const isMultiDay = isMultiDaySlot(slot.startTime, slot.endTime)
      const classNames = getSlotClassNames(status, { isCancelled, isPast })
      if (isMultiDay) {
        classNames.push('fc-event--multiday')
      }

      return {
        id: slot.id,
        title: formatTimeRangeFrench(slot.startTime, slot.endTime, slot.currentBookings ?? 0, slot.capacity),
        allDay: isMultiDay,
        start: slot.startTime,
        // Multi-jours : fin EXCLUSIVE en date locale pour que la barre all-day
        // couvre le bon nombre de jours (FC ignore l'heure de fin — cf.
        // getAllDayExclusiveEnd). Mono-jour : ISO brut inchangé.
        end: isMultiDay ? getAllDayExclusiveEnd(slot.endTime) : slot.endTime,
        extendedProps: {
          capacity: slot.capacity,
          currentBookings: slot.currentBookings ?? 0,
          availablePlaces,
          status,
          description: slot.description,
          cancelledAt: slot.cancelledAt ?? null,
          // Plage réelle (jours + heures) pour la barre multi-jours, en forme
          // COMPACTE (« 13 juin 14h00 → 15 juin 14h00 ») : la cellule est étroite
          // et la forme longue « du … au … » déborde en ellipsis. La forme longue
          // reste au survol (tooltip). Occupation inscrits/capacité en suffixe.
          multiDayLabel: isMultiDay
            ? `${formatSlotRangeCompact(slot.startTime, slot.endTime)} | ${slot.currentBookings ?? 0}/${slot.capacity}`
            : undefined
        },
        classNames
      }
    })
  }, [slots])

  return {
    events,
    isLoading,
    error,
    refetch
  }
}
