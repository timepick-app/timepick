import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import Profile from '../Profile'

const { mockIsAuthChecked } = vi.hoisted(() => ({
  mockIsAuthChecked: { value: true },
}))

vi.mock('@/components/profile/ProfileContent', () => ({
  ProfileContent: () => <div data-testid="profile-content" />,
}))

vi.mock('@/components/layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({ isAuthChecked: mockIsAuthChecked.value }),
}))

vi.mock('@/hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => ({ setTitle: vi.fn() }),
}))

describe('Profile (wrapper admin)', () => {
  beforeEach(() => {
    mockIsAuthChecked.value = true
  })

  it("rend ProfileContent dans l'AdminLayout quand isAuthChecked est vrai", () => {
    render(<Profile />)
    expect(screen.getByTestId('profile-content')).toBeInTheDocument()
    expect(screen.queryByText('Chargement...')).not.toBeInTheDocument()
  })

  it("affiche le splash de chargement et n'affiche pas ProfileContent quand isAuthChecked est faux", () => {
    mockIsAuthChecked.value = false
    render(<Profile />)
    expect(screen.getByText('Chargement...')).toBeInTheDocument()
    expect(screen.queryByTestId('profile-content')).not.toBeInTheDocument()
  })
})
