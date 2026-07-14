import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle } from 'lucide-react'
import type { Slot } from '@/types/slot'
import { buttonVariants } from '@/components/ui/button'

const CANCELLATION_REASON_MAX = 500

interface SlotDeleteDialogProps {
  slot: Slot | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (slotId: string, cancellationReason?: string, hadReservations?: boolean) => void
  isDeleting?: boolean
}

/**
 * SlotDeleteDialog Component
 *
 * Dialog de confirmation dont le wording dépend du nombre d'inscrits
 * (spec-conditional-slot-cancellation) :
 * - 0 inscrit  → « Supprimer définitivement ce créneau ? » + « irréversible »,
 *   sans champ motif (le créneau est supprimé en base).
 * - ≥1 inscrit → « Annuler ce créneau ? » : les inscrits seront informés et
 *   leurs réservations conservées, avec champ motif (soft-delete).
 * - preventDefault sur AlertDialogAction pour éviter la fermeture prématurée.
 * - Bouton de confirmation désactivé pendant l'opération (isDeleting).
 */
export function SlotDeleteDialog({
  slot,
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: SlotDeleteDialogProps) {
  const bookingCount = slot?.currentBookings ?? 0
  const hasReservations = bookingCount > 0
  const isPlural = bookingCount > 1
  const [cancellationReason, setCancellationReason] = useState('')

  // Reset le motif quand la dialog se ferme (évite la fuite entre suppressions
  // successives de créneaux distincts). Ajustement pendant le rendu plutôt qu'un
  // setState dans un effet : couvre aussi la fermeture pilotée par le parent
  // (open passé à false après suppression) et évite le double rendu.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setCancellationReason('')
    }
  }

  const handleConfirm = (e: React.MouseEvent<HTMLButtonElement>) => {
    // CRITICAL: preventDefault empêche la fermeture immédiate de la dialog
    // Sans cela, la dialog se ferme avant que la suppression ne soit terminée
    e.preventDefault()

    if (!slot) return

    const trimmed = cancellationReason.trim()
    // hadReservations reflète ce que l'admin voit (annulation vs suppression) et
    // ne sert qu'au wording du toast de confirmation ; le serveur reste seul
    // décideur de l'action réelle (DELETE si 0 inscrit, soft-delete sinon).
    onConfirm(slot.id, trimmed.length > 0 ? trimmed : undefined, hasReservations)
  }

  // Empêcher la fermeture pendant la suppression (overlay clic, ESC)
  const handleOpenChange = (newOpen: boolean) => {
    // Autoriser le changement si : ouverture demandée OU pas de suppression en cours
    if (newOpen || !isDeleting) {
      onOpenChange(newOpen)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            {hasReservations
              ? 'Annuler ce créneau ?'
              : 'Supprimer définitivement ce créneau ?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasReservations ? (
              <>
                <strong>{bookingCount}</strong> inscrit{isPlural ? 's' : ''} en ser{isPlural ? 'ont' : 'a'} informé{isPlural ? 's' : ''} ; {isPlural ? 'leurs réservations sont conservées' : 'sa réservation est conservée'}.
              </>
            ) : (
              <>Cette action est irréversible.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasReservations && (
          <div className="space-y-2">
            <Label htmlFor="slot-cancellation-reason">
              Motif d&apos;annulation (optionnel)
            </Label>
            <Textarea
              id="slot-cancellation-reason"
              placeholder="Ex. : Événement reporté, indisponibilité de l&apos;organisateur..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              maxLength={CANCELLATION_REASON_MAX}
              disabled={isDeleting}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Visible par les participants dans l&apos;email de notification.
              {cancellationReason.length > 0 && (
                <> {cancellationReason.length} / {CANCELLATION_REASON_MAX} caractères</>
              )}
            </p>
          </div>
        )}

        <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-3">
          <AlertDialogCancel disabled={isDeleting}>
            Fermer
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={buttonVariants({ variant: 'outline-destructive' })}
            disabled={isDeleting}
          >
            {isDeleting
              ? hasReservations ? 'Annulation...' : 'Suppression...'
              : hasReservations ? 'Annuler le créneau' : 'Supprimer'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
