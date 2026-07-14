import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface SheetShellProps
  extends Omit<React.ComponentPropsWithoutRef<typeof SheetContent>, 'title'> {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Titre du panneau (rendu dans <SheetTitle>, sert d'aria-label au dialog). */
  title: React.ReactNode
  /** Zone d'action basse, sans bordure (cf. séparateur fade). Absent = aucun footer. */
  footer?: React.ReactNode
  children: React.ReactNode
}

/**
 * Coquille partagée des panneaux latéraux (Sheet) — fiches membre, édition de
 * créneau, et tout futur panneau d'admin.
 *
 * Structure : header figé → corps scrollable → séparateur en dégradé (fade) →
 * footer optionnel sans bordure. Le `Sheet` (Radix Dialog sous le capot) gère
 * sa hauteur pleine et le scroll natif, ce qui élimine tout débordement viewport.
 *
 * - Largeur : pleine en mobile (override du `w-3/4` du primitif), `sm:max-w-lg` desktop.
 * - `p-0`/`gap-0` neutralisent le padding du primitif pour piloter le rythme par zone.
 * - Le séparateur est un dégradé `pointer-events-none` (jamais une barre bordée).
 * - Les props restantes (`onInteractOutside`, `onEscapeKeyDown`, …) sont transmises
 *   à `SheetContent` → permet de garder le panneau ouvert sous une confirmation empilée.
 */
export function SheetShell({
  open,
  onOpenChange,
  title,
  footer,
  children,
  className,
  ...contentProps
}: SheetShellProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className={cn('flex flex-col gap-0 p-0 w-full sm:max-w-lg', className)}
        {...contentProps}
      >
        <SheetHeader className="shrink-0 px-6 py-4 pr-12">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="relative min-h-0 flex-1">
          {/* pb-16 (64px) > hauteur du fade (h-12 = 48px) : garantit que le dernier
              contenu dégage toujours la bande de fondu et reste parfaitement lisible. */}
          <div className="h-full overflow-y-auto px-6 pb-16 pt-4">{children}</div>
          {/* Séparateur fade : le contenu se fond dans le fond avant la zone basse.
              pointer-events-none → les champs sous le dégradé restent cliquables. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent"
          />
        </div>

        {footer ? (
          <SheetFooter className="shrink-0 gap-2 px-6 py-4">{footer}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
