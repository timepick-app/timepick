import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SessionWarningToast } from '../SessionWarningToast'

describe('SessionWarningToast', () => {
  // --- Mode avertissement (sans critical) ---

  it('affiche « Prolonger de 2h » et un bouton Fermer en mode avertissement', () => {
    render(
      <SessionWarningToast
        onRefresh={vi.fn()}
        onDismiss={vi.fn()}
        timeRemaining={240}
      />,
    )
    expect(screen.getByRole('button', { name: /prolonger de 2h/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fermer/i })).toBeInTheDocument()
  })

  it('affiche le temps en minutes en mode avertissement', () => {
    render(
      <SessionWarningToast
        onRefresh={vi.fn()}
        onDismiss={vi.fn()}
        timeRemaining={240}
      />,
    )
    expect(screen.getByText(/4 minutes/i)).toBeInTheDocument()
  })

  // --- Mode critique (critical) ---

  it('affiche « Prolonger maintenant », sans bouton Fermer, en mode critique', () => {
    render(
      <SessionWarningToast
        onRefresh={vi.fn()}
        onDismiss={vi.fn()}
        timeRemaining={36}
        critical
      />,
    )
    expect(screen.getByRole('button', { name: /prolonger maintenant/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fermer/i })).toBeNull()
  })

  it('affiche les secondes en mode critique', () => {
    render(
      <SessionWarningToast
        onRefresh={vi.fn()}
        onDismiss={vi.fn()}
        timeRemaining={36}
        critical
      />,
    )
    expect(screen.getByText(/36 secondes/i)).toBeInTheDocument()
  })

  it('a role="alert" et affiche le rappel « Sauvegardez » en mode critique', () => {
    render(
      <SessionWarningToast
        onRefresh={vi.fn()}
        onDismiss={vi.fn()}
        timeRemaining={36}
        critical
      />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/sauvegardez votre travail/i)).toBeInTheDocument()
  })

  // --- Interactions ---

  it('appelle onRefresh au clic « Prolonger maintenant » (critique)', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(
      <SessionWarningToast
        onRefresh={onRefresh}
        onDismiss={vi.fn()}
        timeRemaining={36}
        critical
      />,
    )
    await user.click(screen.getByRole('button', { name: /prolonger maintenant/i }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('appelle onDismiss au clic « Fermer » (avertissement)', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(
      <SessionWarningToast
        onRefresh={vi.fn()}
        onDismiss={onDismiss}
        timeRemaining={240}
      />,
    )
    await user.click(screen.getByRole('button', { name: /fermer/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
