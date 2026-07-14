import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { KpiTile } from '../KpiTile'

const renderWithProvider = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>)

describe('KpiTile', () => {
  it("affiche le libellé, la valeur et l'indice", () => {
    renderWithProvider(<KpiTile label="Événements" value={42} hint="dont 3 publiés" />)
    expect(screen.getByText('Événements')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('dont 3 publiés')).toBeInTheDocument()
  })

  it("n'affiche pas d'indice quand hint est absent", () => {
    renderWithProvider(<KpiTile label="X" value={1} />)
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('propage les attributs HTML (data-testid)', () => {
    renderWithProvider(<KpiTile label="X" value={1} data-testid="kpi-events" />)
    expect(screen.getByTestId('kpi-events')).toBeInTheDocument()
  })

  it("affiche l'icône Info quand tooltip est fourni", () => {
    renderWithProvider(<KpiTile label="Remplissage" value="72 %" tooltip="Explication du remplissage." />)
    expect(screen.getByRole('button', { name: "Plus d'informations" })).toBeInTheDocument()
  })

  it("n'affiche pas l'icône Info quand tooltip est absent", () => {
    renderWithProvider(<KpiTile label="Remplissage" value="72 %" />)
    expect(screen.queryByRole('button', { name: "Plus d'informations" })).not.toBeInTheDocument()
  })
})
