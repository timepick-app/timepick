import { Fragment } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useMySlots } from '@/hooks/useMySlots'
import { useMyAvailableSlots } from '@/hooks/useMyAvailableSlots'
import { formatSlotRange } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Typography } from '@/components/ui/typography'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

/**
 * MemberAgendaPage — corps de la route `/me` (index membre connecté).
 *
 * Le `<h1>` « Mon agenda » est rendu par `AppShell` via `pageTitle` — NE PAS
 * l'ajouter ici. Page lecture seule : pas de logique d'annulation inline ;
 * cette action nécessite une confirmation et sera traitée dans une story dédiée.
 *
 * AC1 : 3 Cards (prochains créneaux / heures réalisées / disponibles).
 * AC3 : sous-texte explicite « Un créneau futur réservé n'est pas compté. »
 * AC8 : defaults sûrs — jamais de rendu conditionnel sur `undefined`.
 */
export function MemberAgendaPage() {
  const { data: slotsData, isLoading: slotsLoading, isError: slotsError } = useMySlots()
  const { data: availableSlots, isLoading: availLoading, isError: availError } = useMyAvailableSlots()

  const upcoming = slotsData?.upcoming ?? []
  const totalRealizedHours = slotsData?.totalRealizedHours ?? 0
  const available = availableSlots ?? []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1 — pleine largeur desktop */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle as="h2">Mes prochains créneaux</CardTitle>
            <CardDescription>Tous événements confondus, triés par date</CardDescription>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : slotsError ? (
              <Typography variant="body" color="muted">
                Impossible de charger vos créneaux. Réessayez plus tard.
              </Typography>
            ) : upcoming.length === 0 ? (
              <Typography variant="body" color="muted">
                Aucun créneau à venir.
              </Typography>
            ) : (
              <ul>
                {upcoming.map((b, i) => (
                  <Fragment key={b.slotUuid}>
                    {i > 0 && <Separator />}
                    <li className="flex items-center gap-3 py-2">
                      <span className="text-sm font-medium w-16 shrink-0">
                        {format(parseISO(b.startTime), 'dd MMM', { locale: fr })}
                      </span>
                      <span className="text-sm tabular-nums text-foreground">
                        {formatSlotRange(b.startTime, b.endTime)}
                      </span>
                      <span className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm text-muted-foreground truncate">
                          {b.eventName}
                        </span>
                        {b.status === 'cancelled' && (
                          <Badge variant="error">Annulé</Badge>
                        )}
                      </span>
                    </li>
                  </Fragment>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Card 2 — 1/3 desktop */}
        <Card>
          <CardHeader>
            <CardTitle as="h2">Heures réalisées</CardTitle>
            <CardDescription>Créneaux passés uniquement</CardDescription>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <Skeleton className="h-16 w-24" />
            ) : slotsError ? (
              <Typography variant="body" color="muted">
                Impossible de charger les heures réalisées. Réessayez plus tard.
              </Typography>
            ) : totalRealizedHours === 0 ? (
              <Typography variant="body" color="muted">
                Aucune heure réalisée.
              </Typography>
            ) : (
              <div>
                <div className="text-4xl font-semibold tabular-nums">
                  {totalRealizedHours.toLocaleString('fr-FR')} h
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Un créneau futur réservé n'est pas compté.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3 — 2/3 desktop */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Prochainement sans réservation</CardTitle>
            <CardDescription>Créneaux libres dans vos événements</CardDescription>
          </CardHeader>
          <CardContent>
            {availLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : availError ? (
              <Typography variant="body" color="muted">
                Impossible de charger vos créneaux disponibles. Réessayez plus tard.
              </Typography>
            ) : available.length === 0 ? (
              <Typography variant="body" color="muted">
                Aucun créneau disponible pour le moment.
              </Typography>
            ) : (
              <ul>
                {available.map((s, i) => (
                  <Fragment key={s.slotUuid}>
                    {i > 0 && <Separator />}
                    <li className="flex items-center gap-3 py-2">
                      <span className="text-sm font-medium w-16 shrink-0">
                        {format(parseISO(s.startTime), 'dd MMM', { locale: fr })}
                      </span>
                      <span className="text-sm tabular-nums text-foreground">
                        {formatSlotRange(s.startTime, s.endTime)}
                      </span>
                      <span className="text-sm text-muted-foreground flex-1 truncate">
                        {s.eventName}
                      </span>
                      <Badge variant="info" appearance="soft">{s.availableSpots} place(s) restante(s)</Badge>
                    </li>
                  </Fragment>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
