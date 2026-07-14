import type { ComponentMeta } from './_meta/types'

export const sliderMeta: ComponentMeta = {
  name: 'Slider',
  importPath: '@/components/ui/slider',
  summary:
    'Curseur de réglage natif et accessible construit sur `<input type="range">` (pattern shadcn-admin, zéro dépendance externe). Export unique `Slider` (`forwardRef<HTMLInputElement>`) : piste `relative h-1.5 w-full rounded-full bg-muted`, remplissage `bg-primary` animé (`transition-all duration-150`) piloté par `value` via `width: ${pct}%`, et thumb rond (`size-4 rounded-full border border-primary bg-background`) positionné en `left: ${pct}%`. L\'input natif est posé en overlay `absolute inset-0 opacity-0` pour capturer toute l\'interaction (clavier, drag, tactile) tout en héritant du rôle `slider` et des `aria-*` du navigateur ; `onValueChange` reçoit déjà un `number` (conversion interne par `Number(e.target.value)`). Sans variantes ni tailles cva : la largeur se règle via `className`. Usages réels : `PollingConfigPanel` (intervalle de polling).',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Toujours utiliser le callback `onValueChange` (qui reçoit un `number`), jamais l\'événement natif directement',
      correct:
        '<Slider value={seconds} onValueChange={setSeconds} min={10} max={120} step={10} /> // setSeconds reçoit déjà un number',
      wrong:
        '<Slider value={seconds} onValueChange={(e) => setSeconds(Number(e.target.value))} /> // double conversion et API incohérente avec le contrat',
    },
    {
      rule: 'Toujours afficher la valeur courante à côté du curseur (label ou `<span>` tabular-nums) — le slider seul ne suffit pas à l\'accessibilité',
      correct:
        '<div className="flex items-center gap-3">\n  <Slider value={seconds} onValueChange={setSeconds} min={10} max={120} step={10} aria-label="Intervalle de polling" />\n  <span className="tabular-nums">{seconds}s</span>\n</div>',
      wrong:
        '<Slider value={seconds} onValueChange={setSeconds} /> // aucune valeur lisible, le curseur seul est insuffisant en AT',
    },
  ],
  antiPatterns: [
    {
      title: 'Utiliser un `<input type="range">` nu au lieu du composant `Slider`',
      description:
        'Un input nu perd le track `bg-muted`, le fill `bg-primary` et le thumb stylé, et casse la cohérence visuelle du Design System. Toujours passer par `<Slider value={…} onValueChange={…} />` qui superpose l\'input natif transparent sur les éléments stylés.',
    },
    {
      title: 'Passer un `onValueChange` qui re-parse la valeur en `number`',
      description:
        'La conversion `Number(e.target.value)` est déjà faite en interne dans `Slider` : `onValueChange` reçoit un `number`. Re-parser (ou pire, traiter la valeur comme une `string` sans conversion) duplique le travail ou introduit une `NaN` silencieuse. Consommer directement la valeur reçue.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Slider } from "@/components/ui/slider"',
    },
    {
      label: 'Usage basique (0–100, pas 1)',
      code: '<Slider value={volume} onValueChange={setVolume} aria-label="Volume" />',
    },
    {
      label: 'Usage complet avec label, bornes et pas',
      code: `<div>
  <label htmlFor="polling-interval" className="mb-2 block">Intervalle de polling</label>
  <div className="flex items-center gap-3">
    <Slider
      min={10}
      max={120}
      step={10}
      value={seconds}
      onValueChange={setSeconds}
      id="polling-interval"
      aria-describedby="polling-description"
    />
    <span className="tabular-nums text-sm text-muted-foreground">{seconds}s</span>
  </div>
  <p id="polling-description" className="mt-1 text-xs text-muted-foreground">
    Entre 10s et 120s par pas de 10s.
  </p>
</div>`,
    },
  ],
}
