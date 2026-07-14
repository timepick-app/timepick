import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Event } from '../../hooks/useEvents'
import { Pencil, Mail, Users } from 'lucide-react'
import { PublishButton } from './PublishButton'
import { OpeningDateInput } from './OpeningDateInput'
import { useEventUsers } from '../../hooks/useEvents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { htmlToPlainText } from '@/lib/richText'

interface EventCardProps {
  event: Event
  onEdit: (event: Event) => void
}

/**
 * EventCard Component
 * Affiche une carte événement avec le bouton Modifier et Publier/Dépublier
 * Inclut le composant OpeningDateInput pour gérer la date d'ouverture
 * Affiche un indicateur si le template d'invitation est personnalisé
 * Affiche le nombre d'utilisateurs autorisés
 */
export function EventCard({ event, onEdit }: EventCardProps) {
  const { data: eventUsers } = useEventUsers(event.id)
  const userCount = eventUsers?.length || 0

  const statusBadge = event.isPublished ? (
    <Badge variant="success">Publié</Badge>
  ) : (
    <Badge variant="draft">Brouillon</Badge>
  )

  // Vérifier si le template est personnalisé
  const isCustomTemplate = event.hasCustomInvitation

  const descriptionPreview = htmlToPlainText(event.description)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-lg font-medium text-gray-900">{event.name}</h3>
            {statusBadge}
            {isCustomTemplate && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                title="Template d'invitation personnalisé"
              >
                <Mail className="h-3 w-3" />
                Email personnalisé
              </span>
            )}
            {userCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                title={`${userCount} utilisateur${userCount > 1 ? 's' : ''} autorisé${userCount > 1 ? 's' : ''}`}
              >
                <Users className="h-3 w-3" />
                {userCount}
              </span>
            )}
          </div>
          {/* Aperçu texte : strip le HTML pour éviter les balises brutes dans le clamp */}
          {descriptionPreview && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{descriptionPreview}</p>
          )}
          <div className="mt-3 space-y-2">
            {/* Date d'ouverture des inscriptions - composant interactif */}
            <OpeningDateInput event={event} />
            <p className="text-xs text-gray-400">
              Mis à jour le {format(new Date(event.updatedAt), 'PPP', { locale: fr })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(event)}
            title="Modifier l'événement"
          >
            <Pencil className="h-5 w-5" />
          </Button>
          <PublishButton event={event} />
        </div>
      </div>
    </div>
  )
}
