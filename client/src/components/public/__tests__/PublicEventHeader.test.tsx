import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PublicEventHeader } from '../PublicEventHeader'

describe('PublicEventHeader', () => {
  describe('Status banner rendering', () => {
    it('renders status banner when provided', () => {
      render(
        <PublicEventHeader
          statusBanner={<span data-testid="status-badge">Inscriptions closes</span>}
        />
      )

      expect(screen.getByTestId('status-badge')).toBeInTheDocument()
      expect(screen.getByText('Inscriptions closes')).toBeInTheDocument()
    })

    it('renders without status banner when not provided', () => {
      render(
        <PublicEventHeader
          eventDescription="Description"
        />
      )

      expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument()
    })
  })

  describe('Description', () => {
    it('renders description when provided', () => {
      render(
        <PublicEventHeader
          eventDescription="This is a great event"
        />
      )

      expect(screen.getByText('This is a great event')).toBeInTheDocument()
    })

    it('does not render description when not provided', () => {
      render(
        <PublicEventHeader
          statusBanner={<span>Status</span>}
        />
      )

      expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
    })
  })

  describe('Empty state', () => {
    it('returns null when neither statusBanner nor description provided', () => {
      const { container } = render(<PublicEventHeader />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Layout', () => {
    it('applies compact spacing (mb-4)', () => {
      const { container } = render(
        <PublicEventHeader
          statusBanner={<span>Status</span>}
          eventDescription="Description"
        />
      )

      expect(container.firstChild).toHaveClass('mb-4')
    })

    it('accepts custom className', () => {
      const { container } = render(
        <PublicEventHeader
          statusBanner={<span>Status</span>}
          className="custom-class"
        />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })
})
