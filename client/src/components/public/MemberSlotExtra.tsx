import type { Slot } from '@/types/slot'
import { isSlotCancelled } from '@/types/slot'
import { XCircle } from 'lucide-react'
import { Typography } from '@/components/ui/typography'

/**
 * Informations complémentaires membre, rendues sous la description d'une rangée
 * agenda (`SlotAgendaList` `renderExtra`). Source unique partagée par
 * `PublicSlotList` et la galerie design-system.
 *
 * Aujourd'hui : motif d'annulation inline (remarque #27 — évite le détour par la
 * fenêtre de détail). L'icône est posée **inline** dans le texte (`inline-block`
 * + `align-[-0.15em]`) pour rester alignée sur la première ligne et suivre le
 * retour à la ligne, plutôt qu'un flex `items-start` désaligné (remarque #28).
 */
export function MemberSlotExtra({ slot }: { slot: Slot }) {
  if (!isSlotCancelled(slot) || !slot.cancellationReason) return null

  return (
    <Typography variant="body-sm" color="muted" className="break-words">
      <XCircle className="mr-1 inline-block h-3.5 w-3.5 align-[-0.15em] text-destructive" aria-hidden="true" />
      <span className="font-medium text-destructive">Annulé :</span> {slot.cancellationReason}
    </Typography>
  )
}
