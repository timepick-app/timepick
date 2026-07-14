import { ArrowLeft, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { EventStatusBadge } from './EventStatusBadge'
import { EventEditActions } from './EventEditActions'
import type { Event } from '@/hooks/useEvents'

interface EventEditHeaderProps {
  event: Event
  onBack: () => void
  onSave: () => void
  onReset: () => void
  onPublish: () => void
  onUnpublish: () => void
  isUpdating: boolean
  hasUnsavedChanges: boolean
}

/**
 * EventEditHeader — en-tete de la page admin d'edition d'evenement.
 * Grid `.event-header` : eyebrow (retour + label action + statut + aide) en ligne 1,
 * H1 = nom de l'evenement (line-clamp-2) en ligne 2 pleine largeur, actions a droite.
 * Le H1 shell est supprime par AdminLayout sur cette route (cf. isAdminEventEditRoute) :
 * ce composant porte donc le <h1> de page. Pattern miroir de MemberEventStickyHeader.
 * Doit etre rendu sous un <TooltipProvider> (fourni par EventFormPage).
 */
export function EventEditHeader({ event, onBack, onSave, onReset, onPublish, onUnpublish, isUpdating, hasUnsavedChanges }: EventEditHeaderProps) {
  const { t } = useTranslation()
  const isPublished = event.isPublished
  return (
    <header className="event-header" data-testid="event-edit-header">
      <div className="event-header__eyebrow flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour à la liste des événements" className="-ml-2 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Typography as="span" variant="body-xs" color="muted" weight="medium" className="uppercase tracking-wide">
          Modifier l'événement
        </Typography>
        <EventStatusBadge isPublished={isPublished} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Aide sur le statut de publication" className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {isPublished ? t('eventPublishBanner.publishedHelp') : t('eventPublishBanner.draftHelp')}
          </TooltipContent>
        </Tooltip>
      </div>
      <Typography variant="h1" className="event-header__title line-clamp-2 break-words transition-[font-size] duration-200 motion-reduce:transition-none group-data-[condensed]/sticky:text-xl group-data-[condensed]/sticky:line-clamp-1">
        {event.name}
      </Typography>
      <div className="event-header__actions">
        <EventEditActions
          isPublished={isPublished}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          isUpdating={isUpdating}
          onSave={onSave}
          onReset={onReset}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      </div>
    </header>
  )
}
