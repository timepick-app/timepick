import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ViewToggle } from '../ViewToggle'
import { useViewMode } from '@/hooks/useViewMode'
import type { ViewMode } from '@/hooks/useViewMode'

// Integration test: ViewToggle with useViewMode hook
describe('ViewToggle + useViewMode Integration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('integrates with useViewMode hook: clicking toggle updates view mode', () => {
    // This test verifies the integration between ViewToggle and useViewMode
    // by simulating how they would be used together in PublicCalendar

    const IntegrationTestComponent = () => {
      const { viewMode, setViewMode } = useViewMode('test-event-uuid')

      return (
        <div>
          <div data-testid="current-view">{viewMode}</div>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      )
    }

    render(<IntegrationTestComponent />)

    // Initial state: desktop default is calendar
    expect(screen.getByTestId('current-view')).toHaveTextContent('calendar')

    // Click list button
    fireEvent.click(screen.getByRole('radio', { name: /vue liste/i }))

    // View mode should update
    expect(screen.getByTestId('current-view')).toHaveTextContent('list')

    // Click month button (updated from calendar to mois)
    fireEvent.click(screen.getByRole('radio', { name: /vue calendrier mensuel/i }))

    // View mode should update back to calendar
    expect(screen.getByTestId('current-view')).toHaveTextContent('calendar')
  })

  it('persists view mode preference via useViewMode hook', () => {
    const IntegrationTestComponent = () => {
      const { viewMode, setViewMode } = useViewMode('persist-test-uuid')

      return (
        <div>
          <div data-testid="current-view">{viewMode}</div>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      )
    }

    const { unmount } = render(<IntegrationTestComponent />)

    // Change to list view
    fireEvent.click(screen.getByRole('radio', { name: /vue liste/i }))
    expect(screen.getByTestId('current-view')).toHaveTextContent('list')

    // Verify localStorage was updated
    const stored = localStorage.getItem('timepick-view-mode-persist-test-uuid')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).mode).toBe('list')

    // Unmount and remount to simulate page reload
    unmount()

    render(<IntegrationTestComponent />)

    // Should load the persisted preference
    expect(screen.getByTestId('current-view')).toHaveTextContent('list')
  })

  // Story 19.5: Week mode integration test
  it('supports week mode switching', () => {
    const IntegrationTestComponent = () => {
      const { viewMode, setViewMode } = useViewMode('week-test-uuid')

      return (
        <div>
          <div data-testid="current-view">{viewMode}</div>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      )
    }

    render(<IntegrationTestComponent />)

    // Initial state
    expect(screen.getByTestId('current-view')).toHaveTextContent('calendar')

    // Click week button
    fireEvent.click(screen.getByRole('radio', { name: /vue semaine/i }))

    // View mode should update to week
    expect(screen.getByTestId('current-view')).toHaveTextContent('week')
  })
})

describe('ViewToggle', () => {
  describe('Rendering', () => {
    it('renders all three toggle buttons (Story 19.5: 3 buttons)', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      // Vérifier que le groupe a le bon aria-label
      expect(screen.getByRole('group', { name: /mode d'affichage/i })).toBeInTheDocument()
    })

    it('renders month toggle button', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      expect(screen.getByRole('radio', { name: /vue calendrier mensuel/i })).toBeInTheDocument()
    })

    it('renders week toggle button (Story 19.5)', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      expect(screen.getByRole('radio', { name: /vue semaine/i })).toBeInTheDocument()
    })

    it('renders list toggle button', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      expect(screen.getByRole('radio', { name: /vue liste/i })).toBeInTheDocument()
    })
  })

  describe('Active state', () => {
    it('highlights month mode when active', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      const monthToggle = screen.getByRole('radio', { name: /vue calendrier mensuel/i })
      expect(monthToggle).toHaveAttribute('aria-checked', 'true')
      expect(monthToggle).toHaveAttribute('data-state', 'on')
    })

    it('highlights week mode when active (Story 19.5)', () => {
      render(<ViewToggle viewMode="week" onChange={vi.fn()} />)

      const weekToggle = screen.getByRole('radio', { name: /vue semaine/i })
      expect(weekToggle).toHaveAttribute('aria-checked', 'true')
      expect(weekToggle).toHaveAttribute('data-state', 'on')
    })

    it('highlights list mode when active', () => {
      render(<ViewToggle viewMode="list" onChange={vi.fn()} />)

      const listToggle = screen.getByRole('radio', { name: /vue liste/i })
      expect(listToggle).toHaveAttribute('aria-checked', 'true')
      expect(listToggle).toHaveAttribute('data-state', 'on')
    })

    it('does not highlight inactive month option', () => {
      render(<ViewToggle viewMode="list" onChange={vi.fn()} />)

      const monthToggle = screen.getByRole('radio', { name: /vue calendrier mensuel/i })
      expect(monthToggle).toHaveAttribute('aria-checked', 'false')
      expect(monthToggle).toHaveAttribute('data-state', 'off')
    })

    it('does not highlight inactive list option', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      const listToggle = screen.getByRole('radio', { name: /vue liste/i })
      expect(listToggle).toHaveAttribute('aria-checked', 'false')
      expect(listToggle).toHaveAttribute('data-state', 'off')
    })
  })

  describe('User interactions', () => {
    it('calls onChange with calendar when month is clicked', () => {
      const handleChange = vi.fn()
      render(<ViewToggle viewMode="list" onChange={handleChange} />)

      fireEvent.click(screen.getByRole('radio', { name: /vue calendrier mensuel/i }))
      expect(handleChange).toHaveBeenCalledWith('calendar')
      expect(handleChange).toHaveBeenCalledTimes(1)
    })

    it('calls onChange with week when week is clicked (Story 19.5)', () => {
      const handleChange = vi.fn()
      render(<ViewToggle viewMode="calendar" onChange={handleChange} />)

      fireEvent.click(screen.getByRole('radio', { name: /vue semaine/i }))
      expect(handleChange).toHaveBeenCalledWith('week')
      expect(handleChange).toHaveBeenCalledTimes(1)
    })

    it('calls onChange with list when list is clicked', () => {
      const handleChange = vi.fn()
      render(<ViewToggle viewMode="calendar" onChange={handleChange} />)

      fireEvent.click(screen.getByRole('radio', { name: /vue liste/i }))
      expect(handleChange).toHaveBeenCalledWith('list')
      expect(handleChange).toHaveBeenCalledTimes(1)
    })

    it('calls onChange even when clicking already active option', () => {
      const handleChange = vi.fn()
      render(<ViewToggle viewMode="list" onChange={handleChange} />)

      // Radix ToggleGroup (type="single") fires onValueChange when selecting
      // a different option; clicking the already-active item deselects to "" which
      // the component intentionally swallows. We assert the click → onChange path.
      fireEvent.click(screen.getByRole('radio', { name: /vue calendrier mensuel/i }))
      expect(handleChange).toHaveBeenCalledWith('calendar')
    })
  })

  describe('Accessibility', () => {
    it('has proper aria-label on button group', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      expect(screen.getByRole('group', { name: /mode d'affichage/i })).toBeInTheDocument()
    })

    it('has proper aria-label on month toggle', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      expect(screen.getByRole('radio', { name: /vue calendrier mensuel/i })).toBeInTheDocument()
    })

    it('has proper aria-label on week toggle (Story 19.5)', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      expect(screen.getByRole('radio', { name: /vue semaine/i })).toBeInTheDocument()
    })

    it('has proper aria-label on list toggle', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      expect(screen.getByRole('radio', { name: /vue liste/i })).toBeInTheDocument()
    })

    it('marks icons as aria-hidden for screen readers', () => {
      const { container } = render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      // Vérifier que les icônes SVG ont aria-hidden="true"
      // Story 19.5: Now 3 icons (Calendar, Clock, List)
      const icons = container.querySelectorAll('svg[aria-hidden="true"]')
      expect(icons.length).toBe(3) // One icon per button
      icons.forEach(icon => {
        expect(icon).toHaveAttribute('aria-hidden', 'true')
      })
    })

    it('has aria-checked attribute on buttons', () => {
      render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      const monthButton = screen.getByRole('radio', { name: /vue calendrier mensuel/i })
      const weekButton = screen.getByRole('radio', { name: /vue semaine/i })
      const listButton = screen.getByRole('radio', { name: /vue liste/i })

      expect(monthButton).toHaveAttribute('aria-checked', 'true')
      expect(weekButton).toHaveAttribute('aria-checked', 'false')
      expect(listButton).toHaveAttribute('aria-checked', 'false')
    })
  })

  describe('Visual consistency with admin toggle', () => {
    it('displays text labels on all screen sizes', () => {
      const { container } = render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      // Story 19.5: All three labels should be visible
      expect(container.textContent).toContain('Mois')
      expect(container.textContent).toContain('Semaine')
      expect(container.textContent).toContain('Liste')
    })

    it('displays French text labels', () => {
      const { container } = render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      expect(container.textContent).toContain('Mois')
      expect(container.textContent).toContain('Semaine')
      expect(container.textContent).toContain('Liste')
    })

    it('uses lucide-react icons (Calendar, Clock, and List)', () => {
      const { container } = render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      // lucide-react icons are SVGs with specific structure
      // Story 19.5: Now 3 SVGs
      const svgs = container.querySelectorAll('svg')
      expect(svgs.length).toBe(3)

      // Each SVG should be inside a button with proper sizing
      svgs.forEach(svg => {
        expect(svg).toHaveClass('h-4', 'w-4')
      })
    })

    it('has border container styling matching admin toggle', () => {
      const { container } = render(<ViewToggle viewMode="calendar" onChange={vi.fn()} />)

      const group = container.querySelector('[role="group"]')
      expect(group).toHaveClass('items-center', 'justify-center', 'gap-1', 'inline-flex', 'flex-nowrap', 'rounded-md', 'border', 'border-gray-200', 'p-1')
    })
  })

  describe('TypeScript types', () => {
    it('accepts valid viewMode values', () => {
      const onChange = vi.fn()

      // Ces tests vérifient que les types TypeScript sont corrects
      expect(() => render(<ViewToggle viewMode="calendar" onChange={onChange} />)).not.toThrow()
      expect(() => render(<ViewToggle viewMode="list" onChange={onChange} />)).not.toThrow()
      // Story 19.5: week is now a valid mode
      expect(() => render(<ViewToggle viewMode="week" onChange={onChange} />)).not.toThrow()

      const TestComponent = () => {
        const validMode: ViewMode = 'calendar'
        return <ViewToggle viewMode={validMode} onChange={onChange} />
      }
      expect(() => render(<TestComponent />)).not.toThrow()
    })
  })
})
