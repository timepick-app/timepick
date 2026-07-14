import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Typography } from "@/components/ui/typography"
import { dataTableMeta } from "@/components/ui/data-table.meta"
import { ComponentDoc } from "./_shared"
import { DataTableDemo } from "./_demos"

export function DataView() {
  return (
    <>
      <header className="space-y-2">
        <Typography variant="h1">Données &amp; tableaux</Typography>
        <Typography variant="body" color="muted">
          DataTable (TanStack Table) : tri, recherche, filtres à facettes, visibilité des colonnes, pagination et sélection multiple avec actions groupées.
        </Typography>
      </header>

      {/* DataTable — Démo */}
      <Card>
        <CardHeader>
          <CardTitle>DataTable — Exemple</CardTitle>
          <CardDescription>
            Modèle de référence shadcn-admin. Sélectionnez des lignes pour révéler la barre d'actions groupées ; filtrez par Statut / Priorité, triez les colonnes, ajustez l'affichage et paginez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTableDemo />
        </CardContent>
      </Card>

      {/* DataTable — Doc cards */}
      <ComponentDoc
        meta={dataTableMeta}
        guidelinesDescription="Conventions pour des colonnes triables, une sélection stable et un menu d'affichage lisible."
        antiPatternsDescription="Pièges à éviter lors de l'intégration d'un tableau de données."
        examplesDescription="Extraits d'intégration côté client."
      />
    </>
  )
}
