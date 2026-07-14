import type { ComponentMeta } from './_meta/types'

export const inputMeta: ComponentMeta = {
  name: 'Input',
  importPath: '@/components/ui/input',
  summary:
    'Champ de saisie texte basé sur un wrapper `forwardRef` autour d\'un `<input>` natif, désormais piloté par cva (même pattern que `Button`). Deux tailles via la prop `size` : `default` (h-9, formulaires) et `sm` (h-8, tier compact pour barres d\'outils de table / filtres). Le focus suit le pattern shadcn (`focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`, sans offset) ; bordure `border-input`, fond `bg-background`, `text-field` (16px mobile / 14px desktop — anti-zoom iOS). Forward toutes les props natives `<input>` (`type`, `value`, `onChange`, `placeholder`, `disabled`, `id`, `aria-*`, etc.) ; la prop HTML native `size` est exclue au profit de la variante cva. À utiliser systématiquement dans les formulaires admin (création d\'événement, configuration SMTP, invitation de membres) et le flux de connexion (magic link, code de secours).',
  variants: [],
  sizes: [
    { name: 'default', description: 'h-9 — formulaires (défaut)', cssHint: 'h-9' },
    { name: 'sm', description: 'h-8 — tier compact pour barres d\'outils / filtres de table', cssHint: 'h-8' },
  ],
  guidelines: [
    {
      rule: 'Toujours associer un `<Label htmlFor="...">` à chaque `<Input id="...">` (a11y, click-to-focus, lecteurs d\'écran)',
      correct:
        '<Label htmlFor="smtp-host">Hôte SMTP</Label>\n<Input id="smtp-host" type="text" value={...} onChange={...} />',
      wrong:
        '<span className="text-sm font-medium">Hôte SMTP</span>\n<Input type="text" value={...} onChange={...} />',
    },
    {
      rule: 'Spécifier un `type` adapté au contenu (`email`, `tel`, `url`, `number`, `password`, `datetime-local`) pour activer le clavier mobile et la validation native',
      correct:
        '<Input id="user-email" type="email" autoComplete="email" value={email} onChange={...} />',
      wrong:
        '<Input id="user-email" type="text" value={email} onChange={...} />',
    },
    {
      rule: 'Pour un champ contrôlé, fournir simultanément `value` et `onChange` (sinon React émet un warning et l\'input devient en lecture seule)',
      correct:
        '<Input id="event-name" value={formData.name} onChange={(e) => handleFieldChange(\'name\', e.target.value)} />',
      wrong:
        '<Input id="event-name" value={formData.name} /> // pas de onChange : input figé',
    },
    {
      rule: 'Préférer `<Input>` à un `<input>` natif stylé manuellement, même pour un champ unique hors formulaire',
      correct: '<Input type="search" placeholder="Rechercher un membre..." />',
      wrong:
        '<input type="search" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-field ..." />',
    },
    {
      rule: 'La densité suit le contexte : `size="sm"` (h-8) UNIQUEMENT dans une barre d\'outils de data-table (recherche/filtre alignés sur une table dense). Une barre d\'outils de CARTE (en-tête de graphique, grille de cartes) ou un filtre de page hors table reste en `default` (h-9), comme les champs de formulaire',
      correct:
        '<Input size="sm" type="search" placeholder="Filtrer les membres…" /> {/* toolbar de data-table : h-8 */}\n<Input type="search" placeholder="Rechercher une app…" /> {/* filtre de page / carte : h-9 */}',
      wrong:
        '<Input size="sm" type="search" placeholder="Filtrer…" /> {/* h-8 dans un en-tête de carte hors data-table : compacité injustifiée */}',
    },
  ],
  antiPatterns: [
    {
      title: 'Recopier les classes Tailwind d\'`Input` dans un `<input>` natif',
      description:
        'Reproduire `flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-field ring-offset-background focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ...` à la main dans un `<input>` désynchronise le rendu si le design system évolue (la prochaine refonte du focus ring ne propagera pas, et la prop `size` cva ne sera pas disponible). Toujours importer `<Input>` depuis `@/components/ui/input`.',
    },
    {
      title: 'Omettre l\'association `<Label htmlFor="...">` ↔ `<Input id="...">`',
      description:
        'Sans `htmlFor` correspondant à un `id` unique, le clic sur le label ne focus pas l\'input et les lecteurs d\'écran annoncent un champ orphelin. Le pattern standard TimePick (cf. `SmtpConfigPanel`, `EventForm`, `EmergencyLogin`) est `<Label htmlFor="x">…</Label><Input id="x" … />` enveloppés dans un `<div className="space-y-2">`.',
    },
    {
      title: 'Mélanger `value` (contrôlé) et `defaultValue` (non contrôlé) sur le même Input',
      description:
        'Passer les deux props simultanément déclenche un warning React et produit un comportement imprévisible. Choisir un seul mode : `value` + `onChange` quand l\'état vit dans un `useState`/`useReducer` parent, `defaultValue` seul quand le champ est lu uniquement à la soumission via `FormData` ou un ref.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Input } from "@/components/ui/input"\nimport { Label } from "@/components/ui/label"',
    },
    {
      label: 'Champ email avec Label associé (flux magic link)',
      code: `<div className="space-y-2">
  <Label htmlFor="login-email">Adresse email</Label>
  <Input
    id="login-email"
    type="email"
    autoComplete="email"
    placeholder="vous@exemple.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    required
  />
</div>`,
    },
    {
      label: 'Champ texte contrôlé (formulaire admin événement)',
      code: `<div className="space-y-2">
  <Label htmlFor="event-name">
    Nom <span className="text-red-500">*</span>
  </Label>
  <Input
    id="event-name"
    value={formData.name}
    onChange={(e) => handleFieldChange('name', e.target.value)}
    placeholder="Ex: Tournoi de Tennis 2026"
    disabled={isSubmitting}
  />
</div>`,
    },
    {
      label: 'Champ mot de passe avec toggle de visibilité (SMTP config)',
      code: `<div className="relative">
  <Input
    id="smtp-password"
    type={showPassword ? 'text' : 'password'}
    placeholder="••••••••"
    value={formValues.smtpPassword}
    onChange={(e) => updateField('smtpPassword', e.target.value)}
    className="pr-10"
  />
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className="absolute right-1 top-1/2 -translate-y-1/2"
    onClick={() => setShowPassword((v) => !v)}
    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
  >
    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </Button>
</div>`,
    },
    {
      label: 'Champ avec icône préfixée (recherche, filtre)',
      code: `<div className="relative">
  <Search
    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
    aria-hidden="true"
  />
  <Input
    type="search"
    placeholder="Rechercher un membre..."
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    className="pl-9"
  />
</div>`,
    },
  ],
}
