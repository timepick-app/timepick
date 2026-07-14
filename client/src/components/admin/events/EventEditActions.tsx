import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/**
 * Props pour EventEditActions — barre d'actions du mode édition d'événement.
 */
interface EventEditActionsProps {
  /** Indique si l'événement est publié */
  isPublished: boolean
  /** Callback appelé pour publier l'événement */
  onPublish: () => void
  /** Callback appelé pour dépublier l'événement */
  onUnpublish: () => void
  /** Indique si une opération de mise à jour (publier/dépublier) est en cours */
  isUpdating: boolean
  /** Callback appelé pour enregistrer les modifications */
  onSave: () => void
  /** Callback appelé pour annuler les modifications non sauvegardées */
  onReset: () => void
  /** Indique s'il y a des modifications non sauvegardées */
  hasUnsavedChanges: boolean
}

/**
 * EventEditActions Component
 *
 * Barre d'actions du mode édition d'un événement : Annuler les modifications,
 * Enregistrer, et bascule Publier / Dépublier. Extraite de l'ancien
 * `EventPublishBanner` (branche édition, ex-l.142-171) lors de la refonte de
 * l'en-tête admin en grille CSS (`.event-header`).
 *
 * Tous les boutons utilisent la taille `default` (h-9) — cf. règle DS
 * `button.meta.ts` : Réinitialiser + Sauvegarder + Publier partagent la même
 * hauteur. Ne JAMAIS passer `size="sm"`.
 */
export function EventEditActions({
  isPublished,
  onPublish,
  onUnpublish,
  isUpdating,
  onSave,
  onReset,
  hasUnsavedChanges,
}: EventEditActionsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-2 justify-end max-sm:[&>button]:flex-1">
      {/* Annuler les modifications — uniquement si modifications non sauvegardées */}
      {hasUnsavedChanges && (
        <Button
          data-action="reset"
          variant="outline"
          onClick={onReset}
          disabled={isUpdating}
          className="max-lg:group-data-[condensed]/sticky:hidden"
        >
          {t('eventPublishBanner.resetChanges')}
        </Button>
      )}

      {/* Bascule de publication : Publier (brouillon) / Dépublier (publié) */}
      <Button
        data-action="publish"
        onClick={isPublished ? onUnpublish : onPublish}
        disabled={isUpdating}
        variant={isPublished ? 'outline' : 'default'}
        aria-label={t(isPublished ? 'eventPublishBanner.publishedAriaLabel' : 'eventPublishBanner.draftAriaLabel')}
        className="max-lg:group-data-[condensed]/sticky:hidden"
      >
        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t(isPublished ? 'eventPublishBanner.unpublish' : 'eventPublishBanner.publish')}
      </Button>

      {/* Enregistrer les modifications — CTA principal, placé à droite */}
      <Button
        data-action="save"
        onClick={onSave}
        disabled={isUpdating || !hasUnsavedChanges}
      >
        {t('eventPublishBanner.save')}
      </Button>
    </div>
  )
}
