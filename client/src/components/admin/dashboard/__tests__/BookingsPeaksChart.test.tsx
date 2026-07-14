import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingsPeaksChart } from '../BookingsPeaksChart'
import { SAMPLE_BOOKINGS } from './sampleBookings'
import type { BookingTimestamps } from '@/types/analytics'

// Radix ToggleGroup s'appuie sur releasePointerCapture (absent de jsdom).
// hasPointerCapture / setPointerCapture sont déjà mockés dans test/setup.ts.
beforeAll(() => {
  if (!('releasePointerCapture' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      value: vi.fn(),
      configurable: true,
    })
  }
})

// Événement vide (type étendu : createdAt + endDate requis par contrat).
const emptyData: BookingTimestamps = {
  name: 'Événement vide',
  opensAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  endDate: null,
  timestamps: [],
  totalCapacity: 0,
}

// Second événement : identité + pic NETtement différents (septembre). Sert à vérifier
// le re-cadrage Auto au changement d'événement, SANS remount (comme dans le dashboard).
const eventB: BookingTimestamps = {
  name: "Festival d'automne",
  opensAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-30T00:00:00.000Z',
  totalCapacity: 30,
  timestamps: [
    Date.UTC(2026, 8, 15, 12, 0), Date.UTC(2026, 8, 15, 12, 10),
    Date.UTC(2026, 8, 15, 12, 20), Date.UTC(2026, 8, 15, 12, 30),
    Date.UTC(2026, 8, 15, 12, 40),
    Date.UTC(2026, 8, 10, 9, 0), Date.UTC(2026, 8, 20, 16, 0),
  ],
}

describe('BookingsPeaksChart', () => {
  it('affiche un état vide quand timestamps est vide', () => {
    render(<BookingsPeaksChart data={emptyData} />)
    expect(screen.getByText('Aucune inscription pour cet événement')).toBeInTheDocument()
  })

  it('affiche un squelette en chargement (pas le texte vide)', () => {
    const { container } = render(<BookingsPeaksChart data={undefined} isLoading />)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.queryByText('Aucune inscription pour cet événement')).not.toBeInTheDocument()
  })

  it("rend le nom de l'événement comme titre dominant", () => {
    render(<BookingsPeaksChart data={SAMPLE_BOOKINGS} />)
    expect(screen.getByText(SAMPLE_BOOKINGS.name)).toBeInTheDocument()
  })

  it('propose les 5 presets-fenêtre et active « Heure » au clic', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<BookingsPeaksChart data={SAMPLE_BOOKINGS} />)
    // Les 5 presets présents, dans l'ordre Tout → Heure.
    expect(screen.getByText('Tout').closest('button')).toBeInTheDocument()
    expect(screen.getByText('Mois').closest('button')).toBeInTheDocument()
    expect(screen.getByText('Semaine').closest('button')).toBeInTheDocument()
    expect(screen.getByText('Jour').closest('button')).toBeInTheDocument()
    expect(screen.getByText('Heure').closest('button')).toBeInTheDocument()

    await user.click(screen.getByText('Heure'))
    expect(screen.getByText('Heure').closest('button')).toHaveAttribute('aria-checked', 'true')
  })

  it('bascule entre « Par période » et « Total »', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<BookingsPeaksChart data={SAMPLE_BOOKINGS} />)
    expect(screen.getByText('Par période').closest('button')).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByText('Total'))
    expect(screen.getByText('Total').closest('button')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Par période').closest('button')).toHaveAttribute('aria-checked', 'false')
  })

  it("affiche les repères de dates d'extent (publication → dernier créneau)", () => {
    render(<BookingsPeaksChart data={SAMPLE_BOOKINGS} />)
    // opensAt = 10 juin (publication, borne gauche) ; endDate = 30 juin (dernier créneau, borne droite).
    expect(screen.getByText('10 juin')).toBeInTheDocument()
    expect(screen.getByText('30 juin')).toBeInTheDocument()
  })

  it('vue Total : le libellé bascule sur « effectuées / proposées »', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<BookingsPeaksChart data={SAMPLE_BOOKINGS} />)
    await user.click(screen.getByText('Total'))
    // 12 réservations (timestamps) / 20 places proposées (totalCapacity de l'échantillon).
    expect(screen.getByText('12 réservations sur 20 places')).toBeInTheDocument()
  })

  it("re-cadre Auto au changement d'événement (la fenêtre suit le nouveau pic, sans remount)", () => {
    const { rerender } = render(<BookingsPeaksChart data={SAMPLE_BOOKINGS} />)
    // Événement A : pic en juin → l'en-tête « Pic » référence juin.
    expect(screen.getByText((c) => /^Pic\s*:/.test(c)).textContent).toMatch(/juin/)
    // Changement d'événement SANS remount (key retiré côté dashboard).
    rerender(<BookingsPeaksChart data={eventB} />)
    // La fenêtre Auto doit se recaler sur le pic de septembre (sinon le slide reste en juin).
    const peakB = screen.getByText((c) => /^Pic\s*:/.test(c))
    expect(peakB.textContent).toMatch(/sept/)
    expect(peakB.textContent).not.toMatch(/juin/)
  })

  it('préserve le preset au poll (même identité, +1 réservation → PAS de re-cadrage)', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { rerender } = render(<BookingsPeaksChart data={SAMPLE_BOOKINGS} />)
    await user.click(screen.getByText('Heure'))
    expect(screen.getByText('Heure').closest('button')).toHaveAttribute('aria-checked', 'true')
    // Poll : même événement (identité inchangée) + une réservation de plus.
    const polled = { ...SAMPLE_BOOKINGS, timestamps: [...SAMPLE_BOOKINGS.timestamps, Date.UTC(2026, 5, 22, 14, 5)] }
    rerender(<BookingsPeaksChart data={polled} />)
    expect(screen.getByText('Heure').closest('button')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Auto').closest('button')).toHaveAttribute('aria-checked', 'false')
  })
})
