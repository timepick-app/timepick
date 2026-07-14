import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { bannerVariants } from '@/components/ui/banner'

export interface AttentionRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  icon: ReactNode
  /** Variant sémantique du Banner sous-jacent (couleurs + dark mode). */
  tone?: 'default' | 'info' | 'warning' | 'destructive'
  /** `status` (défaut — feedback non-bloquant) ou `alert` (assertif — erreurs). */
  role?: 'alert' | 'status'
  action: ReactNode
  children: ReactNode
}

/**
 * Ligne de la zone « À traiter » : extension « Banner + colonne d'action ».
 *
 * Réutilise le système visuel du composant DS `Banner` (variants sémantiques +
 * dark mode) en densité `compact`, sans hériter de son layout en grille.
 * `Banner` n'expose pas de slot d'action natif : cette primitive ajoute une
 * colonne d'action alignée à droite (`ml-auto`) tout en conservant les
 * couleurs, le padding et le radius de `bannerVariants`. twMerge fait gagner
 * `flex` sur le `grid` de la base Banner — les `grid-cols` deviennent inertes.
 * Sur mobile étroit, le contenu et l'action passent à la ligne (`flex-wrap`) ;
 * `ml-auto` maintient l'action alignée à droite même wrappée.
 */
export function AttentionRow({ icon, tone = 'default', role = 'status', action, children, className, ...rest }: AttentionRowProps) {
  return (
    <div
      role={role}
      className={cn(
        bannerVariants({ variant: tone, density: 'compact' }),
        'flex items-center gap-3',
        className,
      )}
      {...rest}
    >
      {icon != null && (
        <span className="shrink-0" aria-hidden="true">{icon}</span>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">{children}</div>
        {action != null && <div className="ml-auto shrink-0">{action}</div>}
      </div>
    </div>
  )
}
