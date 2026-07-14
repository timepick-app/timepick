import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvitationFunnel } from '../InvitationFunnel'
import type { EngagementStats } from '@/types/analytics'

const eng = (o: Partial<EngagementStats> = {}): EngagementStats => ({
  invited: 10, sent: 8, clicked: 4, booked: 6, unansweredOver3Days: 2, ...o,
})

describe('InvitationFunnel', () => {
  it('rend les 4 étapes avec les bonnes valeurs', () => {
    render(<InvitationFunnel engagement={eng()} />)
    expect(screen.getByText('Invités')).toBeInTheDocument()
    expect(screen.getByText('Envoyées')).toBeInTheDocument()
    expect(screen.getByText('Cliquées')).toBeInTheDocument()
    expect(screen.getByText('Réservations')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('gère invited=0 sans NaN (barres à 0%)', () => {
    const { container } = render(
      <InvitationFunnel engagement={eng({ invited: 0, sent: 0, clicked: 0, booked: 0 })} />,
    )
    const bars = container.querySelectorAll('[data-testid="funnel-bar"]')
    expect(bars.length).toBe(4)
    bars.forEach((b) => expect((b as HTMLElement).style.width).toBe('0%'))
  })
})
