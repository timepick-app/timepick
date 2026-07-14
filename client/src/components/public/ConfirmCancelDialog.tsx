import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Props pour le composant ConfirmCancelDialog
 */
export interface ConfirmCancelDialogProps {
  /** Le dialog est ouvert ou fermé */
  open: boolean
  /** Callback lorsque l'utilisateur confirme l'annulation */
  onConfirm: () => void
  /** Callback lorsque l'utilisateur annule (ferme le dialog) */
  onCancel: () => void
  /** L'annulation est en cours */
  isCancelling?: boolean
}

/**
 * Dialog de confirmation pour annuler une réservation
 *
 * AC5: Affiche une dialog de confirmation :
 * "Êtes-vous sûr de vouloir annuler cette réservation ?"
 *
 * AC7: Message informatif sur la libération de place
 *
 * Features:
 * - Bouton "Non, garder ma réservation" (outline)
 * - Bouton "Oui, annuler" (destructive)
 * - État de chargement pendant l'annulation
 *
 * @example
 * <ConfirmCancelDialog
 *   open={showDialog}
 *   onConfirm={() => cancelReservation()}
 *   onCancel={() => setShowDialog(false)}
 *   isCancelling={isPending}
 * />
 */
export function ConfirmCancelDialog({
  open,
  onConfirm,
  onCancel,
  isCancelling = false,
}: ConfirmCancelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md" data-testid="confirm-cancel-dialog">
        <DialogHeader>
          <DialogTitle>Confirmer l'annulation</DialogTitle>
          <DialogDescription>
            Êtes-vous sûr de vouloir annuler cette réservation ?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-gray-600">
            Votre place sera libérée pour les autres participants.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isCancelling}
            data-testid="cancel-dialog-keep-button"
          >
            Non, garder ma réservation
          </Button>
          <Button
            variant="outline-destructive"
            onClick={onConfirm}
            disabled={isCancelling}
            data-testid="cancel-dialog-confirm-button"
          >
            {isCancelling ? 'Annulation...' : 'Oui, annuler'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
