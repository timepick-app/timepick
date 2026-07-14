import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface SelfDemotionConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Dialogue de confirmation pour l'auto-démotion d'un administrateur.
 *
 * Affiché lorsqu'un admin modifie son propre rôle de "admin" vers "user",
 * avec un avertissement clair sur les conséquences (perte d'accès admin).
 */
export function SelfDemotionConfirmDialog({
  open,
  onConfirm,
  onCancel
}: SelfDemotionConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            Confirmation requise
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-left py-2">
              <p className="font-medium text-gray-900 text-base">
                Vous allez perdre vos accès admin. Voulez-vous continuer ?
              </p>
              <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
                <li>Vous serez déconnecté immédiatement</li>
                <li>Vous serez redirigé vers l'accueil</li>
                <li>Vous perdrez l'accès à toutes les pages d'administration</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onCancel}>
            Fermer
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
