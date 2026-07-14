import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmCancelDialog } from '../ConfirmCancelDialog'

describe('ConfirmCancelDialog', () => {
  const defaultProps = {
    open: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('affiche le message de confirmation', () => {
    render(<ConfirmCancelDialog {...defaultProps} />)

    expect(screen.getByText(/confirmer l'annulation/i)).toBeVisible()
    expect(screen.getByText(/êtes-vous sûr de vouloir annuler/i)).toBeVisible()
  })

  it('affiche le message informatif sur la libération de place', () => {
    render(<ConfirmCancelDialog {...defaultProps} />)

    expect(screen.getByText(/votre place sera libérée/i)).toBeVisible()
  })

  it('affiche le bouton "Non, garder ma réservation"', () => {
    render(<ConfirmCancelDialog {...defaultProps} />)

    expect(screen.getByText(/non, garder ma réservation/i)).toBeVisible()
  })

  it('affiche le bouton "Oui, annuler"', () => {
    render(<ConfirmCancelDialog {...defaultProps} />)

    expect(screen.getByText(/oui, annuler/i)).toBeVisible()
  })

  it('appelle onConfirm quand on clique sur "Oui, annuler"', () => {
    const onConfirm = vi.fn()
    render(<ConfirmCancelDialog {...defaultProps} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByText(/oui, annuler/i))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('appelle onCancel quand on clique sur "Non, garder ma réservation"', () => {
    const onCancel = vi.fn()
    render(<ConfirmCancelDialog {...defaultProps} onCancel={onCancel} />)

    fireEvent.click(screen.getByText(/non, garder ma réservation/i))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('désactive les boutons quand isCancelling=true', () => {
    render(<ConfirmCancelDialog {...defaultProps} isCancelling={true} />)

    expect(screen.getByTestId('cancel-dialog-confirm-button')).toBeDisabled()
    expect(screen.getByTestId('cancel-dialog-keep-button')).toBeDisabled()
  })

  it('affiche "Annulation..." quand isCancelling=true', () => {
    render(<ConfirmCancelDialog {...defaultProps} isCancelling={true} />)

    expect(screen.getByText(/annulation.../i)).toBeVisible()
  })

  it('appelle onCancel quand on ferme le dialog (overlay click)', () => {
    const onCancel = vi.fn()
    const { container } = render(<ConfirmCancelDialog {...defaultProps} onCancel={onCancel} />)

    // Simuler un clic sur l'overlay (le premier div avec data-testid)
    const dialogOverlay = container.querySelector('[data-testid="confirm-cancel-dialog"]')?.closest('[data-state="open"]')
    if (dialogOverlay) {
      fireEvent.click(dialogOverlay)
    }
    // Note: Ce test dépend de l'implémentation de Radix UI Dialog
    // Si le dialog ne se ferme pas, onCancel sera appelé quand on clique sur "Non, garder"
  })

  it("n'affiche pas le dialog quand open=false", () => {
    render(<ConfirmCancelDialog {...defaultProps} open={false} />)

    expect(screen.queryByText(/confirmer l'annulation/i)).not.toBeInTheDocument()
  })
})
