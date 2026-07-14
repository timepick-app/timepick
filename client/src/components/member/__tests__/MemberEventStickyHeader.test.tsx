import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberEventStickyHeader } from '../MemberEventStickyHeader'

// Le header rend MemberReservationsPopover qui consomme useMediaQuery.
// jsdom ne fournit pas window.matchMedia → mock obligatoire (défaut desktop).
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}))

describe('MemberEventStickyHeader (Story 1.5 AC2 + Story 1.6 AC1)', () => {
  it('affiche {nom} · {période} quand periodFormatted est fourni', () => {
    render(
      <MemberEventStickyHeader
        eventName="Fête de l'école"
        periodFormatted="2 avril 2026"
        eventReservations={[]}
      />,
    )
    expect(screen.getByText("Fête de l'école")).toBeInTheDocument()
    const period = screen.getByTestId('event-period')
    expect(period).toHaveTextContent('2 avril 2026')
  })

  it('affiche seulement le nom quand periodFormatted est null (aucun créneau actif)', () => {
    render(
      <MemberEventStickyHeader
        eventName="Événement vide"
        periodFormatted={null}
        eventReservations={[]}
      />,
    )
    expect(screen.getByText('Événement vide')).toBeInTheDocument()
    expect(screen.queryByTestId('event-period')).toBeNull()
  })

  it("ne contient aucun avatar / menu utilisateur / lien de connexion (AC2, UX-DR2)", () => {
    const { container } = render(
      <MemberEventStickyHeader
        eventName="Événement"
        periodFormatted="Période"
        eventReservations={[]}
      />,
    )
    // Aucun élément d'auth : pas de lien, image avatar, ni texte « Se connecter ».
    // NOTE Story 1.6 : un <button> est désormais présent (le badge « Mes réservations »),
    // mais ce n'est PAS une surface d'auth — c'est un contrôle contextuel neutre.
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByText('Se connecter')).toBeNull()
  })

  it('rend le badge « Mes réservations » (Story 1.6 AC1)', () => {
    render(
      <MemberEventStickyHeader
        eventName="Événement"
        periodFormatted="Période"
        eventReservations={[]}
      />,
    )
    // Le trigger badge est présent avec le décompte (0 ici).
    expect(screen.getByTestId('member-reservations-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('member-reservations-count')).toHaveTextContent('0')
  })

  it('utilise z-40 (strictement sous le header mobile AppShell z-50) et sticky top-0', () => {
    const { container } = render(
      <MemberEventStickyHeader
        eventName="Événement"
        periodFormatted="Période"
        eventReservations={[]}
      />,
    )
    const header = container.querySelector('header')
    expect(header).not.toBeNull()
    expect(header?.className).toContain('z-40')
    expect(header?.className).not.toContain('z-50')
    expect(header?.className).toContain('sticky')
    expect(header?.className).toContain('top-0')
  })

  it('rend le nom de l\'événement en <h1> (titre de page — résolution double-h1)', () => {
    render(
      <MemberEventStickyHeader
        eventName="Fête de la lune"
        periodFormatted="Période"
        eventReservations={[]}
      />,
    )
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Fête de la lune')
    // Style d'origine préservé (pas de classe h1 DS — barre de contexte).
    expect(heading.className).toContain('text-sm')
    expect(heading.className).toContain('font-semibold')
  })

})
