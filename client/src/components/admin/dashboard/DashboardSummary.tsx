import type { DashboardKpis, DashboardVisibility } from '@/lib/dashboard'
import type { EngagementStats } from '@/types/analytics'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiTile } from './KpiTile'

export interface DashboardSummaryProps {
  kpis: DashboardKpis
  engagement?: EngagementStats
  isLoading?: boolean
  visibility: DashboardVisibility
}

/** Zone « En un coup d'œil » : 4 tuiles KPI synthétiques. */
export function DashboardSummary({ kpis, engagement, isLoading, visibility }: DashboardSummaryProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-full">
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const responseRate =
    engagement && engagement.sent > 0
      ? Math.round((engagement.clicked / engagement.sent) * 100)
      : 0

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {visibility.showEventsKpi && (
        <KpiTile
          data-testid="kpi-events"
          label="Événements"
          value={kpis.totalEvents}
          hint={`dont ${kpis.publishedEvents} publié${kpis.publishedEvents > 1 ? 's' : ''}`}
          tooltip="Nombre total d'événements créés. Seuls les événements publiés sont visibles par les membres."
        />
      )}
      {visibility.showFillRateKpi && (
        <KpiTile
          data-testid="kpi-fillrate"
          label="Remplissage moyen"
          value={`${kpis.avgFillRate} %`}
          tooltip="Réservations confirmées ÷ capacité totale, sur l'ensemble des créneaux de tous les événements."
        />
      )}
      {visibility.showBookingsKpi && (
        <KpiTile
          data-testid="kpi-bookings"
          label="Réservations / capacité"
          value={`${kpis.totalBookings} / ${kpis.totalCapacity}`}
          tooltip="Cumul de toutes les réservations actives sur la capacité totale offerte par vos événements."
        />
      )}
      {visibility.showInvitedKpi && (
        <KpiTile
          data-testid="kpi-members"
          label="Membres invités"
          value={engagement ? engagement.invited : '—'}
          hint={engagement ? `${responseRate} % ont cliqué` : undefined}
          tooltip="Membres ayant reçu au moins une invitation, tous événements confondus. Le taux correspond aux clics sur le lien d'invitation ÷ envois réussis."
        />
      )}
    </div>
  )
}
