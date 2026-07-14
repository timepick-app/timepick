import { Users } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getInitials } from '@/lib/getInitials'
import { cn } from '@/lib/utils'
import type { Volunteer } from '@/types/slot'

interface SlotRosterProps {
  /** Inscrits agrégés sur le créneau (`slot.volunteers`). `null` = non chargé / aucun. */
  volunteers: Volunteer[] | null | undefined
  /** Décompte autoritaire des réservations (source de vérité du ratio). */
  currentBookings: number
  capacity: number
}

/**
 * Initiales (2 lettres) à partir d'un nom complet concaténé « Prénom Nom ».
 *
 * `Volunteer.name` est déjà concaténé côté SQL, alors que `getInitials` attend
 * prénom et nom séparés. On le re-découpe (1er segment = prénom, reste = nom)
 * pour réutiliser l'unique convention d'initiales du projet plutôt que d'en
 * introduire une seconde.
 */
function rosterInitials(name: string): string {
  const [first = '', ...rest] = name.trim().split(/\s+/)
  return getInitials(first, rest.join(' '))
}

/**
 * Aperçu lecture seule des inscrits d'un créneau (admin / organisateur).
 *
 * Bloc volontairement différencié du formulaire (`bg-muted/40 rounded-lg border`)
 * pour signaler « contexte, pas champ éditable » — pattern liste dense type
 * shadcn-admin (avatar `h-8 w-8` + nom, séparateurs fins). Rendu dans le corps
 * scrollable du `SheetShell`, jamais hors scroll : une longue liste défile sans
 * pousser le footer.
 */
export function SlotRoster({ volunteers, currentBookings, capacity }: SlotRosterProps) {
  const list = volunteers ?? []
  const isFull = currentBookings >= capacity
  const isOver = currentBookings > capacity
  // Décompte autoritaire = currentBookings ; les noms viennent de volunteers.
  // En cas de divergence (agrégat non hydraté / désync), on le signale plutôt
  // que d'affirmer « aucun inscrit » sous un ratio non nul.
  const hiddenCount = currentBookings - list.length
  const ratioLabel = `${currentBookings} sur ${capacity} place(s)${
    isOver ? ', surcapacité' : isFull ? ', complet' : ''
  }`

  return (
    <section
      aria-labelledby="slot-roster-title"
      className="rounded-lg border bg-muted/40 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="slot-roster-title"
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          Inscrits
        </h3>
        <Badge
          variant={isOver ? 'destructive' : isFull ? 'warning' : 'default'}
          role="img"
          aria-label={ratioLabel}
        >
          {currentBookings} / {capacity}
        </Badge>
      </div>

      {list.length === 0 ? (
        currentBookings > 0 ? (
          <p className="py-4 text-center text-sm text-amber-600">
            {currentBookings} inscrit(s) — détail indisponible.
          </p>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun inscrit pour l'instant.
          </p>
        )
      ) : (
        <>
          <ul className="mt-2 max-h-64 divide-y divide-border/60 overflow-y-auto">
            {list.map((volunteer) => {
              const named = volunteer.name?.trim()
              return (
                <li key={volunteer.id} className="flex items-center gap-2 py-1.5">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs font-medium">
                      {named ? rosterInitials(named) : '—'}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      named ? 'text-foreground' : 'italic text-muted-foreground'
                    )}
                  >
                    {named || 'Sans nom renseigné'}
                  </span>
                </li>
              )
            })}
          </ul>
          {hiddenCount > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Liste partielle : {list.length}/{currentBookings} nom(s) affiché(s).
            </p>
          )}
        </>
      )}
    </section>
  )
}
