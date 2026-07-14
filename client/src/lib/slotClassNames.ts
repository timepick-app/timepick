import type { AvailabilityStatus } from '@/types/slot'

/**
 * Source unique des classes CSS de « type de bloc » de créneau pour les deux
 * calendriers FullCalendar — public (`CalendarView`) et admin (`SlotCalendar`
 * via `useEventSlots`). Évite la double définition qui avait fait diverger le
 * rendu d'un même statut entre les deux calendriers.
 *
 * Les classes `bg-slot* / border-slot* / text-slot*-foreground` sont mappées
 * sur les jetons `--slot-*` (cf. `index.css` + `tailwind.config.js`). Le rendu
 * visuel partagé (annulé grisé + barré + badge, passé atténué) est porté par le
 * calque `.tp-calendar` dans `index.css`.
 *
 * @see section design system « Jetons hors composants »
 */
const STATUS_CLASS_NAMES: Record<AvailabilityStatus, string[]> = {
  available: ['bg-slotAvailable', 'border-slotAvailable', 'text-slotAvailable-foreground'],
  partial: ['bg-slotPartial', 'border-slotPartial', 'text-slotPartial-foreground'],
  full: ['bg-slotFull', 'border-slotFull', 'text-slotFull-foreground'],
}

/**
 * Créneau annulé (soft-delete) : fond/bordure/texte gris figés + marqueur
 * `slot-cancelled` (le calque `.tp-calendar` applique barré + couleur de texte
 * grise par-dessus le blanc forcé par FullCalendar). Prioritaire sur le statut.
 */
const CANCELLED_CLASS_NAMES = ['bg-gray-100', 'border-gray-300', 'text-gray-500', 'slot-cancelled']

interface SlotClassNameOptions {
  /** Créneau annulé (soft-delete) — prime sur le statut de disponibilité. */
  isCancelled?: boolean
  /** Créneau passé — ajoute le modificateur `slot-past` (opacité réduite). */
  isPast?: boolean
}

/**
 * Calcule les classes FullCalendar d'un créneau selon son statut et ses
 * modificateurs. Un créneau annulé ignore le statut de disponibilité.
 *
 * @param status - Statut de disponibilité (`available` / `partial` / `full`)
 * @param options - `isCancelled` (prioritaire) et `isPast`
 * @returns Tableau de classes à passer à FullCalendar (`classNames` / `className`)
 */
export function getSlotClassNames(
  status: AvailabilityStatus,
  { isCancelled = false, isPast = false }: SlotClassNameOptions = {}
): string[] {
  const classNames = isCancelled
    ? [...CANCELLED_CLASS_NAMES]
    : [...(STATUS_CLASS_NAMES[status] ?? STATUS_CLASS_NAMES.available)]

  if (isPast) {
    classNames.push('slot-past')
  }

  return classNames
}
