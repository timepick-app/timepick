import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AttentionItem } from '@/lib/dashboard'
import type { RecoveryBannerPayload } from '@/lib/recoveryBanner'

const { mockUseCancellation, mockUseResend, mockResendMutate, mockUseRecoveryBanner } = vi.hoisted(() => ({
  mockUseCancellation: vi.fn(),
  mockUseResend: vi.fn(),
  mockResendMutate: vi.fn(),
  mockUseRecoveryBanner: vi.fn(),
}))

vi.mock('@/hooks/useCancellationNotifications', () => ({
  useCancellationNotifications: () => mockUseCancellation(),
  useResendCancellationNotifications: () => mockUseResend(),
}))
vi.mock('@/hooks/useRecoveryBanner', () => ({
  useRecoveryBanner: () => mockUseRecoveryBanner(),
}))

import { AttentionZone } from '../AttentionZone'

const renderZone = (items: AttentionItem[], activityError = false) =>
  render(<TooltipProvider><MemoryRouter><AttentionZone items={items} activityError={activityError} /></MemoryRouter></TooltipProvider>)
const recoveryBanner = (o: Partial<RecoveryBannerPayload>): RecoveryBannerPayload => ({
  kind: 'missing', tone: 'amber', message: 'Aucun code de secours configuré.', dismissable: false, ...o,
})

beforeEach(() => {
  mockUseResend.mockReturnValue({ mutate: mockResendMutate, isPending: false })
  mockUseRecoveryBanner.mockReturnValue({ banner: null, dismiss: vi.fn(), isDismissing: false })
})

describe('AttentionZone', () => {
  it('affiche l\'état vide quand aucune alerte ni annulation', () => {
    mockUseCancellation.mockReturnValue({ data: { pending: 0, events: [] } })
    renderZone([])
    expect(screen.getByText(/Tout est à jour/)).toBeInTheDocument()
  })

  it('affiche l\'annulation en tête même sans autre alerte', () => {
    mockUseCancellation.mockReturnValue({
      data: { pending: 1, events: [{ eventId: 'e1', eventName: 'Gala', pendingCount: 1, slots: [] }] },
    })
    renderZone([])
    expect(screen.getByTestId('cancellation-attention-item')).toBeInTheDocument()
    expect(screen.queryByText(/Tout est à jour/)).not.toBeInTheDocument()
  })

  it('affiche les alertes génériques sans état vide', () => {
    mockUseCancellation.mockReturnValue({ data: { pending: 0, events: [] } })
    renderZone([{ kind: 'draft', message: '1 brouillon', eventId: 'e1', action: 'publish' }])
    expect(screen.getByRole('status', { name: '1 brouillon' })).toBeInTheDocument()
    expect(screen.queryByText(/Tout est à jour/)).not.toBeInTheDocument()
  })

  it('masque l\'état vide quand seule une alerte codes de secours existe', () => {
    mockUseCancellation.mockReturnValue({ data: { pending: 0, events: [] } })
    mockUseRecoveryBanner.mockReturnValue({ banner: recoveryBanner({}), dismiss: vi.fn(), isDismissing: false })
    renderZone([])
    expect(screen.getByTestId('recovery-attention-item')).toBeInTheDocument()
    expect(screen.queryByText(/Tout est à jour/)).not.toBeInTheDocument()
  })

  it('rend l\'alerte codes de secours AVANT l\'alerte d\'annulation', () => {
    mockUseCancellation.mockReturnValue({
      data: { pending: 1, events: [{ eventId: 'e1', eventName: 'Gala', pendingCount: 1, slots: [] }] },
    })
    mockUseRecoveryBanner.mockReturnValue({ banner: recoveryBanner({}), dismiss: vi.fn(), isDismissing: false })
    renderZone([])
    const recovery = screen.getByTestId('recovery-attention-item')
    const cancellation = screen.getByTestId('cancellation-attention-item')
    // recovery précède cancellation dans l'ordre du DOM
    expect(recovery.compareDocumentPosition(cancellation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('affiche la bannière d\'erreur d\'activité et masque l\'état vide positif quand activityError', () => {
    mockUseCancellation.mockReturnValue({ data: { pending: 0, events: [] } })
    renderZone([], true)
    expect(screen.getByTestId('attention-activity-error')).toBeInTheDocument()
    expect(screen.queryByText(/Tout est à jour/)).not.toBeInTheDocument()
  })

  it('affiche la bannière d\'erreur AU-DESSUS des autres alertes (non masquées)', () => {
    mockUseCancellation.mockReturnValue({ data: { pending: 0, events: [] } })
    renderZone([{ kind: 'draft', message: '1 brouillon', eventId: 'e1', action: 'publish' }], true)
    const banner = screen.getByTestId('attention-activity-error')
    const draft = screen.getByRole('status', { name: '1 brouillon' })
    expect(banner).toBeInTheDocument()
    expect(draft).toBeInTheDocument()
    // La bannière précède les alertes génériques dans le DOM.
    expect(banner.compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
