import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import type { Slot } from '@/types/slot'
import { resolveSlotStatusDescriptor, type SlotStatus } from '@/lib/slotStatus'

export interface SlotStatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'slot'> {
  /** Créneau complet (statut calculé via l'ordre de priorité). */
  slot?: Slot
  /** L'utilisateur courant a-t-il réservé ce créneau ? (ignoré si `status` fourni) */
  hasBooked?: boolean
  /** Statut explicite, prioritaire sur `slot`. */
  status?: SlotStatus
}

/**
 * Pastille compacte du statut d'un créneau (icône + libellé court), alimentée
 * par la source unique `lib/slotStatus`. Mêmes jetons de couleur que cette
 * source — jetons « hors composants » de la section design system dédiée.
 *
 * Renseigner `slot` (+ `hasBooked`) pour un calcul automatique, ou `status`
 * pour forcer un état (surfaces sans créneau complet).
 *
 * L'icône est décorative (`aria-hidden`) : le sens est porté par le libellé
 * visible. Étend `HTMLAttributes` et propage `...rest` pour ne pas perdre
 * `data-testid` / `aria-label` en production.
 */
export function SlotStatusBadge({ slot, hasBooked = false, status, className, ...rest }: SlotStatusBadgeProps) {
  const { badgeLabel, Icon, classes } = resolveSlotStatusDescriptor({ slot, hasBooked, status })

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        classes.surface,
        className
      )}
      {...rest}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', classes.icon)} aria-hidden="true" />
      {badgeLabel}
    </span>
  )
}
