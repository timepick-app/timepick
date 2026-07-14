import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingGuide } from '../OnboardingGuide'

vi.mock('@/components/admin/events/CreateEventSheet', () => ({
  CreateEventSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-event-sheet" /> : null,
}))

let mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('OnboardingGuide', () => {
  beforeEach(() => {
    mockNavigate = vi.fn()
  })

  it("density='full', (0,0,0) → titre 'Pour commencer', 3 cartes et CTAs corrects", () => {
    render(
      <OnboardingGuide
        memberCount={0}
        eventCount={0}
        invitationsSent={0}
        density="full"
      />
    )
    expect(screen.getByText('Pour commencer')).toBeInTheDocument()
    expect(screen.getByText('Ajoutez vos membres')).toBeInTheDocument()
    expect(screen.getByText('Créez un événement')).toBeInTheDocument()
    expect(screen.getByText('Invitez et suivez')).toBeInTheDocument()
    // ① active → deux boutons membres
    expect(screen.getByRole('button', { name: 'Ajouter des membres' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer un CSV' })).toBeInTheDocument()
    // ② todo → bouton événement présent (règle : toujours actionnable si pas done)
    expect(screen.getByRole('button', { name: 'Créer un événement' })).toBeInTheDocument()
  })

  it("(40,0,0) → ① done : recap '40 membres ajoutés' + pas de boutons membres ; ② active avec 'Créer un événement'", () => {
    render(
      <OnboardingGuide
        memberCount={40}
        eventCount={0}
        invitationsSent={0}
        density="full"
      />
    )
    expect(screen.getByText('40 membres ajoutés')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter des membres' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importer un CSV' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer un événement' })).toBeInTheDocument()
  })

  it("clic 'Créer un événement' → CreateEventSheet apparaît", async () => {
    const user = userEvent.setup()
    render(
      <OnboardingGuide
        memberCount={0}
        eventCount={0}
        invitationsSent={0}
        density="full"
      />
    )
    await user.click(screen.getByRole('button', { name: 'Créer un événement' }))
    expect(screen.getByTestId('create-event-sheet')).toBeInTheDocument()
  })

  it("clic 'Ajouter des membres' → navigate('/admin/users')", async () => {
    const user = userEvent.setup()
    render(
      <OnboardingGuide
        memberCount={0}
        eventCount={0}
        invitationsSent={0}
        density="full"
      />
    )
    await user.click(screen.getByRole('button', { name: 'Ajouter des membres' }))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/users')
  })

  it("density='compact' → 'Mise en route' présent et 'Pour commencer' absent", () => {
    render(
      <OnboardingGuide
        memberCount={0}
        eventCount={0}
        invitationsSent={0}
        density="compact"
      />
    )
    expect(screen.getByText('Mise en route')).toBeInTheDocument()
    expect(screen.queryByText('Pour commencer')).not.toBeInTheDocument()
  })

  it("event step expose toujours une action même en 'todo' (0,0,0 — ② est 'todo')", () => {
    render(
      <OnboardingGuide
        memberCount={0}
        eventCount={0}
        invitationsSent={0}
        density="full"
      />
    )
    // Avec (0,0,0) : ① active, ② todo — le bouton doit quand même être présent
    expect(screen.getByRole('button', { name: 'Créer un événement' })).toBeInTheDocument()
  })

  it("③ active avec inviteEventId → deep-link vers l'onglet « Invités » de l'événement", async () => {
    const user = userEvent.setup()
    render(
      <OnboardingGuide
        memberCount={40}
        eventCount={3}
        invitationsSent={0}
        density="full"
        inviteEventId="evt-9"
      />
    )
    await user.click(screen.getByRole('button', { name: 'Inviter mes membres' }))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/events/evt-9/edit#users')
  })

  it("③ active sans inviteEventId → repli sur la liste des événements", async () => {
    const user = userEvent.setup()
    render(
      <OnboardingGuide
        memberCount={40}
        eventCount={3}
        invitationsSent={0}
        density="full"
      />
    )
    await user.click(screen.getByRole('button', { name: 'Inviter mes membres' }))
    expect(mockNavigate).toHaveBeenCalledWith('/admin/events')
  })

  it("le titre de section est un h2 (hiérarchie a11y, pas de saut h1→h3)", () => {
    render(
      <OnboardingGuide memberCount={0} eventCount={0} invitationsSent={0} density="full" />
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Pour commencer' })).toBeInTheDocument()
  })

  it("density=\"full\" → eyebrows ordinaux Étape 1/2/3 présents", () => {
    render(
      <OnboardingGuide memberCount={0} eventCount={0} invitationsSent={0} density="full" />
    )
    expect(screen.getByText('Étape 1')).toBeInTheDocument()
    expect(screen.getByText('Étape 2')).toBeInTheDocument()
    expect(screen.getByText('Étape 3')).toBeInTheDocument()
  })
})
