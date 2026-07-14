import type { ComponentMeta } from './_meta/types'

export const tabsMeta: ComponentMeta = {
  name: 'Tabs',
  importPath: '@/components/ui/tabs',
  summary:
    'Navigation par onglets basée sur Radix UI Tabs. Wrappers `forwardRef` minimalistes (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) sans variantes cva : le style est fixé par la classe `cn()` interne. Idéal pour les sections de contenu mutuellement exclusives à l\'intérieur d\'une même page.',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Choisir entre `defaultValue` (non contrôlé) et `value`/`onValueChange` (contrôlé) selon le besoin de synchronisation externe',
      correct: '<Tabs defaultValue="tab1">...</Tabs>',
      wrong: '<Tabs value="tab1">...</Tabs> // sans onValueChange : verrouillé',
    },
    {
      rule: 'Décorer les `TabsTrigger` avec une icône Lucide accessible quand les onglets représentent des catégories',
      correct: '<TabsTrigger value="profile"><User className="h-4 w-4 mr-2" aria-hidden="true" />Profil</TabsTrigger>',
      wrong: '<TabsTrigger value="profile"><User /> Profil</TabsTrigger>',
    },
    {
      rule: 'Espacer le contenu de la `TabsList` avec `mt-6` sur chaque `TabsContent` pour une lecture confortable',
      correct: '<TabsContent value="tab1" className="mt-6">...</TabsContent>',
      wrong: '<TabsContent value="tab1">...</TabsContent>',
    },
    {
      rule: 'Pattern responsive Niveau 2 (Tabs + Select via useCompactMode) : le wrapper `ref`/`overflow-hidden [contain:inline-size]` ne doit contenir QUE la `TabsList` mesurée ; les `TabsContent` restent à côté, sous le même `<Tabs>`',
      correct: '<Tabs>{compact && <Select/>}<div ref={ref} className={cn("overflow-hidden [contain:inline-size]", compact && "hidden")}><TabsList data-measure/></div><TabsContent/>...</Tabs>',
      wrong: '<div ref={ref} className="overflow-hidden"><Tabs><TabsList data-measure/><TabsContent/>...</Tabs></div> // panneaux dans le clip → anneau de focus rogné',
    },
  ],
  antiPatterns: [
    {
      title: 'Reproduire la navigation par onglets avec des `<button>` natifs',
      description:
        'Une grappe de `<button>` ne fournit ni la sémantique ARIA `role="tablist"`/`role="tab"`/`role="tabpanel"`, ni la navigation clavier (flèches gauche/droite) gérée par Radix. Toujours utiliser `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`.',
    },
    {
      title: 'Masquer la `Tabs` racine entière en mode compact (Niveau 2)',
      description:
        'Si on applique `hidden` sur le `<Tabs>` parent quand `useCompactMode` bascule en mode compact, les `TabsContent` disparaissent aussi et la sélection effectuée via le `<Select>` ne rend plus rien. Solution : masquer uniquement la `TabsList` (cf. fix `23865513`), garder les panneaux toujours montés. Voir `client/src/hooks/useCompactMode.ts` et la démo `ResponsiveTabsDemo` dans `pages/DesignSystem.tsx`.',
    },
    {
      title: 'Forcer une grille responsive sur `TabsList` avec moins de 4 onglets',
      description:
        'Une grille `grid grid-cols-N` étale les triggers sur toute la largeur disponible et casse le rendu compact natif de la `TabsList` Radix (qui est `inline-flex`). Réserver cette mise en page aux cas où il y a au moins 4 onglets et que la largeur est garantie.',
    },
    {
      title: 'Englober les `TabsContent` dans le wrapper `overflow-hidden [contain:inline-size]` de mesure (useCompactMode)',
      description:
        'Le `overflow-hidden [contain:inline-size]` du wrapper `ref` de `useCompactMode` sert uniquement à clipper la `TabsList` mesurée (`inline-flex flex-nowrap`) tant que la bascule compacte n\'a pas eu lieu. S\'il englobe aussi les `TabsContent`, tout contrôle pleine largeur à fleur du bord (Input, Textarea, Select, Button) voit son anneau de focus rogné à gauche/droite (cf. Drawbridge #44 sur `EventFormPage`). Règle : le `<div ref={…} className="overflow-hidden [contain:inline-size]">` ne contient QUE la `TabsList` ; les panneaux vivent à côté, sous le même `<Tabs>`. Références correctes : `pages/Settings.tsx`, démo `ResponsiveTabsDemo`.',
    },
    {
      title: 'TabsList rendue directement dans un parent `flex` en colonne s\'étire à 100% (manque `w-fit`)',
      description:
        'Même mécanisme que pour `ToggleGroup` : une `TabsList` (`inline-flex`) posée comme enfant direct d\'un conteneur `flex` en colonne (`flex flex-col …`) devient un flex item, son `display` est blockifié en `flex` (niveau bloc), et l\'`align-items: stretch` par défaut du parent l\'étire sur toute la largeur. `inline-flex` et `shrink-0` ne protègent pas. Aujourd\'hui le pattern responsive Niveau 2 enveloppe toujours la `TabsList` dans un `<div className="overflow-hidden [contain:inline-size]">` block-level qui la met à l\'abri (elle épouse son contenu) ; mais une `TabsList` rendue HORS de ce wrapper, directement dans un `flex-col`, doit recevoir `w-fit` (ou `self-start`). Réf. principe Drawbridge #30 / `ViewToggle`.',
    },
    {
      title: 'Wrapper `overflow-hidden [contain:inline-size]` posé comme enfant flex sans largeur définie → compact permanent',
      description:
        'Dans un conteneur `flex` (row), un enfant direct portant `[contain:inline-size]` sans `flex-1` ni largeur explicite a un `clientWidth = 0` : `contain: inline-size` supprime la contribution du contenu au dimensionnement, et le flex ne lui attribue aucun espace. `useCompactMode` mesure alors « 0 px disponibles vs N px naturels » et bascule en mode compact dès le premier rendu — la `TabsList` est cachée en permanence. Correctif : ajouter `flex-1 min-w-0` sur le wrapper pour qu\'il reçoive une largeur réelle du parent flex avant la mesure. Réf. Drawbridge #47 / `SlotCalendar` toolbar.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"',
    },
    {
      label: 'Usage simple (non contrôlé)',
      code: `<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">
      <Calendar className="h-4 w-4 mr-2" aria-hidden="true" />
      Calendrier
    </TabsTrigger>
    <TabsTrigger value="tab2">
      <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
      Paramètres
    </TabsTrigger>
  </TabsList>
  <TabsContent value="tab1" className="mt-6">
    Contenu onglet 1
  </TabsContent>
  <TabsContent value="tab2" className="mt-6">
    Contenu onglet 2
  </TabsContent>
</Tabs>`,
    },
    {
      label: 'Contrôlé avec forceMount (préservation d\'état)',
      code: `const [activeTab, setActiveTab] = useState("tab1")

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="tab1">Onglet 1</TabsTrigger>
    <TabsTrigger value="tab2">Onglet 2</TabsTrigger>
  </TabsList>
  <TabsContent
    value="tab1"
    forceMount
    className={cn("mt-6", activeTab !== "tab1" && "hidden")}
  >
    {/* Composant avec état local préservé */}
  </TabsContent>
  <TabsContent
    value="tab2"
    forceMount
    className={cn("mt-6", activeTab !== "tab2" && "hidden")}
  >
    {/* Composant avec état local préservé */}
  </TabsContent>
</Tabs>`,
    },
    {
      label: 'Pattern responsive Niveau 2 (Tabs + Select via useCompactMode)',
      code: `const [activeTab, setActiveTab] = useState("details")
const { ref, compact } = useCompactMode<HTMLDivElement>({
  contentSelector: '[data-measure]',
})

<Tabs value={activeTab} onValueChange={setActiveTab}>
  {compact && (
    <Select value={activeTab} onValueChange={setActiveTab}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{/* options */}</SelectContent>
    </Select>
  )}
  {/* overflow-hidden [contain:inline-size] confine UNIQUEMENT la TabsList mesurée ;
      les TabsContent restent en dehors, sinon leur anneau de focus
      est rogné aux extrémités (Drawbridge #44) */}
  <div ref={ref} className={cn('overflow-hidden [contain:inline-size]', compact && 'hidden')}>
    <TabsList data-measure className="inline-flex flex-nowrap">
      <TabsTrigger value="details" className="shrink-0">Détails</TabsTrigger>
      <TabsTrigger value="slots" className="shrink-0">Créneaux</TabsTrigger>
    </TabsList>
  </div>
  <TabsContent value="details" className="mt-6">...</TabsContent>
  <TabsContent value="slots" className="mt-6">...</TabsContent>
</Tabs>`,
    },
  ],
}
