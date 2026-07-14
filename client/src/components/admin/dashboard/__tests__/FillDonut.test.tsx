import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FillDonut } from '../FillDonut'

describe('FillDonut', () => {
  it('calcule le pourcentage rempli au centre', () => {
    render(<FillDonut filled={6} vacant={4} />)
    expect(screen.getByText('60 %')).toBeInTheDocument()
  })

  it('gère filled=0 et vacant=0 sans division par zéro', () => {
    render(<FillDonut filled={0} vacant={0} />)
    expect(screen.getByText('0 %')).toBeInTheDocument()
  })

  it('affiche la légende remplis / vacants', () => {
    render(<FillDonut filled={6} vacant={4} />)
    expect(screen.getByText('Remplis (6)')).toBeInTheDocument()
    expect(screen.getByText('Vacants (4)')).toBeInTheDocument()
  })

  it('propage data-testid', () => {
    render(<FillDonut filled={1} vacant={1} data-testid="donut" />)
    expect(screen.getByTestId('donut')).toBeInTheDocument()
  })
})
