import type { ComponentMeta } from './_meta/types'

export const toggleGroupMeta: ComponentMeta = {
  name: 'ToggleGroup',
  importPath: '@/components/ui/toggle-group',
  summary:
    'Groupe de boutons mutuellement exclusifs basé sur Radix Toggle Group. Navigation clavier intégrée (flèches, Enter, Space). Idéal pour basculer entre des modes d\'affichage ou des vues.',
  variants: [
    {
      name: 'default',
      description: 'Style minimal sans bordure individuelle, fond transparent — pour groupes embarqués dans un conteneur stylé',
      whenToUse: "Choix par défaut pour les barres de mode où le ToggleGroup parent porte sa propre bordure et son padding (sélecteur calendrier/liste dans `SlotCalendar`, mois/semaine/liste dans `ViewToggle`, onglets de sections dans `Settings`). Préférer `default` à `outline` dès que tu fournis un `className=\"rounded-md border border-gray-200 p-1\"` sur le ToggleGroup — sinon les bordures s'empilent visuellement.",
    },
    {
      name: 'outline',
      description: 'Chaque item porte sa propre bordure et ombre — pour groupes autonomes sans conteneur parent',
      whenToUse: "Groupe de bascule autonome posé directement dans le flux, sans conteneur stylé autour (mini-toggle dans une cellule de tableau, bascule edit/preview à côté d'un titre). Préférer `outline` à `default` quand tu n'as pas envie de gérer un wrapper bordé toi-même — réserve-le aux groupes courts (2-3 items) où chaque item peut respirer comme un bouton individuel.",
    },
  ],
  sizes: [
    { name: 'default', description: 'Taille par défaut, équivalente au Button default', cssHint: 'h-9 px-2 min-w-9' },
    { name: 'sm', description: 'Petit, pour barres de contrôle compactes (sélecteurs de vue, filtres inline)', cssHint: 'h-8 px-1.5 min-w-8' },
    { name: 'lg', description: 'Grand, pour mises en avant ou contextes tactiles', cssHint: 'h-10 px-2.5 min-w-10' },
  ],
  guidelines: [
    {
      rule: 'Utiliser ToggleGroup pour les sélections mutuellement exclusives, pas un <div role="group"> bricolé',
      correct: '<ToggleGroup type="single"><ToggleGroupItem value="x">...</ToggleGroupItem></ToggleGroup>',
      wrong: '<div role="group"><button aria-pressed={...}>...</button></div>',
    },
    {
      rule: 'Empêcher la désélection d\'un item avec un guard `if (v)` dans onValueChange',
      correct: 'onValueChange={(v) => { if (v) setValue(v) }}',
      wrong: 'onValueChange={(v) => setValue(v)}',
    },
    {
      rule: 'Toujours fournir un aria-label sur le ToggleGroup et un aria-label par item pour l\'accessibilité',
      correct: '<ToggleGroup aria-label="Mode d\'affichage"><ToggleGroupItem value="month" aria-label="Vue mois">...</ToggleGroupItem></ToggleGroup>',
      wrong: '<ToggleGroup><ToggleGroupItem value="month">...</ToggleGroupItem></ToggleGroup>',
    },
    {
      rule: 'Donner une largeur de contenu au ToggleGroup posé dans un conteneur flex en colonne (barre responsive mobile) en ajoutant `w-fit` : un flex item `inline-flex` est blockifié en `flex`, donc l\'`align-items: stretch` du parent l\'étire à 100% — `inline-flex` et `shrink-0` ne suffisent pas',
      correct: '<div className="flex flex-wrap items-center gap-4"><ToggleGroup className="inline-flex w-fit ...">…</ToggleGroup></div>',
      wrong: '<div className="flex flex-col sm:flex-row ..."><ToggleGroup className="inline-flex shrink-0 ...">…</ToggleGroup></div>',
    },
    {
      rule: 'En mode compact, un ToggleGroup compresse ses items (icône + label réduit sous l\'icône) — jamais de fallback Select',
      correct: `// compact piloté par useCompactMode — le ToggleGroup reste visible, ses items changent de forme
<ToggleGroupItem className={cn(compact ? 'flex-col gap-0.5 px-2 py-1' : 'gap-1.5 px-3 shrink-0')}>
  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
  <span className={compact ? 'text-[10px] leading-tight' : 'text-sm'}>{label}</span>
</ToggleGroupItem>`,
      wrong: `{/* ❌ fallback Select = signature comportementale du TabsList, pas du ToggleGroup */}
{compact && <Select value={active} onValueChange={...}>...</Select>}
<div className={cn('overflow-hidden', compact && 'hidden')}>
  <ToggleGroup ...>`,
    },
  ],
  antiPatterns: [
    {
      title: 'Omettre `inline-flex` (ou retirer la classe par défaut) sur le ToggleGroup mesuré par useCompactMode',
      description:
        'Le pattern responsive Niveau 1 dépend du fait que le ToggleGroup déclare sa largeur naturelle (contenu) via `inline-flex`. Sans cela, useCompactMode ne peut pas comparer la largeur naturelle à l\'espace disponible et la bascule en mode compact ne se déclenchera jamais.',
    },
    {
      title: 'Oublier `flex-nowrap` + `shrink-0` sur les items lors du pattern responsive',
      description:
        'Sans `flex-nowrap` sur le ToggleGroup et `shrink-0` sur chaque ToggleGroupItem, les items s\'écrasent ou wrappent silencieusement avant que useCompactMode détecte le débordement, faussant la mesure naturelle.',
    },
    {
      title: 'Englober le contenu dans le wrapper `overflow-hidden` de mesure (useCompactMode)',
      description:
        'Le `<div ref={…} className="overflow-hidden">` qui mesure le ToggleGroup ne doit contenir QUE ce ToggleGroup. S\'il englobe aussi le contenu rendu en dessous, tout contrôle pleine largeur à fleur du bord y voit son anneau de focus rogné à gauche/droite (même cause que Drawbridge #44 côté Tabs). Garder les panneaux/contenu en dehors du wrapper. Références correctes : `components/admin/events/SlotCalendar.tsx`, `pages/Settings.tsx`. NB : `ViewToggle` ne l\'utilise plus (rendu direct — le conteneur parent n\'est jamais contraint en largeur).'
    },
    {
      title: 'ToggleGroup étiré sur 100% de la largeur comme enfant d\'un parent `flex` en colonne (manque `w-fit`)',
      description:
        'Un ToggleGroup placé dans un conteneur `flex` en colonne (typique d\'une barre d\'outils mobile `flex flex-col sm:flex-row`) devient un flex item : son `display: inline-flex` est blockifié en `flex` (niveau bloc), donc l\'`align-items: stretch` par défaut du parent l\'étire sur tout l\'axe transversal (la largeur). `inline-flex` ne protège pas (blockification) et `shrink-0` n\'agit que sur l\'axe principal (vertical en colonne). Donner une largeur définie via `w-fit` (ou `self-start`) pour qu\'il épouse son contenu. Réf. Drawbridge #30 / `ViewToggle`.',
    },
    {
      title: 'Empiler « ToggleGroup + contrôle adjacent » avec `flex-col sm:flex-row` (retour à la ligne piloté par un breakpoint fixe)',
      description:
        'Pour une barre « ToggleGroup + bouton (Filtres…) » qui doit rester sur une ligne dès qu\'il y a la place, préférer `flex flex-wrap` à `flex flex-col sm:flex-row`. Le second empile les contrôles tant que le viewport reste sous le breakpoint fixe (`sm` = 640px), même quand l\'espace horizontal est largement suffisant ; `flex-wrap` rend le retour à la ligne piloté par la place réelle (une ligne quand ça rentre, wrap seulement quand c\'est étroit). Réf. Drawbridge #31 / `EventCalendarContent`.',
    },
    {
      title: 'Ajouter un fallback Select quand un ToggleGroup est à l\'étroit (confusion avec le pattern TabsList)',
      description:
        'Un ToggleGroup ne bascule jamais en Select/dropdown. Le fallback Select (affiché quand `useCompactMode` passe en compact, ToggleGroup masqué) est la signature comportementale du composant `TabsList` — c\'est ce qui distingue les deux patterns. Un ToggleGroup gère l\'espace réduit en compressant ses items : orientation `flex-col`, icône conservée, label réduit (`text-[10px] leading-tight`). Le wrapper `overflow-hidden [contain:inline-size]` reste visible en permanence — il ne se masque pas en mode compact. Si le besoin est un fallback dropdown, utiliser `TabsList` + `TabsTrigger` + `Select`.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"',
    },
    {
      label: 'Usage basique (single, contrôlé)',
      code: `<ToggleGroup
  type="single"
  value={viewMode}
  onValueChange={(v) => { if (v) setViewMode(v) }}
  size="sm"
  aria-label="Mode d'affichage"
>
  <ToggleGroupItem value="month" aria-label="Vue mois">Mois</ToggleGroupItem>
  <ToggleGroupItem value="week" aria-label="Vue semaine">Semaine</ToggleGroupItem>
  <ToggleGroupItem value="list" aria-label="Vue liste">Liste</ToggleGroupItem>
</ToggleGroup>`,
    },
    {
      label: 'Avec icônes et labels',
      code: `<ToggleGroup
  type="single"
  value={viewMode}
  onValueChange={(v) => { if (v) setViewMode(v) }}
  className="rounded-md border border-gray-200 p-1"
  aria-label="Mode d'affichage"
>
  <ToggleGroupItem value="calendar" aria-label="Vue calendrier" className="gap-1.5">
    <Calendar className="h-4 w-4" />
    <span>Mois</span>
  </ToggleGroupItem>
  <ToggleGroupItem value="list" aria-label="Vue liste" className="gap-1.5">
    <List className="h-4 w-4" />
    <span>Liste</span>
  </ToggleGroupItem>
</ToggleGroup>`,
    },
    {
      label: 'Barre de mode responsive (toggle + contrôle adjacent)',
      code: `<div className="flex flex-wrap items-center justify-between gap-4">
  {/* w-fit empêche l'étirement à 100% imposé par align-items:stretch du parent flex */}
  <ToggleGroup
    type="single"
    value={viewMode}
    onValueChange={(v) => { if (v) setViewMode(v) }}
    size="sm"
    className="inline-flex w-fit flex-nowrap shrink-0 rounded-md border border-gray-200 p-1"
    aria-label="Mode d'affichage"
  >
    <ToggleGroupItem value="month" aria-label="Vue mois" className="shrink-0 gap-1.5">Mois</ToggleGroupItem>
    <ToggleGroupItem value="week" aria-label="Vue semaine" className="shrink-0 gap-1.5">Semaine</ToggleGroupItem>
    <ToggleGroupItem value="list" aria-label="Vue liste" className="shrink-0 gap-1.5">Liste</ToggleGroupItem>
  </ToggleGroup>
  <SlotFiltersPanel /* bouton « Filtres » */ />
</div>`,
    },
    {
      label: 'Navigation de sections auto-compressée (pattern Settings / EventEditPage)',
      code: `// Le ToggleGroup gère lui-même le mode compact — pas de fallback Select.
// En mode compact les items passent en flex-col : icône + label réduit sous l'icône.
const { ref, compact } = useCompactMode<HTMLDivElement>({ contentSelector: '[data-measure]' })

<div ref={ref} className="overflow-hidden [contain:inline-size]">
  <ToggleGroup
    type="single"
    value={activeSection}
    onValueChange={(v) => { if (v) setActiveSection(v) }}
    className="inline-flex rounded-md border border-gray-200 p-1 flex-nowrap"
    aria-label="Sections"
    data-measure
  >
    {items.map((item) => (
      <ToggleGroupItem
        key={item.value}
        value={item.value}
        aria-label={item.label}
        className={cn(compact ? 'flex-col gap-0.5 px-2 py-1' : 'gap-1.5 px-3 shrink-0')}
      >
        <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className={compact ? 'text-[10px] leading-tight' : 'text-sm'}>{item.label}</span>
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
</div>`,
    },
  ],
}
