import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn, isMultiDaySlot, formatSlotRange, formatSlotDuration } from '../../lib/utils'
import type { SlotCardProps } from '../../types/slot'
import { getAvailabilityStatus, isSlotPast, isSlotCancelled } from '../../types/slot'
import { getSlotStatusDescriptor } from '@/lib/slotStatus'
import { SlotStatusBadge } from '@/components/ui/SlotStatusBadge'

/**
 * Composant SlotCard pour le calendrier public
 * Affiche un créneau avec son statut de disponibilité unifié.
 *
 * Statut (pastille + bordure-gauche + barre de remplissage) alimenté par la
 * source unique `lib/slotStatus` — jetons « hors composants » de la section design system dédiée.
 * Le créneau réservé porte la pastille « Réservé » (check-circle bleu).
 *
 * Variant 'list': Style simplifié pour l'affichage en liste (moins de poids visuel).
 */
export function SlotCard({ slot, onSelect, disabled = false, hasBooked = false, variant = 'calendar' }: SlotCardProps) {
  const availability = getAvailabilityStatus(slot)
  const isListVariant = variant === 'list'
  const isPast = isSlotPast(slot)
  const isCancelled = isSlotCancelled(slot)
  // Plage multi-jours (FR12 / UX-DR3) : plage longue + durée « N jours » seulement
  // si début et fin tombent des jours calendaires LOCAUX différents (DST-safe).
  const isMulti = isMultiDaySlot(slot.startTime, slot.endTime)

  // Statut sémantique unifié (palette + ordre de priorité partagés)
  const { status, classes } = getSlotStatusDescriptor(slot, { hasBooked })

  // Un créneau annulé reste cliquable (lire le motif) ; un créneau réservé aussi
  // (voir le détail). Le bouton renvoie alors vers la consultation plutôt que la
  // réservation.
  const isClickable = !isPast && !disabled && (isCancelled || availability !== 'full' || hasBooked)
  const buttonText = isCancelled || hasBooked ? 'Voir' : 'Réserver'

  return (
    <button
      data-testid={`slot-card-${slot.id}`}
      type="button"
      onClick={() => isClickable && onSelect?.(slot.id)}
      disabled={!isClickable}
      className={cn(
        'w-full text-left rounded-lg border border-gray-200 bg-white transition-all',
        'hover:shadow-md',
        'min-h-[44px]', // WCAG 2.2 AA: 44x44px minimum touch target size
        // Mobile: vertical stack, smaller padding
        'p-3 flex flex-col gap-3',
        // Desktop: horizontal layout, larger padding
        'md:p-4 md:flex-row md:items-start md:gap-3',
        isListVariant ? 'border-l-2' : 'border-l-4',
        classes.borderLeft,
        isPast && 'opacity-50',
        isCancelled && 'opacity-70',
        isClickable ? 'cursor-pointer hover:border-gray-300' : 'cursor-not-allowed opacity-70'
      )}
    >
      {/* Main content: time info and badge */}
      <div className="flex items-start justify-between gap-3 flex-1">
        {/* Time section */}
        <div className="flex-1">
          {/* Time range and duration on same line */}
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-gray-900">
              {formatSlotRange(slot.startTime, slot.endTime)}
            </span>
            <span className="text-sm text-gray-500">
              • {formatSlotDuration(slot.startTime, slot.endTime)}
            </span>
          </div>
          {!isListVariant && !isMulti && (
            <p className="text-sm text-gray-500">
              {format(new Date(slot.startTime), 'dd MMMM yyyy', { locale: fr })}
            </p>
          )}
          {slot.description && (
            <p className="mt-1 text-sm text-gray-600">
              {slot.description.length > 50
                ? `${slot.description.slice(0, 50)}...`
                : slot.description}
            </p>
          )}
        </div>

        {/* Pastille de statut unifiée (disponible / partiel / complet / réservé / annulé / passé) */}
        <SlotStatusBadge status={status} />
      </div>

      {/* Participant count and action button */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600 flex-shrink-0">
          {slot.currentBookings ?? 0}/{slot.capacity} inscrit{(slot.currentBookings ?? 0) > 1 ? 's' : ''}
        </p>

        {/* Bouton d'action - full-width on mobile, inline on desktop */}
        {isClickable && (
          <span className={cn(
            "text-sm font-medium text-primary",
            // Mobile: full width centered text
            "flex-1 text-center",
            // Desktop: auto width right-aligned text
            "md:flex-none md:text-right"
          )}>
            {buttonText} →
          </span>
        )}
      </div>

      {/* Indicateur visuel de remplissage (barre de progression) - caché en variant list */}
      {!isListVariant && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={slot.currentBookings ?? 0}
          aria-valuemin={0}
          aria-valuemax={slot.capacity}
          aria-label={`${slot.currentBookings ?? 0} participant(s) inscrit(s) sur ${slot.capacity}`}
        >
          <div
            className={cn('h-full rounded-full transition-all duration-300', classes.fill)}
            style={{
              width: `${Math.min(100, ((slot.currentBookings ?? 0) / slot.capacity) * 100)}%`,
            }}
          />
        </div>
      )}
    </button>
  )
}
