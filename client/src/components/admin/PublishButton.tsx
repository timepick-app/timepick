import { useState } from 'react'
import { usePublishEvent, useUnpublishEvent } from '../../hooks/useEvents'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '@/components/ui/button'
import type { Event } from '../../hooks/useEvents'

interface PublishButtonProps {
  event: Event
}

/**
 * PublishButton Component
 * Permet de publier ou dépublier un événement avec confirmation
 */
export function PublishButton({ event }: PublishButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { publishEvent, isPublishing } = usePublishEvent()
  const { unpublishEvent, isUnpublishing } = useUnpublishEvent()

  const isPublished = event.isPublished
  const isLoading = isPublishing || isUnpublishing

  const handleConfirm = async () => {
    try {
      if (isPublished) {
        await unpublishEvent(event.id)
      } else {
        await publishEvent(event.id)
      }
      setIsDialogOpen(false)
    } catch {
      // Erreur gérée dans les hooks via toast
    }
  }

  return (
    <>
      <Button
        variant={isPublished ? 'outline' : 'default'}
        size="sm"
        onClick={() => setIsDialogOpen(true)}
        disabled={isLoading}
      >
        {isLoading ? 'Chargement...' : isPublished ? 'Dépublier' : 'Publier'}
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isPublished ? 'Dépublier l\'événement' : 'Publier l\'événement'}
            </DialogTitle>
            <DialogDescription>
              {isPublished
                ? 'Voulez-vous vraiment dépublier cet événement ? Il ne sera plus accessible aux utilisateurs.'
                : 'Voulez-vous vraiment publier cet événement ? Il sera accessible aux utilisateurs via son URL publique.'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isLoading}
            >
              Fermer
            </Button>
            <Button
              variant={isPublished ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? 'Traitement...' : isPublished ? 'Dépublier' : 'Publier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
