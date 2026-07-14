import type { ComponentType } from "react"
import type { RowData } from "@tanstack/react-table"

declare module "@tanstack/react-table" {
  // Les deux paramètres génériques sont requis pour fusionner avec la
  // déclaration d'origine de TanStack Table (declaration merging).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes appliquées à l'en-tête (th) ET aux cellules (td) de la colonne. */
    className?: string
    /** Libellé lisible de la colonne (menu « Affichage »). À défaut, `column.id`. */
    label?: string
  }
}

/** Option sélectionnable dans un filtre à facettes. */
export interface DataTableFacetOption {
  label: string
  value: string
  icon?: ComponentType<{ className?: string }>
}

/** Configuration d'un filtre à facettes rattaché à une colonne. */
export interface DataTableFacetedFilterConfig {
  /** id de la colonne ciblée. */
  columnId: string
  /** Titre affiché sur le déclencheur du filtre. */
  title: string
  /** Options sélectionnables. */
  options: DataTableFacetOption[]
}
