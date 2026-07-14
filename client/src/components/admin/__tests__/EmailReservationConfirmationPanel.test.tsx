import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

vi.mock('../EmailSystemTemplatePanel', () => ({
  EmailSystemTemplatePanel: ({
    templateKey,
    onOpenEditor,
  }: {
    templateKey: string
    onOpenEditor: () => void
  }) => (
    <div data-testid={`stub-${templateKey}`}>
      <button type="button" onClick={onOpenEditor}>
        open
      </button>
    </div>
  ),
}))

import { EmailReservationConfirmationPanel } from '../EmailReservationConfirmationPanel'

describe('EmailReservationConfirmationPanel', () => {
  it('mounts the reservation confirmation stub', () => {
    const onOpenEditor = vi.fn()
    render(<EmailReservationConfirmationPanel onOpenEditor={onOpenEditor} />)

    expect(
      screen.getByTestId('email-reservation-confirmation-panel'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('stub-reservation_confirmation'),
    ).toBeInTheDocument()
  })

  it('forwards onOpenEditor to the wrapped system panel button', async () => {
    const user = userEvent.setup()
    const onOpenEditor = vi.fn()
    render(<EmailReservationConfirmationPanel onOpenEditor={onOpenEditor} />)

    await user.click(screen.getByRole('button', { name: 'open' }))
    expect(onOpenEditor).toHaveBeenCalledTimes(1)
  })
})
