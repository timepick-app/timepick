import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SetupEncryptionKeyStep } from '../SetupEncryptionKeyStep'

describe('SetupEncryptionKeyStep', () => {
  it("affiche l'empreinte fournie", () => {
    render(<SetupEncryptionKeyStep fingerprint="abc123def456" onDone={vi.fn()} />)
    expect(screen.getByTestId('encryption-key-fingerprint')).toHaveTextContent('abc123def456')
  })

  it('ne rend jamais une chaîne hex de 64 caractères (pas de clé brute)', () => {
    render(<SetupEncryptionKeyStep fingerprint="abc123def456" onDone={vi.fn()} />)
    const hex64 = /\b[0-9a-f]{64}\b/i
    expect(document.body.textContent ?? '').not.toMatch(hex64)
  })

  it('"Continuer" appelle onDone', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<SetupEncryptionKeyStep fingerprint="abc123def456" onDone={onDone} />)

    await user.click(screen.getByTestId('encryption-key-continue-btn'))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('le bouton "Continuer" est toujours actif (pas de checkbox)', () => {
    render(<SetupEncryptionKeyStep fingerprint="abc123def456" onDone={vi.fn()} />)
    expect(screen.getByTestId('encryption-key-continue-btn')).toBeEnabled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
