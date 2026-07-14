import type { Slot, Volunteer } from '@/types/slot'
import { getAvailablePlaces, isSlotCancelled } from '@/types/slot'

/**
 * Seuil de troncature de la liste des réservants dans le popover de survol
 * (admin). Plancher recommandé : 3. Ajustable à l'usage (cf. handoff §4 :
 * si les admins ouvrent systématiquement la popup d'édition après avoir
 * survolé un créneau tronqué, monter ; si la liste écrase visuellement,
 * descendre à 3).
 */
export const MAX_VISIBLE_VOLUNTEERS = 4

export interface VolunteerSplit {
  /** Noms affichés (non vides), limités à `max`. */
  shown: string[]
  /**
   * Réservants non affichés = total − affichés. Inclut les réservants
   * sans nom (exclus des lignes, mais comptés ici) → « +X autres ».
   */
  hiddenCount: number
  /**
   * `true` si le créneau a des réservants mais aucun n'a de nom exploitable.
   * Déclenche le fallback de sécurité « Sans nom » plutôt qu'une section vide
   * (cas pathologique : `first_name` est requis côté Zod).
   */
  allUnnamed: boolean
}

/**
 * Découpe la liste des réservants pour la troncature du popover (D6).
 *
 * Les réservants sans nom (`name` null/vide) sont **exclus des lignes
 * affichées** mais **comptés dans `hiddenCount`** (décision Q2) afin que
 * « +X autres » reste cohérent avec l'occupation réelle du créneau.
 */
export function splitVolunteers(
  volunteers: Volunteer[] | null | undefined,
  max: number = MAX_VISIBLE_VOLUNTEERS
): VolunteerSplit {
  const total = volunteers?.length ?? 0
  const named = (volunteers ?? [])
    .map((v) => v.name?.trim())
    .filter((name): name is string => Boolean(name))
  const shown = named.slice(0, max)
  return {
    shown,
    hiddenCount: total - shown.length,
    allUnnamed: total > 0 && named.length === 0,
  }
}

/** Ton visuel du statut nu (cf. SlotCalendar : muted/ambre/rouge). */
type SlotPopoverStatusTone = 'muted' | 'amber' | 'red'

export interface SlotPopoverStatus {
  label: string
  tone: SlotPopoverStatusTone
}

/**
 * Libellé + ton du statut affiché en **texte nu** dans le popover admin
 * (D3 : pas de pilule, pas d'icône). Wording terse propre au popover admin,
 * distinct de `slotStatus.ts` (qui alimente le tooltip public).
 *
 * - Annulé → « Créneau annulé » (rouge).
 * - Complet (0 place) → « Complet · N / N » (ambre).
 * - Presque complet (1 place) → « 1 / N place » (ambre).
 * - Sinon → « X / N places » (neutre muted).
 */
export function popoverStatusLabel(slot: Slot): SlotPopoverStatus {
  if (isSlotCancelled(slot)) {
    return { label: 'Créneau annulé', tone: 'red' }
  }

  const places = getAvailablePlaces(slot)
  const capacity = slot.capacity

  if (places <= 0) {
    return { label: `Complet · ${capacity} / ${capacity}`, tone: 'amber' }
  }
  if (places === 1) {
    return { label: `1 / ${capacity} place`, tone: 'amber' }
  }
  return { label: `${places} / ${capacity} places`, tone: 'muted' }
}
