import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OrganizationHome } from '../OrganizationHome'
import type { OrganizationSettings } from '@/services/organization.service'

const FULL_IDENTITY: OrganizationSettings = {
  name: 'Chorale du Marais',
  logo: 'https://cdn.exemple.org/uploads/organization/logo.webp',
  description: 'Répétitions hebdomadaires, ouvertes à tous',
  homepageFacade: true,
}

function renderFacade(overrides: Partial<OrganizationSettings> = {}) {
  return render(
    <MemoryRouter>
      <OrganizationHome organization={{ ...FULL_IDENTITY, ...overrides }} />
    </MemoryRouter>,
  )
}

describe('OrganizationHome — façade de la racine (A1)', () => {
  it("affiche le nom en titre de page, la description et le logo de l'organisation", () => {
    renderFacade()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chorale du Marais')
    expect(screen.getByText('Répétitions hebdomadaires, ouvertes à tous')).toBeInTheDocument()
    expect(screen.getByTestId('organization-logo')).toHaveAttribute('src', FULL_IDENTITY.logo)
  })

  it('propose « Se connecter » vers /login', () => {
    renderFacade()

    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login')
  })

  it("titre le document avec le nom de l'organisation", () => {
    renderFacade()

    expect(document.title).toBe('Chorale du Marais - TimePick')
  })

  it('omet le logo quand il est absent, sans casser le reste de la façade', () => {
    renderFacade({ logo: '' })

    expect(screen.queryByTestId('organization-logo')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chorale du Marais')
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument()
  })

  it('omet la description quand elle est absente', () => {
    renderFacade({ description: '' })

    expect(screen.queryByText('Répétitions hebdomadaires, ouvertes à tous')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chorale du Marais')
  })

  it("retire l'image si son URL est cassée (pas d'icône image brisée)", () => {
    renderFacade()

    fireEvent.error(screen.getByTestId('organization-logo'))

    expect(screen.queryByTestId('organization-logo')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chorale du Marais')
  })

  it("ré-affiche le logo quand une nouvelle URL remplace celle en erreur", () => {
    const { rerender } = renderFacade({ logo: 'https://cdn.exemple.org/old.webp' })

    fireEvent.error(screen.getByTestId('organization-logo'))
    expect(screen.queryByTestId('organization-logo')).toBeNull()

    // L'admin téléverse un nouveau logo → nouvelle URL → l'erreur mémorisée
    // ne s'applique qu'à l'ancienne URL, l'image doit revenir sans rechargement.
    rerender(
      <MemoryRouter>
        <OrganizationHome organization={{ ...FULL_IDENTITY, logo: 'https://cdn.exemple.org/new.webp' }} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('organization-logo')).toHaveAttribute(
      'src',
      'https://cdn.exemple.org/new.webp',
    )
  })

  it('marque le logo comme décoratif (nom déjà porté par le <h1>)', () => {
    renderFacade()

    // alt="" ⇒ retiré de l'arbre d'accessibilité : pas de doublon à l'oral.
    expect(screen.getByTestId('organization-logo')).toHaveAttribute('alt', '')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
