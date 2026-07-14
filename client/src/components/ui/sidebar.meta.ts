import type { ComponentMeta } from './_meta/types'

export const sidebarMeta: ComponentMeta = {
  name: 'Sidebar',
  importPath: '@/components/layout/SidebarContent',
  summary:
    "Layout applicatif à barre latérale (app-shell). Modèle de référence : `AdminLayout` fournit le chrome (grille responsive + header mobile + Sheet) et consomme `SidebarContent` — le contenu de la barre — à la fois dans le `<aside>` desktop et le `<Sheet>` mobile. Reproduire ce modèle pour toute page à navigation latérale (admin, design system…) plutôt que de réimproviser une mise en page custom.",
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Structurer le shell en grille `lg:grid lg:grid-cols-[240px_1fr]` : `<aside>` masquée sous `lg`, remplacée par un header mobile + `<Sheet side="left">`',
      correct:
        '<div className="lg:grid lg:grid-cols-[240px_1fr]"><aside className="hidden lg:flex lg:flex-col lg:h-screen lg:sticky lg:top-0 border-r bg-card">…</aside><main>…</main></div>',
      wrong:
        '<div className="md:flex gap-8 max-w-7xl"><aside className="hidden md:block w-56">…</aside></div> // breakpoint md ad-hoc, hors modèle',
    },
    {
      rule: "Ajouter `min-w-0` au `<main>` (grid item de la piste `1fr`) pour qu'il puisse rétrécir sous la largeur intrinsèque de son contenu",
      correct: '<main className="p-4 lg:p-6 min-w-0">…</main>',
      wrong:
        '<main className="p-4 lg:p-6">…</main> // un <pre>/table large force la piste 1fr → scroll horizontal de page entre ~1024 et 1100px',
    },
    {
      rule: 'Extraire le contenu de la barre dans UN seul composant, rendu à la fois dans le `<aside>` desktop et le `<SheetContent>` mobile (DRY)',
      correct:
        '<aside className="hidden lg:flex …"><SidebarContent /></aside>  …  <SheetContent><SidebarContent onNavigate={closeMobileMenu} /></SheetContent>',
      wrong: 'Deux balisages de navigation dupliqués, un pour le desktop et un pour le mobile',
    },
    {
      rule: 'État actif des liens via `NavLink` avec `bg-accent text-accent-foreground font-medium` (jamais `bg-primary`)',
      correct:
        'className={({ isActive }) => cn("flex items-center gap-2 h-8 px-2 rounded-md text-sm", isActive ? "bg-accent text-accent-foreground font-medium" : "text-foreground hover:bg-accent hover:text-accent-foreground")}',
      wrong: 'className={({ isActive }) => isActive ? "bg-primary text-primary-foreground" : "…"} // contraste et style hors modèle',
    },
    {
      rule: "Donner un nom accessible au `<Sheet>` mobile via un `SheetTitle` (sr-only s'il ne doit pas être visible) plutôt qu'un simple `aria-label`",
      correct:
        '<SheetContent side="left" className="w-64 p-0"><SheetTitle className="sr-only">Navigation</SheetTitle><SidebarContent onNavigate={close} /></SheetContent>',
      wrong:
        '<SheetContent side="left" aria-label="Navigation"><SidebarContent /></SheetContent> // Radix: « DialogContent requires a DialogTitle »',
    },
  ],
  antiPatterns: [
    {
      title: 'Réimproviser une sidebar ad-hoc',
      description:
        "Recréer une mise en page à barre latérale custom (breakpoint `md`, `max-w-7xl flex gap-8`, actif `bg-primary`, largeur `w-56`) au lieu de reprendre `AdminLayout`/`SidebarContent`. Source de divergence visuelle et de drift avec le reste de l'application.",
    },
    {
      title: 'Oublier `min-w-0` sur la piste contenu',
      description:
        "Sans `min-w-0` sur le `<main>`, la piste `1fr` garde son `min-width:auto` par défaut : un `<pre>` de code ou une table large l'empêche de rétrécir et provoque un débordement horizontal de toute la page entre ~1024 et 1100px (grille `lg` active mais viewport étroit).",
    },
    {
      title: 'Sheet mobile sans `SheetTitle`',
      description:
        "Un `SheetContent` sans `SheetTitle` (même avec un `aria-label`) déclenche l'erreur console Radix « `DialogContent` requires a `DialogTitle` » et prive les lecteurs d'écran d'un nom de dialogue. Ajouter un `SheetTitle` (sr-only si invisible).",
    },
    {
      title: 'Dupliquer la navigation desktop/mobile',
      description:
        "Maintenir deux balisages de navigation séparés (un pour l'`<aside>`, un pour le `<Sheet>`) diverge vite. Un unique composant `SidebarContent` partagé garantit la cohérence des libellés, de l'état actif et des icônes.",
    },
  ],
  examples: [
    {
      label: 'Shell applicatif (chrome type AdminLayout)',
      code: `<div className="min-h-screen bg-background">
  {/* Header mobile : hamburger + Sheet (sous lg) */}
  <header className="lg:hidden sticky top-0 z-50 bg-background flex items-center gap-3 p-4 border-b">
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
    <span className="font-semibold text-lg">TimePick</span>
  </header>

  <div className="lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="hidden lg:flex lg:flex-col lg:h-screen lg:sticky lg:top-0 border-r bg-card">
      <SidebarContent />
    </aside>
    <main className="p-4 lg:p-6 min-w-0">
      {/* contenu de la page */}
    </main>
  </div>
</div>`,
    },
    {
      label: 'Contenu de barre latérale (type SidebarContent)',
      code: `<div className="flex flex-col h-full">
  <div className="p-6 border-b">
    <h1 className="text-xl font-bold">TimePick</h1>
    <p className="text-sm text-muted-foreground">Administration</p>
  </div>
  <nav className="flex-1 p-2 space-y-1" aria-label="Navigation principale">
    {navItems.map((item) => (
      <NavLink
        key={item.href}
        to={item.href}
        className={({ isActive }) => cn(
          "flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <item.icon className="h-4 w-4" />
        <span>{item.label}</span>
      </NavLink>
    ))}
  </nav>
  <div className="p-2 border-t">
    <p className="px-2 text-[10px] text-muted-foreground">Version {APP_VERSION}</p>
  </div>
</div>`,
    },
  ],
}
