import type { ComponentMeta } from './_meta/types'

export const selectMeta: ComponentMeta = {
  name: 'Select',
  importPath: '@/components/ui/select',
  summary:
    'Liste déroulante accessible basée sur Radix UI (`@radix-ui/react-select`) avec gestion clavier complète, portail et scroll buttons. Le `SelectTrigger` accepte une prop `size` (`default` h-9 / `sm` h-8) pour la densité ; son focus suit le pattern shadcn (`focus:border-ring focus:ring-ring focus:ring-[3px]`, sans offset et à PLEINE opacité (WCAG 1.4.11, 3:1)). Dropdown refondu façon shadcn : l\'indicateur de sélection (✓) est placé à DROITE de chaque `SelectItem`, les `SelectLabel` sont en `text-xs text-muted-foreground`, et le placeholder du trigger est muté (`data-[placeholder]:text-muted-foreground`). Dix sous-composants exportés (`Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton`), mais 90 % des usages TimePick reposent sur le sous-ensemble minimal `Select` + `SelectTrigger` + `SelectValue` + `SelectContent` + `SelectItem`. Joue aussi le rôle de **fallback compact dans le pattern responsive Niveau 2** : on bascule de `Tabs` vers `Select` quand `useCompactMode` détecte un débordement (cf. `tabs.meta.ts`, `EmailSettingsSubtabs`, `EventEmailSubtabs`, `InvitationsPanel`).',
  variants: [],
  sizes: [
    { name: 'default', description: 'h-9 — défaut, formulaires et filtres pleine largeur', cssHint: 'h-9 (SelectTrigger size="default")' },
    { name: 'sm', description: 'h-8 — tier compact, barres d\'outils de data-table uniquement (pas les en-têtes de carte ni les filtres de page)', cssHint: 'h-8 (SelectTrigger size="sm")' },
  ],
  guidelines: [
    {
      rule: 'Toujours fournir un `placeholder` à `<SelectValue />` pour l\'indication visuelle initiale (sinon le trigger reste vide tant que l\'utilisateur n\'a pas choisi)',
      correct:
        '<SelectTrigger>\n  <SelectValue placeholder="Tous les événements" />\n</SelectTrigger>',
      wrong:
        '<SelectTrigger>\n  <SelectValue />\n</SelectTrigger> // trigger vide tant qu\'aucune valeur n\'est choisie',
    },
    {
      rule: 'Regrouper les options avec `<SelectGroup>` + `<SelectLabel>` dès que la liste dépasse 5 items ou comporte des catégories sémantiques distinctes (rôles, statuts, types d\'événement)',
      correct:
        '<SelectContent>\n  <SelectGroup>\n    <SelectLabel>Rôles</SelectLabel>\n    <SelectItem value="admin">Administrateur</SelectItem>\n    <SelectItem value="user">Membre</SelectItem>\n  </SelectGroup>\n</SelectContent>',
      wrong:
        '<SelectContent>\n  <SelectItem value="admin">Administrateur</SelectItem>\n  <SelectItem value="user">Membre</SelectItem>\n  {/* 6 autres items mélangés sans groupe ni label */}\n</SelectContent>',
    },
    {
      rule: 'Préférer `disabled` sur un `<SelectItem>` plutôt que de l\'omettre : conserver la stabilité d\'index Radix et signaler l\'option indisponible (créneau complet, événement archivé)',
      correct:
        '<SelectItem value="slot-12" disabled>Créneau complet (10/10)</SelectItem>',
      wrong:
        '{slot.bookingsCount < slot.capacity && (\n  <SelectItem value={slot.id}>{slot.label}</SelectItem>\n)}\n// L\'option disparaît du DOM, l\'index Radix shifte',
    },
    {
      rule: 'Pour le pattern responsive Niveau 2 (Tabs ↔ Select compact), partager le même état contrôlé entre `<Tabs value={...} onValueChange={...}>` et `<Select value={...} onValueChange={...}>` pour que la sélection survive au basculement de viewport',
      correct:
        'const [activeTab, setActiveTab] = useState("details")\nconst { ref, compact } = useCompactMode<HTMLDivElement>({ contentSelector: "[data-measure]" })\n\n{compact && (\n  <Select value={activeTab} onValueChange={setActiveTab}>\n    <SelectTrigger><SelectValue /></SelectTrigger>\n    {/* ... */}\n  </Select>\n)}',
      wrong:
        '// Deux états séparés : la sélection est perdue au passage compact ↔ desktop\nconst [tab, setTab] = useState("details")\nconst [selectValue, setSelectValue] = useState("details")',
    },
    {
      rule: 'Densité contextuelle : `<SelectTrigger size="sm">` (h-8) UNIQUEMENT dans une barre d\'outils de data-table. Une barre d\'outils de CARTE (en-tête de graphique type BookingsEventSelect, grille de cartes) ou un filtre de page pleine largeur reste en `default` (h-9). Un `<select>` natif STYLÉ (pattern compact `h-8 appearance-none` + chevron lucide) est acceptable pour un filtre simple ; réserver le `Select` Radix aux listes riches, groupées ou avec items désactivés',
      correct:
        '<SelectTrigger size="sm">\n  <SelectValue placeholder="Tous les rôles" />\n</SelectTrigger>\n// ou, pour un filtre simple : <select className="h-8 appearance-none rounded-md border border-input ..."> + <ChevronDown> en overlay',
      wrong:
        '<SelectTrigger size="default"> {/* h-9 dans une barre de filtres de table : rompt la densité compacte */}\n  <SelectValue placeholder="Tous les rôles" />\n</SelectTrigger>',
    },
    {
      rule: 'Combobox de formulaire/filtre : la valeur affichée par `<SelectValue>` est MUTÉE par défaut (`text-muted-foreground`, hérité du `SelectTrigger`) — règle TimePick délibérée. EXCEPTION : le fallback compact de navigation (Tabs ↔ Select via `useCompactMode`, items porteurs d\'icônes) reste foreground via `className="text-foreground"` car il représente l\'onglet actif',
      correct:
        '// Formulaire : valeur mutée (défaut du SelectTrigger)\n<SelectTrigger><SelectValue placeholder="Sélectionner une police" /></SelectTrigger>\n\n// Fallback de tablist : exception foreground\n{compact && (\n  <Select value={activeTab} onValueChange={setActiveTab}>\n    <SelectTrigger className="w-full text-foreground"><SelectValue /></SelectTrigger>\n  </Select>\n)}',
      wrong:
        '// Forcer text-foreground sur un combobox de formulaire classique : rompt la règle de densité TimePick\n<SelectTrigger className="text-foreground"><SelectValue placeholder="…" /></SelectTrigger>',
    },
    {
      rule: '`text-field` sur `SelectTrigger` est une cohérence visuelle avec les autres champs, PAS un correctif anti-zoom iOS — `SelectTrigger` rend un `<button>` (jamais un `<input>`), que iOS Safari n\'auto-zoome pas',
      correct:
        '<SelectTrigger> {/* text-field : 16px mobile / 14px desktop — taille identique à Input et Textarea pour l\'homogénéité visuelle */}\n  <SelectValue placeholder="Sélectionner…" />\n</SelectTrigger>',
      wrong:
        '// Ne pas compter SelectTrigger comme une "couverture anti-zoom iOS" : seul un <select> natif (NativeSelectDemo) ou un <Input>/<Textarea> peuvent déclencher l\'auto-zoom Safari',
    },
  ],
  antiPatterns: [
    {
      title: 'Utiliser un `<select>` HTML natif BRUT (non stylé) au lieu de `<Select>` ou du pattern select natif documenté',
      description:
        'Un `<select>` natif laissé au rendu par défaut du navigateur casse la cohérence visuelle (UI OS-dépendante macOS/Windows/iOS/Android), n\'expose pas le focus ring TimePick et ne supporte pas les groupes stylés. NUANCE (point 9) : un `<select>` natif STYLÉ selon le pattern documenté — `h-8 appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-field shadow-sm` + focus shadcn + `<ChevronDown>` positionné en overlay — est ACCEPTABLE pour un filtre simple sans groupes ni items désactivés (ex. sélecteur de police dans la vitrine DS — `FormsView.tsx` / `NativeSelectDemo`). Pour les listes riches, groupées (`SelectGroup`/`SelectLabel`) ou avec items désactivés, préférer le `Select` Radix. Cf. `EventFilterSelect`, `DurationField`, `EmailIdentityMenu` pour le pattern Radix de référence.',
    },
    {
      title: 'Omettre la prop `value` sur un `<SelectItem>`',
      description:
        'Radix Select rejette à l\'exécution tout `<SelectItem>` sans `value` (le composant lance une erreur explicite : *"A <Select.Item /> must have a value prop that is not an empty string"*). Et `value=""` est tout aussi invalide — la chaîne vide est réservée à l\'absence de sélection. Toujours fournir une valeur non vide et stable (ID UUID, slug, énumération métier).',
    },
    {
      title: 'Oublier le `placeholder` sur `<SelectValue />` quand le Select est non contrôlé ou démarre sans valeur',
      description:
        'Sans `placeholder`, le trigger affiche un espace vide à l\'ouverture initiale (ni indication, ni texte). L\'utilisateur ne sait pas ce qu\'on lui demande de choisir. Le pattern TimePick standard est `<SelectValue placeholder="Sélectionner un événement" />` avec un libellé impératif court, même quand un `<Label htmlFor>` est présent au-dessus.',
    },
    {
      title: 'Masquer une option en la retirant du DOM au lieu de la `disabled`er',
      description:
        'Retirer un `<SelectItem>` du DOM quand son option devient indisponible (créneau plein, événement archivé) déstabilise l\'index focus de Radix : si l\'utilisateur navigue au clavier, l\'élément focusé peut sauter ou disparaître. Préférer `<SelectItem value="..." disabled>` qui garde l\'item visible (avec opacité réduite) et explique pourquoi il est exclu — l\'utilisateur comprend qu\'il existe mais n\'est pas sélectionnable.',
    },
  ],
  examples: [
    {
      label: 'Import (sous-ensemble minimal — 90 % des usages)',
      code: 'import {\n  Select,\n  SelectContent,\n  SelectItem,\n  SelectTrigger,\n  SelectValue,\n} from "@/components/ui/select"',
    },
    {
      label: 'Usage standard avec placeholder (filtre admin)',
      code: `<div className="space-y-2">
  <Label htmlFor="event-filter">Filtrer par événement</Label>
  <Select value={selectedEventId ?? 'all'} onValueChange={handleChange}>
    <SelectTrigger id="event-filter" className="w-full sm:w-[280px]">
      <SelectValue placeholder="Tous les événements" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Tous les événements</SelectItem>
      {events.map((event) => (
        <SelectItem key={event.id} value={event.id}>
          {event.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>`,
    },
    {
      label: 'Usage avec groupes et labels (>5 options)',
      code: `<Select value={role} onValueChange={setRole}>
  <SelectTrigger className="w-full">
    <SelectValue placeholder="Choisir un rôle" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Administration</SelectLabel>
      <SelectItem value="admin">Administrateur</SelectItem>
      <SelectItem value="moderator">Modérateur</SelectItem>
    </SelectGroup>
    <SelectGroup>
      <SelectLabel>Membres</SelectLabel>
      <SelectItem value="user">Membre actif</SelectItem>
      <SelectItem value="guest">Invité ponctuel</SelectItem>
      <SelectItem value="archived" disabled>
        Membre archivé (lecture seule)
      </SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>`,
    },
    {
      label: 'Fallback compact responsive (Niveau 2 — Tabs ↔ Select via useCompactMode)',
      code: `const [activeTab, setActiveTab] = useState("send")
const { ref, compact } = useCompactMode<HTMLDivElement>({
  contentSelector: '[data-measure]',
})

<div ref={ref} className="overflow-hidden [contain:inline-size]">
  {/* Mode compact : Select prend le relais des Tabs */}
  {compact && (
    <Select value={activeTab} onValueChange={setActiveTab}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="send">Envoyer les invitations</SelectItem>
        <SelectItem value="status">Statut des envois</SelectItem>
      </SelectContent>
    </Select>
  )}

  {/* Tabs : on masque uniquement la TabsList, pas les panneaux (cf. tabsMeta) */}
  <Tabs value={activeTab} onValueChange={setActiveTab}>
    <div className={compact ? 'hidden' : ''}>
      <TabsList data-measure>
        <TabsTrigger value="send">Envoyer</TabsTrigger>
        <TabsTrigger value="status">Statut</TabsTrigger>
      </TabsList>
    </div>
    <TabsContent value="send" className="mt-6">...</TabsContent>
    <TabsContent value="status" className="mt-6">...</TabsContent>
  </Tabs>
</div>`,
    },
  ],
}
