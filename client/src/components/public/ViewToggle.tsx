import { Calendar, List, Clock } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ViewMode } from '@/hooks/useViewMode'

export interface ViewToggleProps {
  viewMode: ViewMode
  onChange: (mode: ViewMode) => void
}

/**
 * ViewToggle — bascule Mois / Semaine / Liste pour le calendrier
 * (public + espace membre).
 *
 * Le ToggleGroup est rendu directement, sans le wrapper `useCompactMode`
 * (`overflow-hidden [contain:inline-size]`). Ce wrapper réduisait l'item flex
 * à 0 de large dans la ligne `justify-between` du header calendrier (le
 * `contain: inline-size` supprime le sizing contenu → collapse → toggle
 * invisible). Or le conteneur n'est jamais contraint en largeur de façon à
 * nécessiter le mode compact : en mobile la ligne passe en colonne pleine
 * largeur. Le rendu direct content-sized (`shrink-0`) restaure la visibilité.
 *
 * `w-fit` est nécessaire EN PLUS de `inline-flex` : enfant d'un parent
 * `flex flex-col` (mobile), `align-items: stretch` étirerait sinon le toggle
 * à 100 % de large sur l'axe transversal. NE PAS retirer comme « redondant ».
 */
export function ViewToggle({ viewMode, onChange }: ViewToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={viewMode}
      onValueChange={(v) => { if (v) onChange(v as ViewMode) }}
      size="sm"
      className="inline-flex w-fit flex-nowrap shrink-0 rounded-md border border-gray-200 p-1"
      aria-label="Mode d'affichage"
    >
      <ToggleGroupItem
        value="calendar"
        aria-label="Vue calendrier mensuel"
        className="shrink-0 gap-1.5"
      >
        <Calendar className="h-4 w-4" aria-hidden="true" />
        <span>Mois</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="week"
        aria-label="Vue semaine avec grille horaire"
        className="shrink-0 gap-1.5"
      >
        <Clock className="h-4 w-4" aria-hidden="true" />
        <span>Semaine</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="list"
        aria-label="Vue liste"
        className="shrink-0 gap-1.5"
      >
        <List className="h-4 w-4" aria-hidden="true" />
        <span>Liste</span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
