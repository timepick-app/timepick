import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DashboardSummary } from '../DashboardSummary'
import type { DashboardKpis, DashboardVisibility } from '@/lib/dashboard'
import type { EngagementStats } from '@/types/analytics'

const kpis: DashboardKpis = {
  totalEvents: 5, publishedEvents: 3, avgFillRate: 72, totalBookings: 18, totalCapacity: 25,
}
const engagement: EngagementStats = { invited: 10, sent: 8, clicked: 4, booked: 6, unansweredOver3Days: 2 }

/** Visibility avec tous les flags actifs */
const visibilityAll: DashboardVisibility = {
  showEventsKpi: true,
  showFillRateKpi: true,
  showBookingsKpi: true,
  showInvitedKpi: true,
  showFunnel: true,
  showDonut: true,
  showAnalysis: true,
}

describe('DashboardSummary', () => {
  const wrap = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>)

  it('affiche les KPI principaux quand toutes les tuiles sont visibles', () => {
    wrap(<DashboardSummary kpis={kpis} engagement={engagement} visibility={visibilityAll} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('dont 3 publiés')).toBeInTheDocument()
    expect(screen.getByText('72 %')).toBeInTheDocument()
    expect(screen.getByText('18 / 25')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('50 % ont cliqué')).toBeInTheDocument() // 4/8
  })

  it('gère un engagement indéfini (tuile membres en —)', () => {
    wrap(<DashboardSummary kpis={kpis} visibility={visibilityAll} />)
    const members = screen.getByTestId('kpi-members')
    expect(within(members).getByText('—')).toBeInTheDocument()
  })

  it('affiche des squelettes en chargement (indépendant de visibility)', () => {
    const { container } = wrap(<DashboardSummary kpis={kpis} isLoading visibility={visibilityAll} />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('5')).not.toBeInTheDocument()
  })

  describe('visibilité conditionnelle des tuiles', () => {
    it('affiche les 4 tuiles quand visibility est tout vrai', () => {
      wrap(<DashboardSummary kpis={kpis} visibility={visibilityAll} />)
      expect(screen.getByTestId('kpi-events')).toBeInTheDocument()
      expect(screen.getByTestId('kpi-fillrate')).toBeInTheDocument()
      expect(screen.getByTestId('kpi-bookings')).toBeInTheDocument()
      expect(screen.getByTestId('kpi-members')).toBeInTheDocument()
    })

    it('affiche uniquement kpi-events quand seul showEventsKpi est vrai', () => {
      const visibility: DashboardVisibility = {
        ...visibilityAll,
        showEventsKpi: true,
        showFillRateKpi: false,
        showBookingsKpi: false,
        showInvitedKpi: false,
      }
      wrap(<DashboardSummary kpis={kpis} visibility={visibility} />)
      expect(screen.getByTestId('kpi-events')).toBeInTheDocument()
      expect(screen.queryByTestId('kpi-fillrate')).toBeNull()
      expect(screen.queryByTestId('kpi-bookings')).toBeNull()
      expect(screen.queryByTestId('kpi-members')).toBeNull()
    })

    it('masque kpi-members quand showInvitedKpi est false, les 3 autres restent présentes', () => {
      const visibility: DashboardVisibility = { ...visibilityAll, showInvitedKpi: false }
      wrap(<DashboardSummary kpis={kpis} visibility={visibility} />)
      expect(screen.getByTestId('kpi-events')).toBeInTheDocument()
      expect(screen.getByTestId('kpi-fillrate')).toBeInTheDocument()
      expect(screen.getByTestId('kpi-bookings')).toBeInTheDocument()
      expect(screen.queryByTestId('kpi-members')).toBeNull()
    })
  })
})
