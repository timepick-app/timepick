import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PollingIndicator } from '../PollingIndicator'

describe('PollingIndicator', () => {
  it('ne s\'affiche pas quand isRefetching est false', () => {
    const { container } = render(
      <PollingIndicator isRefetching={false} />
    )

    expect(container.firstChild).toBe(null)
  })

  it('s\'affiche quand isRefetching est true', () => {
    render(<PollingIndicator isRefetching={true} />)

    expect(screen.getByText('Mise à jour...')).toBeInTheDocument()
  })

  it('contient un spinner animé', () => {
    const { container } = render(<PollingIndicator isRefetching={true} />)

    // Vérifier la présence du spinner (svg avec animate-spin)
    const spinner = container.querySelector('svg.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('a les classes CSS appropriées', () => {
    const { container } = render(
      <PollingIndicator isRefetching={true} className="custom-class" />
    )

    const badge = container.querySelector('.bg-blue-50')
    expect(badge).toBeInTheDocument()

    const customElement = container.querySelector('.custom-class')
    expect(customElement).toBeInTheDocument()
  })

  it('a un attribut aria-label pour l\'accessibilité', () => {
    const { container } = render(<PollingIndicator isRefetching={true} />)

    const badge = container.querySelector('[aria-label="Mise à jour des données en cours"]')
    expect(badge).toBeInTheDocument()
  })
})
