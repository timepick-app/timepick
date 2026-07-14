import type { ComponentMeta } from './_meta/types'

export const progressMeta: ComponentMeta = {
  name: 'Progress',
  importPath: '@/components/ui/progress',
  summary:
    'Barre de progression déterminée et accessible basée sur Radix UI (`@radix-ui/react-progress`). Export unique `Progress` (`forwardRef`) : piste `relative h-4 w-full overflow-hidden rounded-full bg-secondary` et indicateur `bg-primary` animé (`transition-all`) dont le remplissage est piloté par la prop `value` (pourcentage 0–100) via `transform: translateX(-(100 - value)%)`. Sans variantes ni tailles cva : la hauteur se règle par `className` (`h-3`, `h-1.5`) et la couleur de la barre peut être surchargée en ciblant `[data-state="complete"] > div`. Radix expose le rôle `progressbar` et `aria-valuenow`/`aria-valuemax`. Usages réels : `EventRow` (jauge compacte inline, `h-1.5 w-32`).',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Passer une `value` numérique normalisée entre 0 et 100 (jamais un ratio brut ni une valeur > 100)',
      correct:
        '<Progress value={fillRate} /> // fillRate calculé en pourcentage, ex. Math.round((filled / total) * 100)',
      wrong:
        '<Progress value={filled / total} /> // ratio 0–1 → barre quasi vide en permanence',
    },
    {
      rule: 'Ajuster la hauteur via `className` et accoler un libellé textuel pour exprimer la valeur chiffrée, plutôt que de compter sur la seule barre',
      correct:
        '<div className="flex items-center gap-3">\n  <Progress value={fillRate} className="h-1.5 w-32" />\n  <Typography variant="body-sm" color="muted">{`${fillRate} %`}</Typography>\n</div>',
      wrong:
        '<Progress value={fillRate} /> // hauteur par défaut h-4 trop massive en ligne, aucune valeur lisible',
    },
  ],
  antiPatterns: [
    {
      title: 'Utiliser `Progress` comme indicateur de chargement indéterminé',
      description:
        'Le composant est déterminé : il représente une proportion connue (taux de remplissage, avancement d\'un upload). Sans `value` exploitable, il reste figé et trompe l\'utilisateur. Pour un chargement de durée inconnue, utiliser un spinner ou des `<Skeleton>`.',
    },
    {
      title: 'Reconstruire une jauge maison avec deux `<div>`',
      description:
        'Un `<div>` de fond + un `<div>` de remplissage en pourcentage perd le rôle `progressbar` et les attributs `aria-valuenow`/`aria-valuemax` fournis par Radix, donc l\'accessibilité. Toujours passer par `<Progress value={…} />` et n\'ajuster que le style via `className`.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Progress } from "@/components/ui/progress"',
    },
    {
      label: 'Taux de remplissage d\'un événement (carte stats)',
      code: `<div className="relative">
  <Progress value={stats.fillRate} className="h-3" />
</div>`,
    },
    {
      label: 'Jauge compacte inline avec libellé',
      code: `<div className="flex items-center gap-3">
  <Progress value={fillRate} className="h-1.5 w-32" />
  <Typography variant="body-sm" color="muted">{\`\${fillRate} %\`}</Typography>
  <Typography variant="body-sm" color="muted">{\`\${filled} remplis · \${vacant} vacants\`}</Typography>
</div>`,
    },
  ],
}
