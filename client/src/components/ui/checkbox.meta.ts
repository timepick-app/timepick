import type { ComponentMeta } from './_meta/types'

export const checkboxMeta: ComponentMeta = {
  name: 'Checkbox',
  importPath: '@/components/ui/checkbox',
  summary:
    'Case à cocher accessible basée sur Radix UI (`@radix-ui/react-checkbox`). Wrapper `forwardRef` unique (`Checkbox`) sans variantes cva : carré compact `size-4 rounded-lg border border-input shadow-sm`, indicateur `<Check>` (lucide) affiché à l\'état coché, fond `bg-primary` + bordure `border-primary` à la sélection. Le focus suit le pattern shadcn (`focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`). Composant contrôlé via `checked` + `onCheckedChange(value: boolean | "indeterminate")`. À utiliser pour toute sélection binaire ou multiple : « envoyer une invitation », sélection de lignes (select-all + par-ligne), choix multiples dans un filtre.',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Associer chaque `<Checkbox id="...">` à un `<label htmlFor="...">` (a11y, click-to-focus, zone cliquable élargie) — le label porte le texte, jamais le checkbox',
      correct:
        '<div className="flex items-center gap-2">\n  <Checkbox id="send-invitation" checked={sendInvitation} onCheckedChange={(v) => setSendInvitation(v === true)} />\n  <label htmlFor="send-invitation" className="text-sm cursor-pointer">Envoyer une invitation</label>\n</div>',
      wrong:
        '<Checkbox checked={sendInvitation} onCheckedChange={setSendInvitation} />\n<span className="text-sm">Envoyer une invitation</span> // pas de htmlFor : clic sur le texte sans effet',
    },
    {
      rule: 'Normaliser la valeur de `onCheckedChange` en booléen (Radix peut émettre `"indeterminate"`) avant de la stocker dans un état typé `boolean`',
      correct:
        '<Checkbox checked={selected} onCheckedChange={(v) => setSelected(v === true)} />',
      wrong:
        '<Checkbox checked={selected} onCheckedChange={setSelected} /> // setSelected reçoit boolean | "indeterminate"',
    },
  ],
  antiPatterns: [
    {
      title: 'Utiliser un `<input type="checkbox">` natif au lieu de `<Checkbox>`',
      description:
        'Le `<input type="checkbox">` natif rend une UI OS-dépendante (taille, couleur de coche non maîtrisées), n\'expose pas le focus ring TimePick ni le `rounded-lg`/`bg-primary` du design system, et se pilote via `checked`/`onChange(e.target.checked)` au lieu de l\'API Radix `onCheckedChange`. Toujours importer `<Checkbox>` depuis `@/components/ui/checkbox` (cf. `UserModal`, `UserInvitationStatusList`, `UserMultiSelect`).',
    },
    {
      title: 'Détourner un `<Checkbox>` pour une bascule on/off de réglage',
      description:
        'Une case à cocher signifie « inclure / sélectionner cet élément », pas « activer / désactiver une fonctionnalité ». Pour un réglage on/off (notifications, mode public), utiliser `<Switch>` qui exprime visuellement l\'état actif/inactif.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Checkbox } from "@/components/ui/checkbox"',
    },
    {
      label: 'Case unique avec label associé (envoi d\'invitation)',
      code: `<div className="flex items-center gap-2">
  <Checkbox
    id="send-invitation"
    checked={sendInvitation}
    onCheckedChange={(v) => setSendInvitation(v === true)}
  />
  <label htmlFor="send-invitation" className="text-sm cursor-pointer">
    Envoyer une invitation par email
  </label>
</div>`,
    },
    {
      label: 'Sélection multiple (liste avec select-all + par-ligne)',
      code: `<div className="space-y-2">
  <div className="flex items-center gap-2">
    <Checkbox
      id="select-all"
      checked={allSelected}
      onCheckedChange={(v) => toggleAll(v === true)}
      aria-label="Tout sélectionner"
    />
    <label htmlFor="select-all" className="text-sm font-medium">Tout sélectionner</label>
  </div>
  {users.map((user) => (
    <div key={user.id} className="flex items-center gap-2">
      <Checkbox
        id={\`user-\${user.id}\`}
        checked={isSelected(user.id)}
        onCheckedChange={() => toggleUser(user.id)}
      />
      <label htmlFor={\`user-\${user.id}\`} className="text-sm cursor-pointer">{user.name}</label>
    </div>
  ))}
</div>`,
    },
  ],
}
