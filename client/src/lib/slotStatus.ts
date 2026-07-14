import type { ComponentType } from 'react'
import { Users, Ban, XCircle, History } from 'lucide-react'
import { CheckCircleSolid } from '@/components/ui/CheckCircleSolid'
import type { Slot } from '@/types/slot'
import {
  getAvailabilityStatus,
  getAvailablePlaces,
  isSlotCancelled,
  isSlotPast,
} from '@/types/slot'

/**
 * Source unique du statut sémantique d'un créneau et de sa traduction visuelle
 * (pastille `SlotStatusBadge`, badge coloré du tooltip public, statut texte nu
 * du popover admin). Toutes
 * les surfaces visibles consomment ce module pour garantir une palette et un
 * ordre de priorité identiques.
 *
 * Périmètre : statut sémantique UNIQUEMENT. Les couleurs de remplissage
 * des blocs FullCalendar (jetons `--slot-*`) sont distinctes et hors de ce
 * module (cf. section design system « Jetons hors composants »).
 */

/** Les 6 états mutuellement exclusifs d'un créneau (ordre = priorité décroissante). */
export type SlotStatus =
  | 'cancelled'
  | 'past'
  | 'reserved'
  | 'full'
  | 'partial'
  | 'available'

/** Type minimal accepté pour une icône d'état (lucide ET CheckCircleSolid). */
type SlotStatusIcon = ComponentType<{
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}>

export interface SlotStatusVariant {
  /** Libellé court de la pastille (ex. « Réservé »). */
  badgeLabel: string
  /** Libellé de l'encart (ex. « Vous avez réservé ce créneau »). */
  bannerLabel: string
  /** Libellé accessible porté par les surfaces dont l'icône est décorative. */
  ariaLabel: string
  /** Icône de l'état (décorative — le sens est porté par le texte / l'aria-label). */
  Icon: SlotStatusIcon
  classes: {
    /** Fond + bordure + texte partagés par la pastille et l'encart. */
    surface: string
    /** Couleur de l'icône. */
    icon: string
    /** Couleur de remplissage de la barre de progression. */
    fill: string
    /** Couleur de la bordure-gauche d'accent (SlotCard). */
    borderLeft: string
  }
}

export interface SlotStatusDescriptor extends SlotStatusVariant {
  status: SlotStatus
}

export interface GetSlotStatusOptions {
  /** L'utilisateur courant a-t-il réservé ce créneau ? */
  hasBooked?: boolean
}

/**
 * Table de correspondance état → traduction visuelle. Les classes Tailwind sont
 * écrites en toutes lettres (pas de concaténation dynamique) pour rester
 * détectables par le JIT. Icônes à `-600`, texte à `-800` (sauf « Passé »,
 * atténué à `-500`).
 */
export const SLOT_STATUS_VARIANTS: Record<SlotStatus, SlotStatusVariant> = {
  reserved: {
    badgeLabel: 'Réservé',
    bannerLabel: 'Vous avez réservé ce créneau',
    ariaLabel: 'Créneau réservé',
    Icon: CheckCircleSolid,
    classes: {
      surface: 'border-blue-200 bg-blue-50 text-blue-800',
      icon: 'text-blue-600',
      fill: 'bg-blue-500',
      borderLeft: 'border-l-blue-500',
    },
  },
  available: {
    badgeLabel: 'Disponible',
    // bannerLabel remplacé dynamiquement par le nombre de places (cf. descriptor)
    bannerLabel: 'Disponible',
    ariaLabel: 'Disponible',
    Icon: Users,
    classes: {
      surface: 'border-green-200 bg-green-50 text-green-800',
      icon: 'text-green-600',
      fill: 'bg-green-500',
      borderLeft: 'border-l-green-500',
    },
  },
  partial: {
    badgeLabel: 'Partiel',
    // bannerLabel remplacé dynamiquement par le nombre de places (cf. descriptor)
    bannerLabel: 'Partiel',
    ariaLabel: 'Partiellement disponible',
    Icon: Users,
    classes: {
      surface: 'border-amber-200 bg-amber-50 text-amber-800',
      icon: 'text-amber-600',
      fill: 'bg-amber-500',
      borderLeft: 'border-l-amber-500',
    },
  },
  full: {
    badgeLabel: 'Complet',
    bannerLabel: 'Complet',
    ariaLabel: 'Créneau complet',
    Icon: Ban,
    classes: {
      surface: 'border-orange-200 bg-orange-50 text-orange-800',
      icon: 'text-orange-600',
      fill: 'bg-orange-500',
      borderLeft: 'border-l-orange-400',
    },
  },
  cancelled: {
    badgeLabel: 'Annulé',
    bannerLabel: 'Créneau annulé',
    ariaLabel: 'Créneau annulé',
    Icon: XCircle,
    classes: {
      surface: 'border-red-200 bg-red-50 text-red-800',
      icon: 'text-red-600',
      // La barre de remplissage d'un créneau annulé reste neutre (gris).
      fill: 'bg-gray-400',
      borderLeft: 'border-l-red-400',
    },
  },
  past: {
    badgeLabel: 'Passé',
    bannerLabel: 'Créneau passé',
    ariaLabel: 'Créneau passé',
    Icon: History,
    classes: {
      surface: 'border-gray-200 bg-gray-50 text-gray-500',
      icon: 'text-gray-600',
      fill: 'bg-gray-400',
      borderLeft: 'border-l-gray-300',
    },
  },
}

/**
 * Détermine l'état sémantique d'un créneau selon l'ordre de priorité figé :
 * Annulé > Passé > Réservé > Complet > Partiel > Disponible.
 *
 * Logique pure et testable, sans dépendance au rendu.
 */
export function getSlotStatus(slot: Slot, { hasBooked = false }: GetSlotStatusOptions = {}): SlotStatus {
  if (isSlotCancelled(slot)) return 'cancelled'
  if (isSlotPast(slot)) return 'past'
  if (hasBooked) return 'reserved'
  // getAvailabilityStatus renvoie 'full' | 'partial' | 'available'
  return getAvailabilityStatus(slot)
}

/**
 * Renvoie la traduction visuelle complète d'un créneau (état + libellés +
 * icône + classes). Le libellé de l'encart des états « Disponible » et
 * « Partiel » est remplacé par le nombre de places restantes.
 */
export function getSlotStatusDescriptor(
  slot: Slot,
  options: GetSlotStatusOptions = {}
): SlotStatusDescriptor {
  const status = getSlotStatus(slot, options)
  const variant = SLOT_STATUS_VARIANTS[status]

  if (status === 'available' || status === 'partial') {
    const places = getAvailablePlaces(slot)
    // Rappel du nombre de places disponibles AVEC la capacité totale
    // (« 3 places disponibles sur 4 ») : porte à lui seul l'occupation, ce qui
    // évite la redondance avec un éventuel « 1/4 » de titre (cf. tooltips).
    const placesLabel = `${places} place${places > 1 ? 's' : ''} disponible${places > 1 ? 's' : ''} sur ${slot.capacity}`
    return { status, ...variant, bannerLabel: placesLabel, ariaLabel: placesLabel }
  }

  return { status, ...variant }
}

export interface ResolveSlotStatusInput extends GetSlotStatusOptions {
  /** Créneau complet (calcul du statut via l'ordre de priorité). */
  slot?: Slot
  /** Statut explicite, prioritaire sur `slot` — utile quand aucun créneau
   *  complet n'est disponible (ex. statut agrégé d'un jour, réservation sans
   *  `currentBookings`). Libellés statiques (pas de calcul de places). */
  status?: SlotStatus
}

/**
 * Résout un descripteur depuis un créneau OU un statut explicite. Permet à
 * `SlotStatusBadge` de servir les deux cas :
 * surfaces disposant d'un `Slot` complet, et surfaces ne connaissant que le
 * statut (statut de jour agrégé, panneau « Mes réservations »).
 */
export function resolveSlotStatusDescriptor(input: ResolveSlotStatusInput): SlotStatusDescriptor {
  if (input.status) {
    return { status: input.status, ...SLOT_STATUS_VARIANTS[input.status] }
  }
  if (input.slot) {
    return getSlotStatusDescriptor(input.slot, { hasBooked: input.hasBooked })
  }
  throw new Error('[slotStatus] resolveSlotStatusDescriptor requiert « slot » ou « status »')
}
