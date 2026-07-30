import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { mockUseCancellation, mockUseResend, mockResendMutate } = vi.hoisted(() => ({
  mockUseCancellation: vi.fn(),
  mockUseResend: vi.fn(),
  mockResendMutate: vi.fn(),
}))

vi.mock('@/hooks/useCancellationNotifications', () => ({
  useCancellationNotifications: () => mockUseCancellation(),
  useResendCancellationNotifications: () => mockUseResend(),
}))

import { CancellationAttentionItem } from '../CancellationAttentionItem'

const renderItem = () =>
  render(
    <MemoryRouter>
      <CancellationAttentionItem />
    </MemoryRouter>,
  )

beforeEach(() => {
  mockResendMutate.mockReset()
  mockUseResend.mockReturnValue({ mutate: mockResendMutate, isPending: false })
})

describe('CancellationAttentionItem', () => {
  it('ne rend rien si aucune notification en attente', () => {
    mockUseCancellation.mockReturnValue({ data: { pending: 0, events: [] } })
    const { container } = renderItem()
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche le message, la sous-liste des événements et le bouton si en attente', () => {
    mockUseCancellation.mockReturnValue({
      data: {
        pending: 2,
        events: [
          { eventId: 'e1', eventName: 'Gala', pendingCount: 1, slots: [] },
          { eventId: 'e2', eventName: 'AG', pendingCount: 1, slots: [] },
        ],
      },
    })
    renderItem()
    expect(screen.getByText(/2 notifications d'annulation/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Gala/ })).toHaveAttribute('href', '/admin/events/e1/edit#template')
    expect(screen.getByRole('link', { name: /AG/ })).toHaveAttribute('href', '/admin/events/e2/edit#template')
    expect(screen.getByRole('button', { name: /Tout renvoyer/ })).toBeInTheDocument()
  })

  it('renvoie toutes les notifications au clic', () => {
    mockUseCancellation.mockReturnValue({
      data: { pending: 1, events: [{ eventId: 'e1', eventName: 'Gala', pendingCount: 1, slots: [] }] },
    })
    renderItem()
    fireEvent.click(screen.getByRole('button', { name: /Tout renvoyer/ }))
    expect(mockResendMutate).toHaveBeenCalledWith(undefined)
  })

  it('désactive le bouton pendant le renvoi', () => {
    mockUseResend.mockReturnValue({ mutate: mockResendMutate, isPending: true })
    mockUseCancellation.mockReturnValue({
      data: { pending: 1, events: [{ eventId: 'e1', eventName: 'Gala', pendingCount: 1, slots: [] }] },
    })
    renderItem()
    expect(screen.getByRole('button', { name: /Renvoi en cours/ })).toBeDisabled()
  })
})
