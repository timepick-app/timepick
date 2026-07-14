import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MyReservationsPanel } from '@/components/public/MyReservationsPanel'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { isActiveBooking } from '@/types/booking'
import type { Booking } from '@/types/booking'

/**
 * Props du popover « Mes réservations » (Story 1.6).
 * Sous-strict du `EventCalendarHeaderContext` étendu.
 */
export interface MemberReservationsPopoverProps {
  /** Nom de l'événement courant (pour l'état vide contextuel + a11y). */
  eventName: string
  /** Réservations du user SCOPÉES à cet événement (live, filtrées `slot.eventId === uuid`). */
  eventReservations: Booking[]
  /** Déclenche le flow d'annulation partagé (handleCancelFromPanel → ConfirmCancelDialog). */
  onCancelReservation?: (slotId: string) => void
  /** slotId en cours d'annulation (mutation en vol) — pour désactiver/spinner le `[✕]`. */
  cancellingSlotId?: string
}

/**
 * MemberReservationsPopover — trigger badge + overlay responsive listant les
 * réservations du user pour l'événement courant, avec annulation inline.
 *
 * Switch responsive **obligatoire** (AC2/AC3 + test anti-régression §7) :
 * - Desktop (`!isMobile`) → `<Popover>` Radix (align end).
 * - Mobile (`isMobile`) → `<Sheet side="bottom">` + `<SheetTitle>` sr-only (a11y).
 *
 * Les deux primitives doivent exister physiquement dans le rendu (sélectionnées
 * par `useMediaQuery`) — NE PAS faire un Sheet unique avec `side` variable
 * (raccourci DaySlotDrawer) : cela violerait AC2 et ferait échouer le test
 * anti-régression desktop.
 *
 * État `open` contrôlé dans CE composant (parent), pas dans `PopoverContent`
 * (démonté à la fermeture — règle EmailIdentityMenu).
 *
 * Réutilisation sans duplication (AC7 / AR11) : la couche données et le flow
 * d'annulation sont consommés via les props (`eventReservations` + `onCancelReservation`).
 * La variante `compact` de `MyReservationsPanel` fournit le rendu condensé + récap.
 *
 * @see Story 1.6 — AC1–AC5
 */
export function MemberReservationsPopover({
  eventName,
  eventReservations,
  onCancelReservation,
  cancellingSlotId,
}: MemberReservationsPopoverProps) {
  const [open, setOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const count = eventReservations.length
  // Compteur « actif » : exclut les slots annulés par l'organisateur
  // (slot.cancelledAt != null). Le badge + aria-label + SheetDescription
  // dérivent de `activeCount` ; le gate état-vide reste sur `count` (longueur
  // totale) pour qu'un cas « que des annulés » affiche quand même le panel.
  const activeCount = eventReservations.filter(isActiveBooking).length

  // Patch (revue 1.6) : fermer l'overlay AVANT d'ouvrir la ConfirmCancelDialog
  // modale partagée — évite l'empilement Popover/Sheet + Dialog (smell a11y :
  // overlay ouvert mis en aria-hidden + double focus-trap).
  const handleCancel = onCancelReservation
    ? (slotId: string) => {
        setOpen(false)
        onCancelReservation(slotId)
      }
    : undefined

  // Trigger « Mes réservations » — DS Button outline : icône CalendarClock
  // (brute, sans badge) à gauche + libellé + Badge compteur variante info
  // à droite. Compteur toujours visible (valeur 0 autorisée, T1.1).
  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="member-reservations-trigger"
      aria-label={`Mes réservations, ${activeCount} créneau${activeCount > 1 ? 'x' : ''} réservé${activeCount > 1 ? 's' : ''}`}
      aria-expanded={open}
    >
      <CalendarClock aria-hidden="true" />
      Mes réservations
      <Badge variant="info" size="sm" data-testid="member-reservations-count">
        {activeCount}
      </Badge>
    </Button>
  )

  // Contenu partagé entre Popover (desktop) et Sheet (mobile).
  const content = (
    <div data-testid="member-reservations-content" className="space-y-2">
      {count === 0 ? (
        // État vide contextuel (message seul — fermeture via Échap / clic extérieur).
        <div className="py-3 text-center" data-testid="member-reservations-empty">
          <p className="text-sm text-muted-foreground">
            Aucune réservation pour « {eventName} » pour le moment.
          </p>
        </div>
      ) : (
        // Liste condensée (1 ligne/réservation + bouton « Annuler » inline) + récap partagé.
        <MyReservationsPanel
          variant="compact"
          reservations={eventReservations}
          onCancel={handleCancel}
          isCancelling={cancellingSlotId}
        />
      )}
    </div>
  )

  // --- Mobile : Sheet bottom (AC3) ----------------------------------------
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          data-testid="member-reservations-sheet"
          className="h-[70vh] rounded-t-lg"
        >
          <SheetHeader>
            {/* SheetTitle obligatoire (a11y Radix). Sr-only : le titre visuel
                « Mes réservations » est rendu dans le contenu partagé. */}
            <SheetTitle className="sr-only">
              Mes réservations — {eventName}
            </SheetTitle>
            <SheetDescription className="sr-only">
              {activeCount} réservation{activeCount > 1 ? 's' : ''} pour cet événement.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-2 overflow-y-auto">{content}</div>
        </SheetContent>
      </Sheet>
    )
  }

  // --- Desktop : Popover (AC2) --------------------------------------------
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 z-50 max-h-[min(70vh,var(--radix-popover-content-available-height))] overflow-y-auto"
        data-testid="member-reservations-popover"
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}
