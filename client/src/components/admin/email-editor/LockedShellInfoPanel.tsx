import type { HTMLAttributes } from 'react'
import type { BlockOrigin } from '@/services/editor-context.service'

export type LockedShellPartKind = 'header' | 'footer'

interface LockedShellInfoPanelProps extends HTMLAttributes<HTMLDivElement> {
  origin: BlockOrigin
  partKind: LockedShellPartKind
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
      <p className="text-xs text-muted-foreground">
        Cette fonctionnalité n'est pas encore disponible.
      </p>
    </div>
  )
}
