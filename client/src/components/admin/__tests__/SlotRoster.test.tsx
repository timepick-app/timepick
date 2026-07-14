import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlotRoster } from '../SlotRoster'
import type { Volunteer } from '@/types/slot'

describe('SlotRoster', () => {
  it('rend une ligne par inscrit, avec nom et initiales', () => {
    const volunteers: Volunteer[] = [
      { id: 'u1', name: 'Alice Bernard' },
      { id: 'u2', name: 'Léa Martin' },
    ]
    render(<SlotRoster volunteers={volunteers} currentBookings={2} capacity={5} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Alice Bernard')).toBeInTheDocument()
    expect(screen.getByText('Léa Martin')).toBeInTheDocument()
    // Initiales dérivées du nom complet concaténé (Prénom + Nom).
    expect(screen.getByText('AB')).toBeInTheDocument()
    expect(screen.getByText('LM')).toBeInTheDocument()
    // En-tête : décompte autoritaire, pas « Complet » tant qu'il reste des places.
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument()
    expect(screen.queryByText(/Complet/)).not.toBeInTheDocument()
  })

  it('affiche un état vide explicite quand volunteers est null', () => {
    render(<SlotRoster volunteers={null} currentBookings={0} capacity={5} />)

    expect(screen.getByText(/Aucun inscrit pour l'instant/)).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(/0 \/ 5/)).toBeInTheDocument()
  })

  it('affiche un état vide quand le tableau est vide', () => {
    render(<SlotRoster volunteers={[]} currentBookings={0} capacity={3} />)
    expect(screen.getByText(/Aucun inscrit pour l'instant/)).toBeInTheDocument()
  })

  it('rend un repli lisible pour un inscrit sans nom (jamais « null »)', () => {
    const volunteers: Volunteer[] = [{ id: 'u3', name: null }]
    render(<SlotRoster volunteers={volunteers} currentBookings={1} capacity={3} />)

    expect(screen.getByText('Sans nom renseigné')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('null')).not.toBeInTheDocument()
  })

  it('signale l\'état complet via le ratio et un libellé accessible', () => {
    const volunteers: Volunteer[] = [
      { id: 'u1', name: 'Alice Bernard' },
      { id: 'u2', name: 'Léa Martin' },
      { id: 'u3', name: 'Marc Petit' },
    ]
    render(<SlotRoster volunteers={volunteers} currentBookings={3} capacity={3} />)

    const ratio = screen.getByText(/3 \/ 3/)
    expect(ratio).toBeInTheDocument()
    expect(ratio.getAttribute('aria-label')).toMatch(/complet/i)
  })

  it('rend le ratio en surcapacité (réservations > capacité)', () => {
    const volunteers: Volunteer[] = [
      { id: 'u1', name: 'Alice Bernard' },
      { id: 'u2', name: 'Léa Martin' },
    ]
    render(<SlotRoster volunteers={volunteers} currentBookings={5} capacity={3} />)
    expect(screen.getByText(/5 \/ 3/)).toBeInTheDocument()
  })

  it('ne prétend pas « aucun inscrit » quand le décompte est non nul (divergence)', () => {
    render(<SlotRoster volunteers={null} currentBookings={3} capacity={40} />)

    expect(screen.getByText(/3 inscrit\(s\) — détail indisponible/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun inscrit/)).not.toBeInTheDocument()
  })

  it('signale une liste partielle quand des noms manquent', () => {
    const volunteers: Volunteer[] = [
      { id: 'u1', name: 'Alice Bernard' },
      { id: 'u2', name: 'Léa Martin' },
    ]
    render(<SlotRoster volunteers={volunteers} currentBookings={5} capacity={40} />)

    expect(screen.getByText(/Liste partielle : 2\/5 nom\(s\) affiché\(s\)/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })
})
