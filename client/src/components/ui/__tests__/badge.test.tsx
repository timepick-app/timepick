import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from '../badge'
import type { BadgeVariant } from '../badge'

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders with default variant and sm size by default', () => {
    render(<Badge>Default</Badge>)
    const badge = screen.getByText('Default')
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800')
    expect(badge).toHaveClass('px-2', 'py-0.5', 'text-xs')
  })

  describe('variants', () => {
    const variantCases: [string, string[]][] = [
      ['default', ['bg-gray-100', 'text-gray-800']],
      ['success', ['bg-green-100', 'text-green-800']],
      ['warning', ['bg-yellow-100', 'text-yellow-800']],
      ['error', ['bg-red-100', 'text-red-800']],
      ['draft', ['bg-orange-100', 'text-orange-800']],
      ['info', ['bg-blue-100', 'text-blue-800']],
      ['destructive', ['bg-red-50', 'text-red-700', 'border', 'border-red-200']],
    ]

    it.each(variantCases)('variant="%s" applies correct classes', (variant, expectedClasses) => {
      render(<Badge variant={variant as BadgeVariant}>{variant}</Badge>)
      const badge = screen.getByText(variant)
      for (const cls of expectedClasses) {
        expect(badge.className).toContain(cls)
      }
    })
  })

  describe('sizes', () => {
    it('size="sm" applies small classes', () => {
      render(<Badge size="sm">Small</Badge>)
      const badge = screen.getByText('Small')
      expect(badge).toHaveClass('px-2', 'py-0.5', 'text-xs')
    })

    it('size="md" applies medium classes', () => {
      render(<Badge size="md">Medium</Badge>)
      const badge = screen.getByText('Medium')
      expect(badge).toHaveClass('px-2.5', 'py-0.5', 'text-sm')
    })
  })

  describe('icon', () => {
    it('renders icon before text when provided', () => {
      render(
        <Badge icon={<span data-testid="icon">*</span>}>With Icon</Badge>
      )
      expect(screen.getByTestId('icon')).toBeInTheDocument()
      const badge = screen.getByText('With Icon').closest('span')!
      expect(badge.className).toContain('gap-1.5')
    })

    it('does not add gap when no icon is provided', () => {
      render(<Badge>No Icon</Badge>)
      const badge = screen.getByText('No Icon')
      expect(badge.className).not.toContain('gap-1.5')
    })
  })

  it('merges custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>)
    const badge = screen.getByText('Custom')
    expect(badge).toHaveClass('custom-class')
  })

  it('forwards arbitrary HTML attributes to the rendered span', () => {
    render(
      <Badge data-testid="my-badge" aria-label="Status indicator" title="Tooltip">
        Forward
      </Badge>
    )
    const badge = screen.getByTestId('my-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('aria-label', 'Status indicator')
    expect(badge).toHaveAttribute('title', 'Tooltip')
  })
})
