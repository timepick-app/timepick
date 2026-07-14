import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'

/**
 * EventStatusBadge
 *
 * Badge de statut de publication d'un événement : « Brouillon » (orange)
 * ou « Publié » (vert), avec un point coloré en tête. Apparence « soft »
 * (fond clair + bordure) pour un chip de statut peu intrusif.
 *
 * L'aria-live reste géré par l'appelant (eyebrow / banner) — ce composant
 * ne rend que le Badge lui-même.
 *
 * @see EventCreateBanner, EventEditHeader
 */
export function EventStatusBadge({ isPublished }: { isPublished: boolean }) {
  const { t } = useTranslation()
  return (
    <Badge
      appearance="soft"
      variant={isPublished ? 'success' : 'draft'}
      icon={<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
    >
      {t(isPublished ? 'eventPublishBanner.published' : 'eventPublishBanner.draft')}
    </Badge>
  )
}
