import { Separator } from '@/components/ui/separator'
import type { ReactNode } from 'react'

interface AuthShellProps {
  children: ReactNode
}

/**
 * AuthShell — coquille partagée des vues d'authentification : centre le contenu
 * et applique le fond token (`bg-muted/40`). La marque TimePick n'est PLUS rendue
 * ici : elle vit désormais DANS la card de chaque état (composant `AuthBrand`,
 * en tête de `CardHeader`). Les états transitoires (loading/success), qui n'ont
 * pas de card, restent volontairement sans marque.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full min-w-0 max-w-md">{children}</div>
    </div>
  )
}

/**
 * AuthBrand — wordmark TimePick rendu comme `<h1>` de page, centré, en tête du
 * `CardHeader` des vues d'authentification. Source unique : évite la duplication
 * du markup de marque entre Login et EmergencyLogin (titre de card = `<h2>` via
 * `Typography as="h2"`, l'ordre des titres reste h1 → h2).
 */
export function AuthBrand() {
  return (
    <>
      <h1 className="text-center text-xl font-bold text-primary">TimePick</h1>
      <Separator />
    </>
  )
}
