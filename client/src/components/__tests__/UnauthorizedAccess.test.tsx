import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { UnauthorizedAccess } from '../UnauthorizedAccess'

describe('UnauthorizedAccess', () => {
  it('affiche le titre "Accès non autorisé"', () => {
    render(<UnauthorizedAccess />)
    expect(screen.getByText('Accès non autorisé')).toBeInTheDocument()
  })

  it('affiche le message générique sans nom d\'événement', () => {
    render(<UnauthorizedAccess />)
    expect(screen.getByText(/Vous n'êtes pas autorisé à accéder à cet événement/)).toBeInTheDocument()
  })

  it('affiche le nom de l\'événement si fourni', () => {
    render(<UnauthorizedAccess eventName="Fête de l'école" />)
    expect(screen.getByText(/Fête de l'école/)).toBeInTheDocument()
  })

  it('affiche le message de contact administrateur', () => {
    render(<UnauthorizedAccess />)
    expect(screen.getByText(/Contactez l'administrateur/)).toBeInTheDocument()
  })

  it('affiche l\'icône de cadenas', () => {
    const { container } = render(<UnauthorizedAccess />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('a les classes de style appropriées', () => {
    const { container } = render(<UnauthorizedAccess />)
    const card = container.querySelector('.border-orange-200')
    expect(card).toBeInTheDocument()
  })
})
