import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PublishButton } from '../PublishButton'
import type { Event } from '../../../hooks/useEvents'

// Mock des hooks
vi.mock('../../../hooks/useEvents', () => ({
  usePublishEvent: vi.fn(),
  useUnpublishEvent: vi.fn(),
}))

// Mock du composant Dialog
vi.mock('../../../components/ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) => (
    <div data-testid="dialog-container" data-open={open}>
      {open && children}
      <button onClick={() => onOpenChange(false)}>Close</button>
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
}))

// Mock du composant Button
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    variant?: string
  }) => (
    <button
      data-variant={variant}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
}))

import { usePublishEvent, useUnpublishEvent } from '../../../hooks/useEvents'

describe('PublishButton', () => {
  const mockPublishEvent = vi.fn()
  const mockUnpublishEvent = vi.fn()

  const mockEventUnpublished: Event = {
    id: '123',
    name: 'Test Event',
    description: 'Test description',
    isPublished: false,
    opensAt: null,
    hasCustomInvitation: false,
    periodStart: null,
    periodEnd: null,
    createdAt: '2026-01-19T10:00:00Z',
    updatedAt: '2026-01-19T10:00:00Z',
  }

  const mockEventPublished: Event = {
    ...mockEventUnpublished,
    isPublished: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePublishEvent).mockReturnValue({
      publishEvent: mockPublishEvent,
      isPublishing: false,
    })
    vi.mocked(useUnpublishEvent).mockReturnValue({
      unpublishEvent: mockUnpublishEvent,
      isUnpublishing: false,
    })
  })

  it('affiche "Publier" si l\'événement n\'est pas publié', () => {
    render(<PublishButton event={mockEventUnpublished} />)

    // Le bouton principal qui déclenche le dialog
    const triggerButton = screen.getAllByRole('button').find(
      btn => btn.textContent === 'Publier' && btn.getAttribute('data-variant') === 'default'
    )
    expect(triggerButton).toBeDefined()
  })

  it('affiche "Dépublier" si l\'événement est publié', () => {
    render(<PublishButton event={mockEventPublished} />)

    // Le bouton principal qui déclenche le dialog
    const triggerButton = screen.getAllByRole('button').find(
      btn => btn.textContent === 'Dépublier' && btn.getAttribute('data-variant') === 'outline'
    )
    expect(triggerButton).toBeDefined()
  })

  it('utilise le variant default pour publier et outline pour dépublier', () => {
    const { rerender } = render(<PublishButton event={mockEventUnpublished} />)

    const publishButton = screen.getAllByRole('button').find(
      btn => btn.textContent === 'Publier' && btn.getAttribute('data-variant') === 'default'
    )
    expect(publishButton).toHaveAttribute('data-variant', 'default')

    rerender(<PublishButton event={mockEventPublished} />)

    const unpublishButton = screen.getAllByRole('button').find(
      btn => btn.textContent === 'Dépublier' && btn.getAttribute('data-variant') === 'outline'
    )
    expect(unpublishButton).toHaveAttribute('data-variant', 'outline')
  })

  it('affiche "Chargement..." pendant la publication', () => {
    vi.mocked(usePublishEvent).mockReturnValue({
      publishEvent: mockPublishEvent,
      isPublishing: true,
    })

    render(<PublishButton event={mockEventUnpublished} />)

    const loadingButton = screen.getByRole('button', { name: 'Chargement...' })
    expect(loadingButton).toBeInTheDocument()
  })

  it('affiche "Chargement..." pendant la dépublication', () => {
    vi.mocked(useUnpublishEvent).mockReturnValue({
      unpublishEvent: mockUnpublishEvent,
      isUnpublishing: true,
    })

    render(<PublishButton event={mockEventPublished} />)

    const loadingButton = screen.getByRole('button', { name: 'Chargement...' })
    expect(loadingButton).toBeInTheDocument()
  })

  it('désactive le bouton pendant le chargement', () => {
    vi.mocked(usePublishEvent).mockReturnValue({
      publishEvent: mockPublishEvent,
      isPublishing: true,
    })

    render(<PublishButton event={mockEventUnpublished} />)

    const button = screen.getByRole('button', { name: 'Chargement...' })
    expect(button).toBeDisabled()
  })

  it('appelle publishEvent lors de la confirmation de publication', async () => {
    render(<PublishButton event={mockEventUnpublished} />)

    const triggerButton = screen.getAllByRole('button').find(
      btn => btn.textContent === 'Publier' && btn.getAttribute('data-variant') === 'default'
    )!
    fireEvent.click(triggerButton)

    // Trouver le bouton de confirmation dans le dialog (data-footer)
    const footerButtons = Array.from(screen.getByTestId('dialog-footer')!.querySelectorAll('button'))
    const confirmButton = footerButtons.find(btn => btn.textContent === 'Publier')!
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockPublishEvent).toHaveBeenCalledWith('123')
    })
  })

  it('appelle unpublishEvent lors de la confirmation de dépublication', async () => {
    render(<PublishButton event={mockEventPublished} />)

    const triggerButton = screen.getAllByRole('button').find(
      btn => btn.textContent === 'Dépublier' && btn.getAttribute('data-variant') === 'outline'
    )!
    fireEvent.click(triggerButton)

    // Trouver le bouton de confirmation dans le dialog (data-footer)
    const footerButtons = Array.from(screen.getByTestId('dialog-footer')!.querySelectorAll('button'))
    const confirmButton = footerButtons.find(btn => btn.textContent === 'Dépublier')!
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockUnpublishEvent).toHaveBeenCalledWith('123')
    })
  })
})
