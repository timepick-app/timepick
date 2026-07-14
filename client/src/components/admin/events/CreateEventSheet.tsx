import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { EventForm } from './EventForm'
import type { EventFormRef } from './EventForm'
import { useCreateEvent } from '@/hooks/useEvents'
import { extractErrorMessage } from '@/lib/extractErrorMessage'
import { useMediaQuery } from '@/hooks/useMediaQuery'

interface CreateEventSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * CreateEventSheet
 *
 * Sheet de création d'événement : formulaire Détails seul + bouton Créer.
 * Au clic Créer : POST /admin/events → redirection vers la vue d'édition + toast succès.
 * Erreur 409 (nom déjà pris) : affichée sur le champ Nom via nameError.
 * Autre erreur : toast.error.
 */
export function CreateEventSheet({ open, onOpenChange }: CreateEventSheetProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const navigate = useNavigate()
  const formRef = useRef<EventFormRef>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const { createEvent, isCreating } = useCreateEvent()

  async function handleCreate() {
    const data = formRef.current?.submit()
    if (!data) return

    let created: Awaited<ReturnType<typeof createEvent>>
    try {
      created = await createEvent({
        name: data.name,
        description: data.description,
        opensAt: data.opensAt,
      })
    } catch (err) {
      const error = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
      if (error.response?.status === 409) {
        setNameError('Un événement porte déjà ce nom')
      } else {
        toast.error(extractErrorMessage(error, 'Erreur lors de la création de l\'événement'))
      }
      return
    }

    onOpenChange(false)
    navigate(`/admin/events/${created.id}/edit`)
    toast.success('Événement créé — ajoutez vos créneaux et invités')
  }

  useEffect(() => {
    if (open) setNameError(null)
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'h-[85vh] rounded-t-lg' : undefined}
      >
        <SheetHeader>
          <SheetTitle>Nouvel événement</SheetTitle>
        </SheetHeader>
        <EventForm
          ref={formRef}
          nameError={nameError}
          onClearNameError={() => setNameError(null)}
          isSubmitting={isCreating}
        />
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Annuler
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            Créer
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
