import type { Slot } from '@/types/slot'
import { getAvailabilityStatus, isSlotPast, isSlotCancelled } from '@/types/slot'
import { Button } from '@/components/ui/button'

/**
 * Cluster d'action membre pour une rangée de la vue Liste « agenda »
 * (`SlotAgendaList`). Source unique de la logique d'action côté membre, partagée
 * par `PublicSlotList` (page réelle) et la galerie design-system.
 *
 * États (priorité décroissante, alignée sur getSlotStatus) :
 *  - annulé       → aucun CTA ; le motif est affiché inline par PublicSlotList (remarque #27)
 *  - passé        → « Terminé » (ghost, désactivé)
 *  - réservé      → « Annuler » (outline-destructive) — annulation directe (remarque #25)
 *  - complet      → « Complet » (outline, désactivé)
 *  - dispo/partiel→ « Réserver » (default) — réservation directe (remarque #29)
 *
 * Cible tactile container-aware : 44px en conteneur étroit, 36px (DS sm) en
 * large (la variante `@xl/agenda:` résout car rendu dans `@container/agenda`).
 */
const ACTION_BUTTON_CLASS = 'min-h-11 @xl/agenda:min-h-9'

export interface MemberSlotActionProps {
  slot: Slot
  hasBooked: boolean
  /** Mode consultatif : désactive les actions cliquables. */
  disabled?: boolean
  /** Réserver → crée la réservation directement (sans fenêtre de détail). */
  onReserve?: (slotId: string) => void
  /** Annuler → déclenche le flow d'annulation partagé. */
  onCancel?: (slotId: string) => void
}

export function MemberSlotAction({ slot, hasBooked, disabled = false, onReserve, onCancel }: MemberSlotActionProps) {
  // Priorité alignée sur getSlotStatus : annulé > passé > réservé > complet > dispo.
  if (isSlotCancelled(slot)) {
    // Annulé : le motif est affiché inline (cf. PublicSlotList) → aucun CTA (remarque #27).
    return null
  }

  if (isSlotPast(slot)) {
    return <Button variant="ghost" size="sm" disabled className={ACTION_BUTTON_CLASS}>Terminé</Button>
  }

  if (hasBooked) {
    return (
      <Button variant="outline-destructive" size="sm" disabled={disabled} onClick={() => onCancel?.(slot.id)} className={ACTION_BUTTON_CLASS}>
        Annuler
      </Button>
    )
  }

  if (getAvailabilityStatus(slot) === 'full') {
    return <Button variant="outline" size="sm" disabled className={ACTION_BUTTON_CLASS}>Complet</Button>
  }

  return (
    <Button variant="default" size="sm" disabled={disabled} onClick={() => onReserve?.(slot.id)} className={ACTION_BUTTON_CLASS}>
      Réserver
    </Button>
  )
}
