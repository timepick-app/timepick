import type { HTMLAttributes } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BlockOrigin } from '@/services/editor-context.service'

export type LockedShellPartKind = 'header' | 'footer'

interface LockedShellInfoPanelProps extends HTMLAttributes<HTMLDivElement> {
  origin: BlockOrigin
  partKind: LockedShellPartKind
  /** Crée la surcharge de coque au niveau courant. Le handler vit dans
   *  l'overlay hôte, pas ici : matérialiser la surcharge exige de re-pousser le
   *  canvas GrapesJS (rejeu de la passe de verrous) pour que le bloc devienne
   *  éditable dans le même écran, et le canvas n'est pas accessible d'ici. Ce
   *  panneau est purement présentationnel. */
  onCustomize: () => void
  /** PUT en cours — désactive le bouton et bascule son icône. */
  isCustomizing: boolean
}

const ORIGIN_DESCRIPTION: Record<BlockOrigin, string> = {
  template: "Ce contenu est défini au niveau du modèle d'invitation.",
  brand: 'Ce contenu est défini au niveau de la marque (Paramètres > Email).',
  hardcoded: "Ce contenu est le contenu d'origine fourni avec l'application.",
  event: "Ce contenu est défini au niveau de cet événement.",
}

const PART_KIND_LABEL: Record<LockedShellPartKind, string> = {
  header: 'en-tête',
  footer: 'pied',
}

export const LockedShellInfoPanel = ({
  origin,
  partKind,
  onCustomize,
  isCustomizing,
  ...rest
}: LockedShellInfoPanelProps) => {
  const description = ORIGIN_DESCRIPTION[origin]
  const partLabel = PART_KIND_LABEL[partKind]

  return (
    <div
      data-testid={`locked-shell-info-panel-${partKind}`}
      data-origin={origin}
      className="space-y-3 p-4"
      {...rest}
    >
      <h3 className="text-sm font-semibold">
        Ce contenu est défini au niveau supérieur
      </h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <p className="text-xs text-muted-foreground">
        Élément concerné&nbsp;: {partLabel}
      </p>
      {/* Wording de la politique de personnalisation de la coque email,
          section « Indicateurs de contenu hérité ». */}
      <p className="text-sm text-muted-foreground">
        Cliquez sur «&nbsp;Personnaliser ce bloc&nbsp;» pour le modifier ici.
      </p>
      {/* Action primaire ET unique du panneau : size/variant `default` (h-9).
          `w-full` = dérogation D1 du système de design (contexte étroit) : un CTA
          solitaire a sa position par défaut à DROITE, et un bouton laissé en
          largeur auto dans un flux de bloc se colle à gauche — aucune des trois
          formes admises. Le panneau faisant `w-80`, D1 est la dérogation qui
          convient plutôt qu'un conteneur `justify-end`.
          Un dismiss `ghost` cohabite dans l'en-tête du panneau — ce n'est pas son
          pair d'action, l'anti-pattern « hauteurs mixtes dans une paire
          d'actions » ne s'y applique pas. */}
      <Button
        type="button"
        size="default"
        variant="default"
        className="w-full"
        disabled={isCustomizing}
        // R10 bis exempte du libellé dynamique le bouton dont l'ICÔNE porte
        // l'information transitoire — mais cette icône est `aria-hidden`, donc
        // muette pour un lecteur d'écran, à qui il ne resterait que `disabled`.
        // `aria-busy` rétablit l'information sur ce canal sans changer le patron.
        aria-busy={isCustomizing}
        onClick={onCustomize}
        data-testid={`locked-shell-customize-btn-${partKind}`}
      >
        {isCustomizing ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Pencil aria-hidden="true" />
        )}
        Personnaliser ce bloc
      </Button>
    </div>
  )
}
