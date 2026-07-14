import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { Typography } from '@/components/ui/typography'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { DashboardSummary } from '@/components/admin/dashboard/DashboardSummary'
import { AttentionZone } from '@/components/admin/dashboard/AttentionZone'
import { BookingsPeaksChart } from '@/components/admin/dashboard/BookingsPeaksChart'
import { BookingsEventSelect, type BookingsEventSelection } from '@/components/admin/dashboard/BookingsEventSelect'
import { InvitationFunnel } from '@/components/admin/dashboard/InvitationFunnel'
import { FillDonut } from '@/components/admin/dashboard/FillDonut'
import { EventList } from '@/components/admin/dashboard/EventList'
import { OnboardingGuide } from '@/components/admin/dashboard/OnboardingGuide'
import { computeKpis, computeAttentionItems, resolveChartEvent, computeDashboardVisibility, firstEventToInvite } from '@/lib/dashboard'
import { useEvents } from '@/hooks/useEvents'
import { useAllEventsStats } from '@/hooks/useStats'
import { useBookingTimestamps, useDashboardEngagement, useEventActivity } from '@/hooks/useDashboardAnalytics'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useUsers } from '@/hooks/useUsers'

/** Erreur de zone discrète : circonscrite à une zone, n'interrompt pas le reste du tableau de bord. */
function ZoneError({ message }: { message: string }) {
  return (
    <Alert variant="warning">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export default function Admin() {
  const { isAuthChecked } = useAdminAuth()
  useDocumentTitle()

  const { events, isLoading: eventsLoading } = useEvents()
  const eventsList = useMemo(() => events ?? [], [events])

  // Tableau de bord toujours global : le filtre par événement a été retiré (revue Drawbridge).
  // Le détail par événement reste accessible via la zone « Vos événements » (clic → édition).
  const { data: eventStats, isLoading: statsLoading, isError: statsError } = useAllEventsStats(null)
  const { data: engagement, isLoading: engLoading, isError: engError } = useDashboardEngagement(null)

  // Compteurs live pilotant le guide d'amorçage (Membres → Événement → Invitations).
  const eventCount = eventsList.length
  const invitationsSent = engagement?.sent ?? 0
  // Guide monté tant que le pipeline n'est pas bouclé. On ne requête le compte de membres
  // QUE dans ce cas (jamais en régime établi) : `sent >= 1` implique déjà des membres, donc
  // memberCount n'est pas nécessaire pour décider de masquer le guide.
  const onboardingActive = eventCount === 0 || invitationsSent === 0
  const { pagination: usersPagination, loading: membersLoading, error: membersError } = useUsers({
    role: 'user',
    limit: 1,
    enabled: onboardingActive,
  })
  const memberCount = usersPagination?.total ?? 0
  // Le comptage membres a échoué : ne pas le faire passer pour « 0 membre » en silence.
  // On signale l'incertitude (le guide peut afficher l'étape ① à tort) au lieu d'avaler l'erreur.
  const membersErrorNode =
    membersError && onboardingActive ? (
      <ZoneError message="Impossible de vérifier vos membres — le guide peut être incomplet." />
    ) : null

  // Courbe « Réservations dans le temps » : par événement, résolu via une sélection
  // intelligente (défaut) ou un choix explicite. now n'est pas une dépendance du useMemo :
  // la résolution suit le cycle de refetch d'events/activity, pas l'horloge (accepté).
  const { data: activity, isLoading: activityLoading, isError: activityError } = useEventActivity()
  const [chartSelection, setChartSelection] = useState<BookingsEventSelection>({ kind: 'mode', mode: 'nearest' })
  const resolvedEventId = useMemo(() => {
    if (chartSelection.kind === 'event') {
      return eventsList.some(e => e.id === chartSelection.id)
        ? chartSelection.id
        : resolveChartEvent(eventsList, activity ?? [], 'nearest') // sélection devenue invalide → repli
    }
    return resolveChartEvent(eventsList, activity ?? [], chartSelection.mode)
  }, [chartSelection, eventsList, activity])
  const { data: raw, isLoading: rawLoading, isError: rawError } = useBookingTimestamps(resolvedEventId)

  const stats = useMemo(() => eventStats ?? [], [eventStats])
  const kpis = useMemo(() => computeKpis(eventsList, stats), [eventsList, stats])
  const visibility = useMemo(
    () => computeDashboardVisibility(kpis, engagement, stats),
    [kpis, engagement, stats]
  )
  const attentionItems = useMemo(
    () => computeAttentionItems(eventsList, stats, activity ?? []),
    [eventsList, stats, activity]
  )
  // Cible du CTA ③ : 1er événement sans invitations envoyées → deep-link onglet « Invités ».
  const inviteEventId = useMemo(
    () => firstEventToInvite(eventsList, activity),
    [eventsList, activity]
  )
  const { filled, vacant } = useMemo(
    () => ({
      filled: stats.reduce((acc, s) => acc + s.filledSlots, 0),
      vacant: stats.reduce((acc, s) => acc + s.vacantSlots, 0),
    }),
    [stats]
  )

  if (!isAuthChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Typography color="muted">Chargement...</Typography>
      </div>
    )
  }

  // Sélecteur d'événement du graphe d'analyse : rendu dans l'en-tête du graphe, mais
  // AUSSI dans la branche d'erreur dure (sinon plus aucun moyen de changer d'événement).
  const eventSelectorNode = (
    <BookingsEventSelect
      events={eventsList}
      selection={chartSelection}
      resolvedEventName={null}
      onSelectionChange={setChartSelection}
    />
  )

  // Anti-flash : tant qu'events (et le compte membres requis) chargent, on n'affiche aucune
  // phase — sinon le guide « vide » clignote avant l'arrivée des données.
  const dashboardLoading = eventsLoading || (onboardingActive && membersLoading)

  return (
    <AdminLayout>
      <TooltipProvider>
        <div className="space-y-8" data-testid="admin-dashboard">
          {dashboardLoading ? (
            <div className="grid gap-4 sm:grid-cols-3" data-testid="dashboard-loading">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : eventCount === 0 ? (
            /* Phase 0 — Démarrage : guide complet en tête, puis « À traiter », puis « Vos
               événements » (vide). Aucune zone analytique : rien à montrer. */
            <>
              {membersErrorNode}
              <OnboardingGuide
                density="full"
                memberCount={memberCount}
                eventCount={eventCount}
                invitationsSent={invitationsSent}
                inviteEventId={inviteEventId}
              />

              <section className="space-y-3" aria-labelledby="dashboard-attention-heading">
                <Typography id="dashboard-attention-heading" variant="h2">À traiter</Typography>
                <AttentionZone items={attentionItems} activityError={activityError} />
              </section>

              <section className="space-y-3" aria-labelledby="dashboard-events-heading">
                <Typography id="dashboard-events-heading" variant="h2">Vos événements</Typography>
                <EventList events={eventsList} stats={stats} />
              </section>
            </>
          ) : (
            /* Phases 1 & 2 : bande compacte du guide tant que le pipeline n'est pas bouclé,
               au-dessus de « À traiter ». Widgets analytiques montés selon les seuils de données. */
            <>
              {membersErrorNode}
              {onboardingActive && (
                <OnboardingGuide
                  density="compact"
                  memberCount={memberCount}
                  eventCount={eventCount}
                  invitationsSent={invitationsSent}
                  inviteEventId={inviteEventId}
                />
              )}

              {/* Zone 1 — À traiter */}
              <section className="space-y-3" aria-labelledby="dashboard-attention-heading">
                <Typography id="dashboard-attention-heading" variant="h2">À traiter</Typography>
                <AttentionZone items={attentionItems} activityError={activityError} />
              </section>

              {/* Zone 2 — Aperçu */}
              <section className="space-y-3" aria-labelledby="dashboard-summary-heading">
                <div className="space-y-0.5">
                  <Typography variant="body-xs" color="muted">Tous les événements</Typography>
                  <Typography id="dashboard-summary-heading" variant="h2">Aperçu</Typography>
                </div>
                {statsError ? (
                  <ZoneError message="Impossible de charger les indicateurs." />
                ) : (
                  <DashboardSummary kpis={kpis} engagement={engagement} isLoading={statsLoading} visibility={visibility} />
                )}
                {(visibility.showFunnel || visibility.showDonut) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {visibility.showFunnel && (
                      <Card>
                        <CardHeader>
                          <Typography variant="body-xs" color="muted">Tous les événements</Typography>
                          <div className="flex items-center gap-1.5">
                            <CardTitle>Entonnoir des invitations</CardTitle>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" aria-label="Plus d'informations" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Parcours d'un invité de la réception de l'email à la réservation confirmée. Chaque barre est relative au nombre total d'invités (100 %).
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {engError ? (
                            <ZoneError message="Impossible de charger les données d'engagement." />
                          ) : engLoading || !engagement ? (
                            <Skeleton className="h-40 w-full" />
                          ) : (
                            <InvitationFunnel engagement={engagement} />
                          )}
                        </CardContent>
                      </Card>
                    )}
                    {visibility.showDonut && (
                      <Card>
                        <CardHeader>
                          <Typography variant="body-xs" color="muted">Tous les événements</Typography>
                          <div className="flex items-center gap-1.5">
                            <CardTitle>Répartition des créneaux</CardTitle>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" aria-label="Plus d'informations" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                Créneaux ayant au moins une réservation (Remplis) vs créneaux encore disponibles (Vacants), tous événements confondus.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </CardHeader>
                        <CardContent className="flex justify-center">
                          {statsError ? (
                            <ZoneError message="Impossible de charger la répartition des créneaux." />
                          ) : statsLoading ? (
                            <Skeleton className="h-32 w-32 rounded-full" />
                          ) : (
                            <FillDonut filled={filled} vacant={vacant} />
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </section>

              {/* Zone 3 — Analyse */}
              {visibility.showAnalysis && (
                <section className="space-y-3" aria-labelledby="dashboard-analysis-heading">
                  <Typography id="dashboard-analysis-heading" variant="h2">Analyse</Typography>
                  <Card>
                    <CardContent className="pt-6">
                      {/* Erreur tolérante : on ne masque le graphe que s'il n'y a aucune donnée à montrer
                          (keepPreviousData conserve la dernière courbe lors d'un hoquet réseau). */}
                      {rawError && !raw ? (
                        <div className="space-y-3">
                          <div className="flex sm:justify-end"><div className="w-full sm:w-64">{eventSelectorNode}</div></div>
                          <ZoneError message="Impossible de charger les inscriptions." />
                        </div>
                      ) : (
                        <BookingsPeaksChart
                          data={raw}
                          isLoading={rawLoading || activityLoading}
                          eventSelector={eventSelectorNode}
                        />
                      )}
                    </CardContent>
                  </Card>
                </section>
              )}

              {/* Zone 4 — Vos événements */}
              <section className="space-y-3" aria-labelledby="dashboard-events-heading">
                <Typography id="dashboard-events-heading" variant="h2">Vos événements</Typography>
                <EventList events={eventsList} stats={stats} />
              </section>
            </>
          )}
        </div>
      </TooltipProvider>
    </AdminLayout>
  )
}
