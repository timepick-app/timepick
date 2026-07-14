import type { ComponentMeta } from './_meta/types'

export const radioGroupMeta: ComponentMeta = {
  name: 'RadioGroup',
  importPath: '@/components/ui/radio-group',
  summary:
    'Groupe de boutons radio mutuellement exclusifs basé sur Radix UI (`@radix-ui/react-radio-group`). Deux sous-composants exportés : `RadioGroup` (conteneur `grid gap-2.5`, contrôlé via `value` + `onValueChange`) et `RadioGroupItem` (cercle `size-4 rounded-full border border-input`, indicateur `<Circle>` rempli `fill-primary` à la sélection). La bordure reste `border-input` même à l\'état sélectionné (pas de `border-primary`) — seul l\'indicateur central signale le choix. Focus shadcn (`focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`). Navigation clavier intégrée (flèches). À utiliser pour un choix unique parmi 2 à ~5 options visibles simultanément (rôle utilisateur, type d\'événement) ; au-delà, préférer `<Select>`.',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Associer chaque `<RadioGroupItem id="...">` à un `<label htmlFor="...">` enveloppant texte + item, et fournir `value`/`onValueChange` sur le `<RadioGroup>`',
      correct:
        '<RadioGroup value={role} onValueChange={(v) => setRole(v as "user" | "admin")}>\n  <label htmlFor="role-user" className="flex items-center gap-2 cursor-pointer">\n    <RadioGroupItem value="user" id="role-user" />\n    Membre\n  </label>\n  <label htmlFor="role-admin" className="flex items-center gap-2 cursor-pointer">\n    <RadioGroupItem value="admin" id="role-admin" />\n    Administrateur\n  </label>\n</RadioGroup>',
      wrong:
        '<RadioGroup>\n  <RadioGroupItem value="user" /> Membre\n  <RadioGroupItem value="admin" /> Administrateur\n</RadioGroup> // ni value/onValueChange, ni labels associés',
    },
  ],
  antiPatterns: [
    {
      title: 'Utiliser des `<input type="radio">` natifs au lieu de `<RadioGroup>` + `<RadioGroupItem>`',
      description:
        'Les `<input type="radio">` natifs imposent une gestion manuelle de l\'attribut `name` partagé, rendent une UI OS-dépendante, n\'exposent pas le focus ring TimePick ni l\'indicateur `fill-primary`, et n\'offrent pas la navigation clavier Radix. Toujours importer `RadioGroup`/`RadioGroupItem` depuis `@/components/ui/radio-group` (cf. `UserModal`).',
    },
    {
      title: 'Surcharger la bordure en `border-primary` à la sélection',
      description:
        'Le design system conserve volontairement `border-input` sur le `RadioGroupItem` même sélectionné — c\'est l\'indicateur central rempli (`<Circle fill-primary>`) qui signale le choix, pas la bordure. Ajouter `data-[state=checked]:border-primary` via `className` désynchronise le radio des autres primitives et crée une double convention.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"',
    },
    {
      label: 'Choix de rôle (contrôlé, avec labels)',
      code: `<RadioGroup value={role} onValueChange={(v) => setRole(v as "user" | "admin")}>
  <label htmlFor="role-user" className="flex items-center gap-2 cursor-pointer">
    <RadioGroupItem value="user" id="role-user" />
    <span className="text-sm">Membre</span>
  </label>
  <label htmlFor="role-admin" className="flex items-center gap-2 cursor-pointer">
    <RadioGroupItem value="admin" id="role-admin" />
    <span className="text-sm">Administrateur</span>
  </label>
</RadioGroup>`,
    },
  ],
}
