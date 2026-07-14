import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EventInvitesTab } from '../EventInvitesTab'
import { useInvitationStatus } from '@/hooks/useInvitationStatus'
import { useInvitations } from '@/hooks/useInvitations'
import { useInvitationEligibility } from '@/hooks/useInvitationEligibility'
import { useAdminSlots } from '@/hooks/useAdminSlots'
import { useRemoveEventUser, useSetEventUsers } from '@/hooks/useEvents'
import type { InvitationStatusUser } from '@/types/invitation'

vi.mock('@/hooks/useInvitationStatus', () => ({ useInvitationStatus: vi.fn() }))
vi.mock('@/hooks/useInvitations', () => ({ useInvitations: vi.fn() }))
vi.mock('@/hooks/useInvitationEligibility', () => ({ useInvitationEligibility: vi.fn() }))
vi.mock('@/hooks/useAdminSlots', () => ({ useAdminSlots: vi.fn() }))
vi.mock('@/hooks/useEvents', () => ({ useRemoveEventUser: vi.fn(), useSetEventUsers: vi.fn() }))
vi.mock('@/components/admin/EventCancellationNotificationsSection', () => ({
  EventCancellationNotificationsSection: () => null,
}))

const user = (over: Partial<InvitationStatusUser>): InvitationStatusUser => ({
  id: 'u1',
  email: 'u@x.io',
  firstName: 'Jean',
  lastName: 'Dupont',
  phone: null,
  role: 'user',
  selectedAt: '2026-06-10T09:00:00Z',
  invitationStatus: 'pending',
  sentAt: null,
  clickedAt: null,
  firstSentAt: null,
  sendCount: 0,
  ...over,
})

function setStatus(users: InvitationStatusUser[], isLoading = false) {
  vi.mocked(useInvitationStatus).mockReturnValue({
    users,
    isLoading,
    error: null,
    refetch: vi.fn(),
  })
}

function renderTab() {
  return render(
    <TooltipProvider>
      <EventInvitesTab eventId="evt-1" isPublished />
    </TooltipProvider>
  )
}

describe('EventInvitesTab', () => {
  beforeEach(() => {
    vi.mocked(useInvitations).mockReturnValue({
      invitations: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      sendInvitations: vi.fn(),
      isSending: false,
      resendInvitation: vi.fn(),
      isResending: false,
    })
    vi.mocked(useInvitationEligibility).mockReturnValue({ data: { canSend: true }, isLoading: false } as never)
    vi.mocked(useAdminSlots).mockReturnValue({ slots: [{}] } as never)
    vi.mocked(useRemoveEventUser).mockReturnValue({ removeEventUser: vi.fn(), isRemoving: false })
    vi.mocked(useSetEventUsers).mockReturnValue({ setEventUsers: vi.fn(), isSetting: false })
  })

  it('affiche la ligne KPI et le tableau des invités', () => {
    setStatus([
      user({ id: 'a', firstName: 'Jean', lastName: 'Dupont', invitationStatus: 'pending' }),
      user({
        id: 'b',
        firstName: 'Marie',
        lastName: 'Martin',
        invitationStatus: 'sent',
        sentAt: '2026-06-12T09:00:00Z',
        firstSentAt: '2026-06-12T09:00:00Z',
        sendCount: 1,
      }),
    ])
    renderTab()

    // KPI : segments comptés depuis les lignes de statut.
    const heading = screen.getByText('Invités & invitations')
    expect(heading.parentElement).toHaveTextContent('2 invités')
    expect(heading.parentElement).toHaveTextContent('1 en attente')

    // Tableau : les deux invités sont listés.
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
    expect(screen.getByText('Marie Martin')).toBeInTheDocument()

    // Toolbar : libellés courts visibles + aria-label complet (Drawbridge #51/#52).
    expect(
      screen.getByRole('button', { name: 'Envoyer une invitation aux 1 invités en attente' })
    ).toHaveTextContent('Envoyer (1)')
    expect(screen.getByRole('button', { name: 'Ajouter des invités' })).toHaveTextContent('Ajouter')
  })

  it('affiche un état vide avec CTA quand aucun invité', () => {
    setStatus([])
    renderTab()
    expect(screen.getByText(/Aucun invité pour le moment/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ajouter des invités/i })).toBeInTheDocument()
  })
})
