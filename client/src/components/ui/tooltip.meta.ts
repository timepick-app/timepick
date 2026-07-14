import type { ComponentMeta } from './_meta/types'

export const tooltipMeta: ComponentMeta = {
  name: 'Tooltip',
  importPath: '@/components/ui/tooltip',
  summary:
    "Infobulle non-interactive basée sur Radix UI (`@radix-ui/react-tooltip`). Apparaît au survol/focus d'un déclencheur pour fournir un complément contextuel court — jamais une action. Quatre exports : `Tooltip` (Root, contrôlable via `open` + `onOpenChange`), `TooltipTrigger` (déclencheur, à coupler avec `asChild`), `TooltipContent` (wrapper `forwardRef` portalisé : `z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground`, `sideOffset={4}` par défaut, `side` héritée de Radix, animations `data-[state]`/`data-[side]`) et `TooltipProvider` (contexte de délai/désactivation à poser une fois en haut du layout). Deux sous-usages canoniques : l'info-tooltip (icône `<Info>` à côté d'un label pour expliciter un terme) et l'overflow-tooltip (texte tronqué `truncate` dont le tooltip révèle le contenu intégral). Sans variantes cva : la largeur se pilote par `className` (`max-w-xs`) sur `TooltipContent`.",
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: "Toujours envelopper l'icône `<Info>` dans un `<button type=\"button\" aria-label=\"Plus d'informations\">` (avec `inline-flex text-muted-foreground hover:text-foreground transition-colors`) servant de `TooltipTrigger` — jamais l'icône directement, qui n'est pas focusable au clavier",
      correct:
        '<Tooltip>\n  <TooltipTrigger asChild>\n    <button type="button" aria-label="Plus d\'informations" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">\n      <Info className="h-3.5 w-3.5" />\n    </button>\n  </TooltipTrigger>\n  <TooltipContent className="max-w-xs">…</TooltipContent>\n</Tooltip>',
      wrong:
        '<TooltipTrigger asChild>\n  <Info className="h-3.5 w-3.5" />\n</TooltipTrigger> // icône nue = pas de focus clavier, pas de rôle bouton',
    },
    {
      rule: '`TooltipContent` doit porter `className="max-w-xs"` pour les textes longs afin de forcer le retour à la ligne et garder une largeur lisible',
      correct: '<TooltipContent className="max-w-xs">Les rendezements clôturés ne peuvent plus être modifiés.</TooltipContent>',
      wrong: '<TooltipContent>Les rendezements clôturés ne peuvent plus être modifiés.</TooltipContent> // largeur non bornée, la bulle s\'étire sur une seule ligne',
    },
    {
      rule: "`TooltipProvider` se place au niveau du layout/page (une fois pour toute l'app) ; ne l'envelopper dans un composant feuille que si la page parente n'en fournit aucun",
      correct:
        '// layout.tsx\n<TooltipProvider>\n  <Outlet />\n</TooltipProvider>\n\n// composant feuille (sans provider local)\n<Tooltip>\n  <TooltipTrigger asChild>…</TooltipTrigger>\n  <TooltipContent>…</TooltipContent>\n</Tooltip>',
      wrong:
        '// chaque composant feuille wrap son propre provider\n<TooltipProvider>\n  <Tooltip>\n    <TooltipTrigger asChild>…</TooltipTrigger>\n    <TooltipContent>…</TooltipContent>\n  </Tooltip>\n</TooltipProvider> // providers redondants quand la page en a déjà un',
    },
  ],
  antiPatterns: [],
  examples: [
    {
      label: 'Import',
      code: 'import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"',
    },
    {
      label: 'Info-tooltip à côté d\'un label (pattern entonnoir)',
      code: `<Tooltip>
  <TooltipTrigger asChild>
    <button type="button" aria-label="Plus d'informations" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
      <Info className="h-3.5 w-3.5" />
    </button>
  </TooltipTrigger>
  <TooltipContent className="max-w-xs">
    Les rendezements clôturés ne peuvent plus être modifiés.
  </TooltipContent>
</Tooltip>`,
    },
    {
      label: 'Overflow-tooltip sur texte tronqué',
      code: `<Tooltip>
  <TooltipTrigger asChild>
    <span className="truncate">Très long nom de campagne susceptible d'être coupé par le conteneur</span>
  </TooltipTrigger>
  <TooltipContent className="max-w-xs">
    Très long nom de campagne susceptible d'être coupé par le conteneur
  </TooltipContent>
</Tooltip>`,
    },
  ],
}
