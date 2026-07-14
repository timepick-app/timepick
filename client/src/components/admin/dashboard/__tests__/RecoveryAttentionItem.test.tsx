import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { RecoveryBannerPayload } from '@/lib/recoveryBanner'
import { RecoveryAttentionItem } from '../RecoveryAttentionItem'

const payload = (o: Partial<RecoveryBannerPayload>): RecoveryBannerPayload => ({
  kind: 'missing', tone: 'amber', message: 'Aucun code de secours configuré.', dismissable: false, ...o,
})
const renderItem = (banner: RecoveryBannerPayload | null, onDismiss = vi.fn(), isDismissing = false) =>
  render(<TooltipProvider><MemoryRouter><RecoveryAttentionItem banner={banner} onDismiss={onDismiss} isDismissing={isDismissing} /></MemoryRouter></TooltipProvider>)

describe('RecoveryAttentionItem', () => {
  it('ne rend rien si aucun banner', () => {
    expect(renderItem(null).container).toBeEmptyDOMElement()
  })
  it('rend le message et le lien « Gérer mes codes de secours »', () => {
    renderItem(payload({}))
    expect(screen.getByText('Aucun code de secours configuré.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Gérer mes codes de secours/ }))
      .toHaveAttribute('href', '/admin/profile')
  })
  it('ton ambre (warning) pour tous les cas (missing, low, expiring, emergency)', () => {
    renderItem(payload({ kind: 'missing', tone: 'amber' }))
    expect(screen.getByTestId('recovery-attention-item').className).toMatch(/bg-amber-50/)
  })
  it('ton ambre (warning) pour expiring/emergency', () => {
    renderItem(payload({ kind: 'expiring', tone: 'amber', message: 'Vos codes expirent bientôt.' }))
    expect(screen.getByTestId('recovery-attention-item').className).toMatch(/bg-amber-50/)
  })
  it('aucune croix de fermeture pour un cas non-ignorable', () => {
    renderItem(payload({ kind: 'missing', dismissable: false }))
    expect(screen.queryByRole('button', { name: /Ignorer/ })).not.toBeInTheDocument()
  })
  it('croix présente et déclenche onDismiss pour emergency (ignorable)', () => {
    const onDismiss = vi.fn()
    renderItem(payload({ kind: 'emergency', tone: 'amber', dismissable: true, message: 'Vous vous êtes connecté via code de secours.' }), onDismiss)
    fireEvent.click(screen.getByRole('button', { name: /Ignorer/ }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
  it('croix désactivée pendant la fermeture', () => {
    renderItem(payload({ kind: 'emergency', tone: 'amber', dismissable: true }), vi.fn(), true)
    expect(screen.getByRole('button', { name: /Ignorer/ })).toBeDisabled()
  })
})
