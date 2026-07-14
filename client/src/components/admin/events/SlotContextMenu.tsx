import { ControlledMenu, MenuItem } from '@szhsin/react-menu'
import '@szhsin/react-menu/dist/index.css'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isSlotCancelled, type Slot } from '@/types/slot'

interface SlotContextMenuProps {
  x: number
  y: number
  dateStr: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCreateSlot: (dateStr: string) => void
  // New props for event mode
  slot?: Slot
  onEditSlot?: (slot: Slot) => void
  onDeleteSlot?: (slot: Slot) => void
}

/**
 * SlotContextMenu Component
 *
 * Menu contextuel pour la création et l'édition de créneaux via clic-droit.
 * Utilise @szhsin/react-menu pour un menu accessible et keyboard-friendly.
 *
 * IMPORTANT: Configuration ControlledMenu pour context menu
 * - anchorPoint={{ x, y }} : position en objet unique
 * - state={isOpen ? 'open' : 'closed'} : string, PAS booléen
 * - onClose={() => onOpenChange(false)} : callback sans paramètre
 * - direction="right" : recommandé pour context menus
 *
 * Fonctionnalités:
 * - S'affiche à la position du clic (x, y)
 * - Mode cellule vide : Option "Nouveau créneau" avec icône Plus
 * - Mode événement : Options "Modifier" et "Supprimer" avec icônes Pencil/Trash2
 * - Style cohérent avec shadcn/ui (couleurs, ombres, border-radius)
 * - Navigation au clavier supportée (flèches, Entrée, Echap)
 *
 * @see Story 13.2: Création rapide via menu contextuel (clic-droit)
 * @see Story 13.3: Édition/Suppression via menu contextuel sur événement
 * @see https://szhsin.github.io/react-menu/ (Controlled menu > Context menu)
 */
export function SlotContextMenu({
  x,
  y,
  dateStr,
  isOpen,
  onOpenChange,
  onCreateSlot,
  slot,        // For event mode
  onEditSlot,  // For event mode
  onDeleteSlot, // For event mode
}: SlotContextMenuProps) {
  // Event mode: show Edit/Delete
  const isEventMode = !!slot

  const handleCreateSlot = () => {
    onCreateSlot(dateStr)
    onOpenChange(false)
  }

  const handleEditSlot = () => {
    if (slot && onEditSlot) {
      onEditSlot(slot)
    }
    onOpenChange(false)
  }

  const handleDeleteSlot = () => {
    // F9 : l'annulation d'un créneau réservé est désormais autorisée
    // (« Supprimer » = soft-delete). Seul garde-fou : un créneau déjà annulé
    // ne peut pas être ré-annulé.
    if (slot && isSlotCancelled(slot)) {
      return
    }
    if (slot && onDeleteSlot) {
      onDeleteSlot(slot)
    }
    onOpenChange(false)
  }

  return (
    <ControlledMenu
      anchorPoint={{ x, y }}
      state={isOpen ? 'open' : 'closed'}
      onClose={() => onOpenChange(false)}
      direction="right"
      viewScroll="auto"
      transition
      aria-label={isEventMode ? "Options de créneau" : "Options de création de créneau"}
    >
      {isEventMode ? (
        <>
          {/* Event mode: Edit */}
          <MenuItem
            className={cn(
              'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
              'transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              'focus:bg-accent focus:text-accent-foreground',
              'focus-visible:outline-none',
              'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
            )}
            onClick={handleEditSlot}
            aria-label="Modifier le créneau"
          >
            <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>Modifier</span>
          </MenuItem>

          {/* Event mode: Delete */}
          <MenuItem
            className={cn(
              'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
              'transition-colors',
              'hover:bg-destructive hover:text-destructive-foreground',
              'focus:bg-destructive focus:text-destructive-foreground',
              'focus-visible:outline-none',
              'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
            )}
            onClick={handleDeleteSlot}
            aria-label="Supprimer le créneau"
            disabled={slot ? isSlotCancelled(slot) : false}
          >
            <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>Supprimer</span>
          </MenuItem>
        </>
      ) : (
        <>
          {/* Empty cell mode: Create */}
          <MenuItem
            className={cn(
              'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none',
              'transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              'focus:bg-accent focus:text-accent-foreground',
              'focus-visible:outline-none'
            )}
            onClick={handleCreateSlot}
            aria-label="Créer un nouveau créneau"
          >
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>Nouveau créneau</span>
          </MenuItem>
        </>
      )}
    </ControlledMenu>
  )
}
