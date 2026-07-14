import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { EventTable, type EventTableRow } from '@/components/admin/events/EventTable'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Badge } from '@/components/ui/badge'
import { useEvents, useAllEventsStats, useDeleteEvent, useDuplicateEvent } from '@/hooks/useEvents'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import type { Event } from '@/hooks/useEvents'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { CreateEventSheet } from '@/components/admin/events/CreateEventSheet'

/**
 * Bouton d'ouverture de la sheet de création d'événement
 * Extrait comme composant pour éviter la répétition dans les états de chargement/erreur
 */
function NewEventButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <CalendarPlus />
      Nouvel événement
    </Button>
  )
}

/**
 * EventsListPage
 *
 * Page complète de gestion des événements avec tableau TanStack Table
 *
 * Cette page remplace l'ancienne Events.tsx basée sur EventCard
 *
 * Features :
 * - Tableau responsive avec tri
 * - Bouton "Nouvel événement" (ouvre CreateEventSheet)
 * - Menu d'actions par ligne (Éditer, Dupliquer, Supprimer)
 * - Gestion des états de chargement et d'erreur
 */
export default function EventsListPage() {
  const navigate = useNavigate()
  const { isAuthChecked } = useAdminAuth()
  useDocumentTitle()
  const [createOpen, setCreateOpen] = useState(false)

  // Récupération des événements avec React Query
  const { events, isLoading: eventsLoading, error: eventsError } = useEvents()

  // Récupération des stats pour tous les événements
  const { data: allStats, isLoading: statsLoading } = useAllEventsStats()

  // Hook de suppression d'événement
  const { deleteEvent, isDeleting } = useDeleteEvent()

  // Hook de duplication d'événement avec callback onSuccess pour navigation (AC3)
  const { duplicateEvent, isDuplicating } = useDuplicateEvent({
    onSuccess: (newEventId) => {
      // AC3: Après succès, rediriger vers /admin/events/:id/edit
      navigate(`/admin/events/${newEventId}/edit`)
    }
  })

  /**
   * Combine les données events avec leurs stats
   */
  const tableData: EventTableRow[] = events.map((event) => {
    const stats = allStats?.find((s) => s.eventId === event.id)
    return { ...event, stats }
  })

  // Répartition publiés / brouillons pour les chips de statut (donnée déjà chargée).
  const publishedCount = events.filter((event) => event.isPublished).length
  const draftCount = events.length - publishedCount

  /**
   * Action: Éditer un événement
   * Story 11.1 : Naviguer vers /admin/events/:id/edit
   */
  const handleEdit = (event: Event) => {
    navigate(`/admin/events/${event.id}/edit`)
  }

  /**
   * Action: Dupliquer un événement
   * Story 10-4 : Implémenté avec useDuplicateEvent
   * AC3: Après succès, la navigation est gérée par le callback onSuccess dans le hook
   */
  const handleDuplicate = (event: Event) => {
    duplicateEvent(event.id)
  }

  /**
   * Action: Supprimer un événement
   * Story 10.3 : Implémenté avec useDeleteEvent + Dialog de confirmation
   */
  const handleDelete = (_event: Event) => {
    // La dialog de confirmation est gérée par EventTable
    // Ce callback est appelé pour ouvrir la dialog
  }

  /**
   * Action: Confirmer la suppression d'un événement
   * Appelé par EventDeleteDialog après confirmation
   */
  const handleConfirmDelete = async (eventId: string) => {
    await deleteEvent(eventId)
  }

  // Afficher l'état de chargement pendant la vérification auth
  if (!isAuthChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Typography color="muted">Vérification des droits d'accès...</Typography>
      </div>
    )
  }

  // Afficher l'état de chargement des données
  if (eventsLoading) {
    return (
      <>
        <AdminLayout>
          <div className="space-y-6">
            <div className="flex justify-end">
              <NewEventButton onClick={() => setCreateOpen(true)} />
            </div>
            <EventTable data={[]} isLoading={true} />
          </div>
        </AdminLayout>
        <CreateEventSheet open={createOpen} onOpenChange={setCreateOpen} />
      </>
    )
  }

  // Afficher l'état d'erreur
  if (eventsError) {
    return (
      <>
        <AdminLayout>
          <div className="space-y-6">
            <div className="flex justify-end">
              <NewEventButton onClick={() => setCreateOpen(true)} />
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              Erreur lors du chargement des événements : {eventsError}
            </div>
          </div>
        </AdminLayout>
        <CreateEventSheet open={createOpen} onOpenChange={setCreateOpen} />
      </>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* En-tête : compteur + statut (étage donnée) au-dessus de la guidance conservée. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">
                {events.length} {events.length > 1 ? 'événements' : 'événement'}
              </Badge>
              {publishedCount > 0 && (
                <Badge
                  appearance="soft"
                  variant="success"
                  icon={<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
                >
                  {publishedCount} {publishedCount > 1 ? 'publiés' : 'publié'}
                </Badge>
              )}
              {draftCount > 0 && (
                <Badge
                  appearance="soft"
                  variant="draft"
                  icon={<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
                >
                  {draftCount} {draftCount > 1 ? 'brouillons' : 'brouillon'}
                </Badge>
              )}
            </div>
            <Typography variant="body-sm" color="muted">
              Gérez vos événements et leurs créneaux horaires
            </Typography>
          </div>
          <NewEventButton onClick={() => setCreateOpen(true)} />
        </div>

        {/* Tableau des événements */}
        <EventTable
          data={tableData}
          isLoading={statsLoading && events.length > 0}
          isDeleting={isDeleting}
          isDuplicating={isDuplicating}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onConfirmDelete={handleConfirmDelete}
        />
      </div>
      <CreateEventSheet open={createOpen} onOpenChange={setCreateOpen} />
    </AdminLayout>
  )
}
