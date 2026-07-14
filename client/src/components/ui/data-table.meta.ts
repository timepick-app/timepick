import type { ComponentMeta } from './_meta/types'

export const dataTableMeta: ComponentMeta = {
  name: 'DataTable',
  importPath: '@/components/ui/data-table',
  summary:
    "Tableau de données riche basé sur TanStack Table : tri, recherche, filtres à facettes, visibilité des colonnes, pagination, sélection multiple et barre d'actions groupées. Mode client clé en main (composant DataTable) ou mode serveur en composant les parties génériques exportées.",
  variants: [],
  sizes: [],
  extraAxes: [
    {
      name: 'Parties',
      description:
        "Briques composables autour d'une instance useReactTable. DataTable les assemble pour le mode client ; en mode serveur, on les compose à la main.",
      items: [
        {
          name: 'DataTable',
          description:
            'Racine clé en main (mode client) : barre d\'outils + table + pagination + sélection, tout géré côté client.',
        },
        {
          name: 'DataTableToolbar',
          description:
            'Recherche (globale ou par colonne) + filtres à facettes + bouton Réinitialiser + menu Affichage + actions personnalisées.',
        },
        {
          name: 'DataTableColumnHeader',
          description: 'En-tête de colonne triable (croissant / décroissant / masquer).',
        },
        {
          name: 'DataTableFacetedFilter',
          description: 'Filtre multi-sélection par facettes (popover + command + compteurs).',
        },
        {
          name: 'DataTableViewOptions',
          description: 'Menu de visibilité des colonnes (masquables uniquement).',
        },
        {
          name: 'DataTablePagination',
          description: 'Lignes par page, page X sur Y, navigation, compteur de sélection.',
        },
        {
          name: 'DataTableBulkActions',
          description:
            "Barre flottante d'actions groupées, visible dès qu'une ligne est sélectionnée (Échap désélectionne).",
        },
      ],
    },
  ],
  guidelines: [
    {
      rule: 'Définir les en-têtes triables via DataTableColumnHeader',
      correct:
        'header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />',
      wrong: 'header: () => <span onClick={sortHack}>Email</span>',
    },
    {
      rule: 'Donner une identité de ligne stable pour fiabiliser la sélection',
      correct: '<DataTable getRowId={(row) => row.id} … />',
      wrong: '<DataTable … />  // sélection indexée, instable au tri / à la pagination',
    },
    {
      rule: "Documenter le libellé d'une colonne via meta.label (menu Affichage)",
      correct: '{ accessorKey: "createdAt", meta: { label: "Inscrit le" } }',
      wrong: '{ accessorKey: "createdAt" }  // affiche l\'id brut « createdAt »',
    },
  ],
  antiPatterns: [
    {
      title: 'Réécrire un <table> manuel pour des données triables / filtrables',
      description:
        "Pour toute liste avec tri, recherche, sélection ou pagination, utiliser DataTable plutôt qu'un tableau HTML codé à la main : la logique TanStack est mutualisée et accessible.",
    },
    {
      title: 'Tout charger côté client sur de gros volumes',
      description:
        "Le composant DataTable clé en main filtre / pagine côté client. Pour de gros jeux de données, composer les parties génériques autour d'un useReactTable en mode manuel (pagination / recherche pilotées par l'API).",
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table"',
    },
    {
      label: 'Usage client',
      code: '<DataTable columns={columns} data={rows} searchColumnId="email" getRowId={(r) => r.id} />',
    },
    {
      label: 'Filtres à facettes',
      code: '<DataTable … facetedFilters={[{ columnId: "role", title: "Rôle", options: roleOptions }]} />',
    },
    {
      label: 'Actions groupées',
      code: '<DataTable … renderBulkActions={(table) => <DataTableBulkActions table={table} entityName="membre(s)">…</DataTableBulkActions>} />',
    },
  ],
}
