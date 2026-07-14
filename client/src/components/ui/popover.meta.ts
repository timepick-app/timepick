import type { ComponentMeta } from './_meta/types'

export const popoverMeta: ComponentMeta = {
  name: 'Popover',
  importPath: '@/components/ui/popover',
  summary:
    'Surface flottante positionnée et accessible basée sur Radix UI (`@radix-ui/react-popover`). Brique fondatrice non-modale réutilisée pour les menus contextuels, les combobox et les sélecteurs (date picker). Cinq exports : `Popover` (Root, contrôlable via `open` + `onOpenChange`), `PopoverTrigger` (déclencheur, à coupler avec `asChild`), `PopoverContent` (wrapper `forwardRef` portalisé : `z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none`, props `align="center"` et `sideOffset={4}` par défaut, `side` héritée de Radix, animations `data-[state]`/`data-[side]`), `PopoverAnchor` (ancre de positionnement indépendante du trigger) et `PopoverPortal`. Sans variantes cva : la taille et le padding se pilotent par `className` (ex. `w-[var(--radix-popover-trigger-width)] p-0` pour un combobox). Usages réels : `EmailIdentityMenu`, `EmailTestSendMenu` (menus de formulaire), `DensityLab` (combobox + date picker).',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Toujours utiliser `asChild` sur `PopoverTrigger` pour fusionner le déclencheur avec un `<Button>`/`<button>` existant, jamais imbriquer un bouton dans un bouton',
      correct:
        '<Popover open={open} onOpenChange={setOpen}>\n  <PopoverTrigger asChild>\n    <Button variant="ghost">Identité</Button>\n  </PopoverTrigger>\n  <PopoverContent align="start">…</PopoverContent>\n</Popover>',
      wrong:
        '<PopoverTrigger>\n  <Button variant="ghost">Identité</Button>\n</PopoverTrigger> // <button> imbriqué dans le <button> du trigger → HTML invalide',
    },
    {
      rule: 'Héberger l\'état métier (champs dirty, brouillon de formulaire) dans le composant parent et non dans `PopoverContent`, qui est démonté à chaque fermeture',
      correct:
        'function Menu() {\n  const [draft, setDraft] = useState(initial) // vit dans le parent, survit aux ouvertures\n  return (\n    <Popover open={open} onOpenChange={setOpen}>\n      <PopoverTrigger asChild><Button>Éditer</Button></PopoverTrigger>\n      <PopoverContent>\n        <Input value={draft} onChange={(e) => setDraft(e.target.value)} />\n      </PopoverContent>\n    </Popover>\n  )\n}',
      wrong:
        'function PopoverContentForm() {\n  const [draft, setDraft] = useState(initial) // perdu dès que le popover se ferme\n  return <Input value={draft} onChange={(e) => setDraft(e.target.value)} />\n}',
    },
  ],
  antiPatterns: [
    {
      title: 'Stocker des édits non sauvegardés dans `PopoverContent`',
      description:
        '`PopoverContent` est portalisé et démonté à la fermeture : tout `useState` qui y vit est réinitialisé dès que l\'utilisateur ferme puis ré-ouvre le popover. Remonter l\'état dirty vers le composant racine (cf. le commentaire et le pattern `onDirtyChange` de `EmailIdentityMenu`) pour que le brouillon survive aux ouvertures/fermetures.',
    },
    {
      title: 'Détourner un `Popover` en boîte de dialogue bloquante',
      description:
        'Le popover est non-modal et contextuel (ancré à un trigger) : il ne piège pas le focus ni ne pose d\'overlay. Pour une interaction qui doit interrompre l\'utilisateur ou couvrir l\'écran (confirmation destructive, formulaire plein écran mobile), utiliser `<Dialog>` ou `<Sheet>`.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"',
    },
    {
      label: 'Combobox (largeur calée sur le trigger, padding retiré)',
      code: `<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <button type="button" role="combobox" aria-expanded={open} className="h-9 w-full justify-between">
      {selected?.label ?? "Sélectionner un événement"}
    </button>
  </PopoverTrigger>
  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
    <div className="border-b p-2">
      <input placeholder="Rechercher…" className="w-full" />
    </div>
    <ul className="max-h-60 overflow-auto p-1">
      {options.map((o) => (
        <li key={o.id} onClick={() => select(o)}>{o.label}</li>
      ))}
    </ul>
  </PopoverContent>
</Popover>`,
    },
    {
      label: 'Menu contextuel de formulaire (envoi de test)',
      code: `<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button type="button" variant="ghost">Envoyer un test</Button>
  </PopoverTrigger>
  <PopoverContent align="start" side="bottom" sideOffset={8}>
    <form onSubmit={handleSend} className="space-y-3">
      <Label htmlFor="test-email">Adresse de test</Label>
      <Input id="test-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" className="w-full">Envoyer</Button>
    </form>
  </PopoverContent>
</Popover>`,
    },
  ],
}
