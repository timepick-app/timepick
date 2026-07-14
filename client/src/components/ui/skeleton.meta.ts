import type { ComponentMeta } from './_meta/types'

export const skeletonMeta: ComponentMeta = {
  name: 'Skeleton',
  importPath: '@/components/ui/skeleton',
  summary:
    'Placeholder de chargement minimaliste : un simple `<div>` (`animate-pulse rounded-md bg-muted`) qui accepte toutes les `React.HTMLAttributes<HTMLDivElement>`. Sans variantes ni tailles intrinsèques : on dessine chaque bloc en lui passant des dimensions Tailwind via `className` (`h-*`, `w-*`, `rounded-full`, etc.) pour reproduire la forme du contenu qu\'il remplace pendant le `isLoading`. Usage très répandu : cartes du tableau de bord (`DashboardSummary`), graphiques (`BookingsPeaksChart`), calendrier de créneaux (`SlotCalendar`), pages d\'édition (`EventFormPage`, `Admin`). C\'est l\'outil par défaut pour préserver la stabilité de mise en page (éviter le layout shift) durant les chargements asynchrones.',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Calquer les dimensions du skeleton sur celles du contenu réel qu\'il remplace pour éviter tout saut de mise en page (layout shift) au moment du remplacement',
      correct:
        '{isLoading ? <Skeleton className="h-8 w-20" /> : <Typography variant="h2">{stats.total}</Typography>}',
      wrong:
        '{isLoading ? <Skeleton /> : <Typography variant="h2">{stats.total}</Typography>} // <Skeleton> sans h/w → bloc plat de 0px, contenu qui sursaute à l\'arrivée',
    },
    {
      rule: 'Reproduire la structure du bloc final (mêmes conteneurs grid/flex, mêmes espacements) plutôt qu\'un seul rectangle générique, pour une transition fidèle',
      correct:
        '<Card>\n  <CardContent className="space-y-2 p-4">\n    <Skeleton className="h-7 w-16" />\n    <Skeleton className="h-4 w-24" />\n  </CardContent>\n</Card>',
      wrong:
        '<Card>\n  <CardContent className="p-4">\n    <Skeleton className="h-20 w-full" /> // bloc unique qui ne ressemble pas à la carte chiffre + libellé\n  </CardContent>\n</Card>',
    },
  ],
  antiPatterns: [
    {
      title: 'Afficher un spinner centré au lieu de skeletons pour un contenu structuré',
      description:
        'Un spinner ne réserve pas l\'espace du contenu et provoque un saut de mise en page à l\'arrivée des données. Pour des cartes, listes ou graphiques de dimensions connues, des `<Skeleton>` calqués sur la forme finale donnent une perception de rapidité et stabilisent le layout. Réserver le spinner aux actions ponctuelles (bouton en cours de soumission).',
    },
    {
      title: 'Oublier de dimensionner le `<Skeleton>`',
      description:
        'Le composant n\'a aucune hauteur ni largeur intrinsèque : un `<Skeleton />` nu se réduit à 0px et reste invisible. Toujours fournir au moins une hauteur et une largeur via `className` (`h-6 w-40`, `h-32 w-full`, `h-32 w-32 rounded-full` pour un disque).',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Skeleton } from "@/components/ui/skeleton"',
    },
    {
      label: 'Bloc unique pour un graphique en chargement',
      code: `if (isLoading) return <Skeleton className="h-64 w-full" />`,
    },
    {
      label: 'Carte placeholder (chiffre + libellé)',
      code: `<Card>
  <CardContent className="space-y-2 p-4">
    <Skeleton className="h-7 w-16" />
    <Skeleton className="h-4 w-24" />
  </CardContent>
</Card>`,
    },
  ],
}
