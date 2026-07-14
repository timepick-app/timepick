import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EventNotFound } from '../EventNotFound'
import { BrowserRouter } from 'react-router-dom'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('EventNotFound', () => {
  it('affiche le titre "Événement non trouvé"', () => {
    render(<EventNotFound />, { wrapper })
    expect(screen.getByText('Événement non trouvé')).toBeInTheDocument()
  })

  it('affiche le message explicatif', () => {
    render(<EventNotFound />, { wrapper })
    // commit c845459 — split the message into not-found vs not-published cases.
    // Default render (no reason prop) shows the not-found copy.
    expect(screen.getByText(/Cet événement n'existe pas\. Vérifiez le lien et réessayez\./)).toBeInTheDocument()
  })

  it('affiche le bouton de retour à l\'accueil', () => {
    render(<EventNotFound />, { wrapper })
    const button = screen.getByRole('link', { name: /retour/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('href', '/booking')
  })

  it('affiche l\'icône de calendrier', () => {
    const { container } = render(<EventNotFound />, { wrapper })
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
