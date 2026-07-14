import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlotFiltersPanel } from '../SlotFiltersPanel'
import type { SlotFilters } from '../../../hooks/useFilterParams'

// Mock data
const defaultFilters: SlotFilters = {
  timeOfDay: [],
  availability: 'all',
}

describe('SlotFiltersPanel', () => {
  const mockOnFiltersChange = vi.fn()
  const mockOnReset = vi.fn()

  beforeEach(() => {
    mockOnFiltersChange.mockClear()
    mockOnReset.mockClear()
  })

  describe('AC1: Filter panel accessible from calendar view', () => {
    it('should render a filter button', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
        />
      )

      expect(screen.getByRole('button', { name: /filtres/i })).toBeInTheDocument()
    })

    it('should have correct aria attributes for dropdown trigger', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
        />
      )

      const filterButton = screen.getByRole('button', { name: /filtres/i })
      expect(filterButton).toHaveAttribute('aria-haspopup', 'menu')
    })
  })

  describe('AC6: Reset filters button', () => {
    it('should show reset button when filters are active', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
          hasActiveFilters={true}
        />
      )

      // This button is outside the dropdown, always visible when filters are active
      // The button has aria-label="Réinitialiser les filtres" and text "Effacer les filtres"
      const resetButton = screen.getByRole('button', { name: /réinitialiser les filtres/i })
      expect(resetButton).toBeInTheDocument()
    })

    it('should not show reset button when no filters are active', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
          hasActiveFilters={false}
        />
      )

      // Reset button should NOT be present when no filters active
      expect(screen.queryByRole('button', { name: /réinitialiser les filtres/i })).not.toBeInTheDocument()
    })

    it('should call onReset when reset button is clicked', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
          hasActiveFilters={true}
        />
      )

      const resetButton = screen.getByRole('button', { name: /réinitialiser les filtres/i })
      resetButton.click()

      expect(mockOnReset).toHaveBeenCalledOnce()
    })
  })

  describe('AC7: Display filtered count vs total', () => {
    it('should show filtered count vs total when filters are active', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={12}
          hasActiveFilters={true}
        />
      )

      expect(screen.getByText('5 / 12')).toBeInTheDocument()
    })

    it('should not show filtered count when no filters are active', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={12}
          hasActiveFilters={false}
        />
      )

      expect(screen.queryByText('5 / 12')).not.toBeInTheDocument()
    })
  })

  describe('Active filter count badge', () => {
    it('should show active filter count badge on filter button when filters are active', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={12}
          hasActiveFilters={true}
          activeFilterCount={2}
        />
      )

      // Badge showing count of active filters on the filter button
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('should not show badge count when no filters are active', () => {
      render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={12}
          hasActiveFilters={false}
          activeFilterCount={0}
        />
      )

      // Badge should not appear when count is 0
      // Since Badge is inside the button, we need to check the button's contents
      screen.getByRole('button', { name: /filtres/i })
      // There should be only the Filter icon and "Filtres" text, no badge with number
      const badge = screen.queryByText('0')
      expect(badge).not.toBeInTheDocument()
    })
  })

  describe('Component rendering', () => {
    it('should render with all required props', () => {
      const { container } = render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
          hasActiveFilters={false}
          activeFilterCount={0}
        />
      )

      expect(container.firstChild).toBeInTheDocument()
    })

    it('should accept optional className prop', () => {
      const { container } = render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
          className="custom-class"
        />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('AC5: Mes réservations toggle in dropdown', () => {
    const mockOnShowMyReservationsChange = vi.fn()

    beforeEach(() => {
      mockOnShowMyReservationsChange.mockClear()
    })

    it('should render component with my reservations props', () => {
      // This test verifies the component accepts the new props without crashing
      const { container } = render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
          showMyReservations={false}
          onShowMyReservationsChange={mockOnShowMyReservationsChange}
          myReservationsCount={3}
        />
      )

      expect(container.firstChild).toBeInTheDocument()
      // Filter button should be rendered
      expect(screen.getByRole('button', { name: /filtres/i })).toBeInTheDocument()
    })

    it('should render without my reservations section when props are not provided', () => {
      // This test verifies backward compatibility
      const { container } = render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
        />
      )

      expect(container.firstChild).toBeInTheDocument()
    })

    it('should accept showMyReservations=true prop', () => {
      // This test verifies the component accepts showMyReservations=true
      const { container } = render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
          showMyReservations={true}
          onShowMyReservationsChange={mockOnShowMyReservationsChange}
          myReservationsCount={3}
        />
      )

      expect(container.firstChild).toBeInTheDocument()
    })

    it('should accept myReservationsCount prop with different values', () => {
      // This test verifies the component accepts different count values
      const { container } = render(
        <SlotFiltersPanel
          filters={defaultFilters}
          onFiltersChange={mockOnFiltersChange}
          onReset={mockOnReset}
          filteredCount={5}
          totalCount={10}
          showMyReservations={false}
          onShowMyReservationsChange={mockOnShowMyReservationsChange}
          myReservationsCount={0}
        />
      )

      expect(container.firstChild).toBeInTheDocument()
    })
  })
})
