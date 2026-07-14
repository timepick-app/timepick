import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { SessionExpiredModal } from '../SessionExpiredModal'

describe('SessionExpiredModal', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'tok')
    localStorage.setItem('auth_user', JSON.stringify({ id: '1' }))
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })
  })

  it('redirects to /login?reason=session_expired when X close button is clicked', async () => {
    const user = userEvent.setup()
    render(<SessionExpiredModal open />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(window.location.href).toBe('/login?reason=session_expired')
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(localStorage.getItem('auth_user')).toBeNull()
  })

  it('redirects when the OK button is clicked (regression guard)', async () => {
    const user = userEvent.setup()
    render(<SessionExpiredModal open />)
    await user.click(screen.getByRole('button', { name: /me connecter/i }))
    expect(window.location.href).toBe('/login?reason=session_expired')
  })
})
