import type { HTMLAttributes } from 'react'
import { Badge } from '@/components/ui/badge'
import { structuralBadgeWording } from './StructuralBadge.constants'

type StructuralBadgeLabel = 'En-tête' | 'Corps' | 'Pied'

interface StructuralBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  label: StructuralBadgeLabel
  /** Le bloc sélectionné n'a pas de cible de sauvegarde au niveau courant. Le
   *  badge ne doit alors PAS annoncer « modifiable » : il cohabite à l'écran avec
   *  le panneau d'héritage qui dit précisément le contraire, et cette
   *  contradiction est exactement l'ambiguïté que le chantier du 2026-07-30
   *  entreprenait de lever. La policy prescrit le libellé « modifiable, non
   *  supprimable » pour un élément structurel — ce qu'un bloc hérité n'est pas
   *  encore. */
  inherited?: boolean
}

const LABEL_SLUG: Record<StructuralBadgeLabel, string> = {
  'En-tête': 'header',
  'Corps': 'body',
  'Pied': 'footer',
}


export const StructuralBadge = ({ label, inherited = false, ...rest }: StructuralBadgeProps) => {
  const wording = structuralBadgeWording(inherited)
  return (
    <Badge
      variant="default"
      size="sm"
      // La pilule n'existait pas visuellement : son fond est à 1,05:1 de celui de
      // la barre (mesuré), donc il ne restait qu'une phrase de 12 px qu'on prenait
      // pour un surlignage résiduel — et c'est le SEUL texte de la barre aux deux
      // paliers les plus étroits. Le liseré lui rend un contour : le jeton
      // `muted-foreground` est à 4,63:1 sur le fond de la barre, au-dessus des
      // 3:1 de WCAG 1.4.11. Le texte, lui, n'a jamais été en cause (13,34:1).
      className="border border-muted-foreground"
      data-testid={`structural-badge-${LABEL_SLUG[label]}`}
      data-label={label}
      data-inherited={inherited}
      {...rest}
    >
      {/* Les deux formulations coexistent dans le DOM, une seule est RENDUE : le
          palier est publié par la barre d'outils en `data-toolbar-tier`
          (`group/toolbar`), mesuré et non seuillé, et une règle CSS ne peut pas
          changer un contenu — seulement sa visibilité.

          `display: none` et surtout PAS `sr-only` : les deux formes seraient alors
          simultanément dans l'arbre d'accessibilité. Le badge est de toute façon
          en `aria-hidden` chez son appelant — c'est la région live de la barre qui
          porte le texte pour les aides techniques, et elle annonce toujours la
          forme longue.

          Ce composant n'a qu'un appelant, cette barre. Rendu hors d'un conteneur
          portant `group/toolbar`, aucune variante ne se déclencherait et c'est la
          forme LONGUE qui resterait affichée — le repli le plus sûr : elle est
          complète. À revoir si un second appelant apparaît. */}
      <span className="group-data-[toolbar-tier=court]/toolbar:hidden group-data-[toolbar-tier=resserre]/toolbar:hidden group-data-[toolbar-tier=icones]/toolbar:hidden">
        {wording.long}
      </span>
      <span className="hidden group-data-[toolbar-tier=court]/toolbar:inline group-data-[toolbar-tier=resserre]/toolbar:inline group-data-[toolbar-tier=icones]/toolbar:inline">
        {wording.short}
      </span>
    </Badge>
  )
}
