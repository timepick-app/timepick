import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeleteConfirmModal } from '../DeleteConfirmModal'
import type { User } from '../../types/user'

const mockUser: User = {
  id: '123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'user',
  createdAt: '2026-01-01T00:00:00Z',
  hasMemberAccess: false,
  bookingCount: 3
}

const mockUserNoBookings: User = {
  ...mockUser,
  bookingCount: 0
}

describe('DeleteConfirmModal', () => {
  const mockOnConfirm = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders confirmation title', () => {
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )
    expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument()
  })

  it('displays user email', () => {
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('shows booking count warning when user has bookings', () => {
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )
    expect(screen.getByText(/3 réservation\(s\) qui seront également supprimées/)).toBeInTheDocument()
  })

  it('does not show booking warning when user has no bookings', () => {
    render(
      <DeleteConfirmModal user={mockUserNoBookings} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )
    expect(screen.queryByText(/réservation\(s\) qui seront également supprimées/)).not.toBeInTheDocument()
  })

  it('shows irreversibility warning', () => {
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )
    expect(screen.getByText('Cette action est irréversible.')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button clicked', () => {
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )
    fireEvent.click(screen.getByText('Fermer'))
    expect(mockOnCancel).toHaveBeenCalled()
  })

  it('calls onConfirm when delete button clicked', async () => {
    mockOnConfirm.mockResolvedValue(undefined)
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )
    fireEvent.click(screen.getByText('Supprimer'))

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalled()
    })
  })

  it('shows loading state during deletion', async () => {
    mockOnConfirm.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )

    fireEvent.click(screen.getByText('Supprimer'))
    expect(await screen.findByText('Suppression...')).toBeInTheDocument()
  })

  it('disables buttons during loading', async () => {
    mockOnConfirm.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )

    fireEvent.click(screen.getByText('Supprimer'))

    await waitFor(() => {
      expect(screen.getByText('Fermer')).toBeDisabled()
    })
  })

  it('resets loading and keeps modal open when deletion fails', async () => {
    mockOnConfirm.mockRejectedValue(new Error('Deletion failed'))
    render(
      <DeleteConfirmModal user={mockUser} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )

    fireEvent.click(screen.getByText('Supprimer'))

    await waitFor(() => {
      // Loading label disappears once finally block runs
      expect(screen.getByText('Supprimer')).toBeInTheDocument()
    })
    // Modal stays open: onCancel must NOT have been invoked
    expect(mockOnCancel).not.toHaveBeenCalled()
  })

  it('respects external isLoading prop', () => {
    render(
      <DeleteConfirmModal
        user={mockUser}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
        isLoading={true}
      />
    )

    expect(screen.getByText('Suppression...')).toBeInTheDocument()
    expect(screen.getByText('Fermer')).toBeDisabled()
  })

  it('handles users with null name', () => {
    const userWithoutName: User = {
      ...mockUser,
      firstName: null,
      lastName: null,
      bookingCount: 0
    }

    render(
      <DeleteConfirmModal user={userWithoutName} onConfirm={mockOnConfirm} onCancel={mockOnCancel} />
    )

    // Should still display email
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })
})

