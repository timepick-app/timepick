import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock react-i18next BEFORE importing the component
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'eventPublishBanner.draft': 'Brouillon',
        'eventPublishBanner.published': 'Publié'
      }
      return translations[key] || key
    }
  })
}))

// Import component AFTER mocking
import { EventStatusBadge } from '../EventStatusBadge'

describe('EventStatusBadge', () => {
  it('affiche « Publié » avec le variant success quand isPublished est vrai', () => {
    const { container } = render(<EventStatusBadge isPublished={true} />)

    expect(screen.getByText('Publié')).toBeInTheDocument()

    // Variant success (apparence soft) : fond vert clair + texte vert
    const badge = screen.getByText('Publié').closest('span')
    expect(badge?.className).toMatch(/bg-green-50/)
    expect(badge?.className).toMatch(/text-green-700/)

    // Point coloré en tête (bg-current)
    expect(container.querySelector('.bg-current')).toBeInTheDocument()
  })

  it('affiche « Brouillon » avec le variant draft quand isPublished est faux', () => {
    const { container } = render(<EventStatusBadge isPublished={false} />)

    expect(screen.getByText('Brouillon')).toBeInTheDocument()

    // Variant draft (apparence soft) : fond orange clair + texte orange
    const badge = screen.getByText('Brouillon').closest('span')
    expect(badge?.className).toMatch(/bg-orange-50/)
    expect(badge?.className).toMatch(/text-orange-700/)

    expect(container.querySelector('.bg-current')).toBeInTheDocument()
  })
})
