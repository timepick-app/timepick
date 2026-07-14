import type { ComponentMeta } from './_meta/types'

export const switchMeta: ComponentMeta = {
  name: 'Switch',
  importPath: '@/components/ui/switch',
  summary:
    'Bascule on/off accessible basée sur Radix UI (`@radix-ui/react-switch`). Wrapper `forwardRef` unique (`Switch`) sans variantes cva, aligné sur les dimensions compactes shadcn : piste `h-[1.15rem] w-8 rounded-full`, pouce `size-4` qui glisse de `translate-x-0` à `translate-x-[calc(100%-2px)]`, piste `bg-primary` à l\'état coché / `bg-input` sinon. Focus shadcn (`focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`). Contrôlé via `checked` + `onCheckedChange(value: boolean)`. À utiliser pour activer/désactiver un réglage persistant (notifications, visibilité publique d\'un événement, options SMTP), pas pour sélectionner un élément.',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Associer le `<Switch id="...">` à un `<label htmlFor="...">` décrivant le réglage activé/désactivé, et le piloter de façon contrôlée via `checked` + `onCheckedChange`',
      correct:
        '<div className="flex items-center gap-2">\n  <Switch id="notify" checked={notify} onCheckedChange={setNotify} />\n  <label htmlFor="notify" className="text-sm cursor-pointer">Notifications par email</label>\n</div>',
      wrong:
        '<Switch checked={notify} /> // ni onCheckedChange (bascule figée) ni label associé',
    },
  ],
  antiPatterns: [
    {
      title: 'Détourner une case à cocher (`Checkbox` ou `<input type="checkbox">`) pour un réglage on/off',
      description:
        'Une case à cocher signifie « inclure / sélectionner cet élément » ; un réglage activable/désactivable (notifications, mode public, option SMTP) doit utiliser `<Switch>`, dont l\'affordance visuelle (piste + pouce qui glisse) communique immédiatement l\'état actif/inactif. Réserver `<Checkbox>` aux sélections multiples.',
    },
    {
      title: 'Recréer un toggle on/off ad-hoc (`ToggleSwitch` maison, `<button aria-pressed>` stylé) quand `<Switch>` suffit',
      description:
        'Construire un interrupteur sur mesure duplique le balisage a11y (`role="switch"`, gestion clavier) déjà fourni par Radix et diverge des dimensions/focus du design system. Importer `<Switch>` depuis `@/components/ui/switch` plutôt que de réimplémenter la bascule.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Switch } from "@/components/ui/switch"',
    },
    {
      label: 'Réglage on/off avec label (notifications)',
      code: `<div className="flex items-center gap-2">
  <Switch
    id="email-notifications"
    checked={notificationsEnabled}
    onCheckedChange={setNotificationsEnabled}
  />
  <label htmlFor="email-notifications" className="text-sm cursor-pointer">
    Recevoir les notifications par email
  </label>
</div>`,
    },
  ],
}
