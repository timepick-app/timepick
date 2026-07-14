import type { ComponentMeta } from './_meta/types'

export const sheetMeta: ComponentMeta = {
  name: 'Sheet',
  importPath: '@/components/ui/sheet',
  summary:
    'Panneau coulissant modal basé sur Radix Dialog (`@radix-ui/react-dialog`), ancré à un bord de l\'écran. Dix exports composables : `Sheet` (Root, contrôlable via `open` + `onOpenChange`), `SheetTrigger`, `SheetClose`, `SheetPortal`, `SheetOverlay`, `SheetContent` (wrapper `forwardRef` portalisé, overlay + bouton de fermeture `<X>` intégré, prop `side` via cva), `SheetHeader`, `SheetFooter`, `SheetTitle` et `SheetDescription`. La seule variante est `side` (`top` / `bottom` / `left` / `right`, défaut `right`) qui gère le bord d\'ancrage, la bordure et l\'animation de glissement ; le contenu latéral mesure `w-3/4 sm:max-w-sm` par défaut, ajustable par `className`. Usages réels : `AdminLayout` (menu de navigation mobile, `side="left"`), `DaySlotDrawer` (drawer responsive `side={isMobile ? "bottom" : "right"}`).',
  variants: [
    {
      name: 'right',
      description: 'Panneau ancré à droite, glisse depuis le bord droit (`inset-y-0 right-0 h-full w-3/4 sm:max-w-sm`).',
      whenToUse: 'Valeur par défaut : détail contextuel, formulaire secondaire ou drawer desktop.',
      cssHint: 'side="right"',
    },
    {
      name: 'left',
      description: 'Panneau ancré à gauche, glisse depuis le bord gauche (`inset-y-0 left-0 h-full w-3/4 sm:max-w-sm`).',
      whenToUse: 'Navigation latérale, typiquement le menu mobile (cf. `AdminLayout`).',
      cssHint: 'side="left"',
    },
    {
      name: 'top',
      description: 'Bandeau ancré en haut, glisse depuis le haut (`inset-x-0 top-0 border-b`).',
      whenToUse: 'Notification ou panneau de filtres qui descend du haut de l\'écran.',
      cssHint: 'side="top"',
    },
    {
      name: 'bottom',
      description: 'Bandeau ancré en bas, glisse depuis le bas (`inset-x-0 bottom-0 border-t`).',
      whenToUse: 'Feuille d\'action mobile (bottom sheet), pattern tactile naturel (cf. `DaySlotDrawer` sur mobile).',
      cssHint: 'side="bottom"',
    },
  ],
  sizes: [],
  guidelines: [
    {
      rule: 'Toujours fournir un `<SheetTitle>` (et de préférence un `<SheetDescription>`) dans chaque `SheetContent` : Radix Dialog exige un titre accessible, sinon avertissement a11y et lecteur d\'écran muet',
      correct:
        '<SheetContent side="right">\n  <SheetHeader>\n    <SheetTitle>Créneaux du 12 juin</SheetTitle>\n    <SheetDescription>Sélectionnez un créneau pour réserver.</SheetDescription>\n  </SheetHeader>\n  …\n</SheetContent>',
      wrong:
        '<SheetContent side="right">\n  <div className="text-lg font-semibold">Créneaux du 12 juin</div> // pas de SheetTitle → warning a11y\n  …\n</SheetContent>',
    },
    {
      rule: 'Adapter le `side` au contexte d\'usage : bottom sheet tactile sur mobile, panneau latéral sur desktop',
      correct:
        '<Sheet open={open} onOpenChange={onOpenChange}>\n  <SheetContent side={isMobile ? "bottom" : "right"}>\n    …\n  </SheetContent>\n</Sheet>',
      wrong:
        '<Sheet open={open} onOpenChange={onOpenChange}>\n  <SheetContent side="right"> // panneau étroit à droite, inconfortable au pouce sur mobile\n    …\n  </SheetContent>\n</Sheet>',
    },
    {
      rule: 'Séparateur fade en bas d\'une zone scrollable : prévoir un padding-bas du contenu ≥ hauteur du dégradé (ex. `pb-16` pour un fade `h-12`), sinon le dégradé oblitère le dernier élément ; le fade reste `pointer-events-none` (champs cliquables dessous) et sans bordure',
      correct:
        '<div className="relative min-h-0 flex-1">\n  <div className="h-full overflow-y-auto px-6 pb-16 pt-4">{children}</div>\n  <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />\n</div>',
      wrong:
        '<div className="relative min-h-0 flex-1">\n  <div className="h-full overflow-y-auto px-6 py-4">{children}</div> // py-4 (16px) < fade h-12 (48px) → dernière ligne masquée\n  <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />\n</div>',
    },
    {
      rule: 'Aligner les actions du `SheetFooter` à droite, CTA principal en dernière position (le SheetFooter applique `sm:justify-end` par défaut) — cf. Conventions transverses.',
      correct:
        '<SheetFooter>\n  <Button variant="outline">Fermer</Button>\n  <Button>Enregistrer</Button>\n</SheetFooter>',
      wrong:
        '<SheetFooter className="justify-start">\n  <Button>Enregistrer</Button>\n  <Button variant="outline">Fermer</Button>\n</SheetFooter>',
    },
  ],
  antiPatterns: [
    {
      title: 'Omettre `SheetTitle` dans le contenu',
      description:
        '`SheetContent` s\'appuie sur Radix Dialog, qui réclame un titre accessible relié au rôle `dialog`. Un panneau sans `<SheetTitle>` déclenche un avertissement console et laisse les utilisateurs de lecteurs d\'écran sans annonce du contexte. Si le titre doit être masqué visuellement, le garder dans le DOM avec une classe `sr-only`.',
    },
    {
      title: 'Utiliser un `Sheet` pour un micro-contenu contextuel',
      description:
        'Le sheet pose un overlay et capture le focus : c\'est lourd pour un petit menu ancré à un bouton (sélecteur, mini-formulaire). Pour ce cas, préférer `<Popover>` qui reste non-modal et collé au trigger. Réserver `<Sheet>` aux panneaux pleins (navigation, détail, formulaire conséquent).',
    },
    {
      title: 'Fade de scroll sans dégagement bas',
      description:
        'Poser un séparateur en dégradé (`bg-gradient-to-t from-background to-transparent`) au-dessus d\'une zone scrollable sans augmenter le padding-bas du contenu : le dernier élément (boutons radio, dernière ligne de formulaire) passe sous le dégradé et perd en lisibilité. Toujours réserver un padding-bas ≥ hauteur du fade (`pb-16` pour `h-12`). Le fade doit rester `pointer-events-none` pour ne pas bloquer les champs qu\'il recouvre, et ne porte jamais de bordure (sinon double signal avec une barre).',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet"',
    },
    {
      label: 'Menu de navigation mobile (side="left")',
      code: `<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
  <SheetTrigger asChild>
    <Button variant="ghost" size="icon" aria-label="Ouvrir le menu">
      <Menu className="h-5 w-5" />
    </Button>
  </SheetTrigger>
  <SheetContent side="left" className="w-64 p-0" aria-label="Menu de navigation">
    <SidebarContent onNavigate={closeMobileMenu} />
  </SheetContent>
</Sheet>`,
    },
    {
      label: 'Drawer responsive (bottom sheet mobile / panneau droit desktop)',
      code: `<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side={isMobile ? "bottom" : "right"}>
    <SheetHeader>
      <SheetTitle>Créneaux disponibles</SheetTitle>
      <SheetDescription>Choisissez un créneau pour réserver votre place.</SheetDescription>
    </SheetHeader>
    <div className="mt-4 space-y-2">
      {slots.map((slot) => (
        <SlotRow key={slot.id} slot={slot} />
      ))}
    </div>
  </SheetContent>
</Sheet>`,
    },
    {
      label: 'Panneau scrollable avec séparateur fade (coquille fiche membre)',
      code: `<SheetContent className="flex flex-col gap-0 p-0 w-full sm:max-w-lg">
  <SheetHeader className="shrink-0 px-6 py-4 pr-12">
    <SheetTitle>Modifier le membre</SheetTitle>
  </SheetHeader>
  <div className="relative min-h-0 flex-1">
    {/* pb-16 (64px) > fade h-12 (48px) : le dernier champ dégage toujours le dégradé */}
    <div className="h-full overflow-y-auto px-6 pb-16 pt-4">
      <form className="space-y-4">{/* … champs … */}</form>
    </div>
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
  </div>
  <SheetFooter className="shrink-0 px-6 py-4">
    <Button variant="outline">Fermer</Button>
    <Button>Enregistrer</Button>
  </SheetFooter>
</SheetContent>`,
    },
  ],
}
