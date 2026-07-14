import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Home } from 'lucide-react'
import { AppShell } from '../AppShell'
import type { NavItem } from '../SidebarContent'

// --- Mocks UI (même approche que AdminLayout.test.tsx) -----------------------

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

// SidebarContent est testée séparément. Le mock expose les props reçues pour
// vérifier le câblage effectué par AppShell (items/header/footer/onNavigate).
vi.mock('../SidebarContent', () => ({
  SidebarContent: ({
    items,
    header,
    footer,
    onNavigate,
  }: {
    items?: unknown[]
    header?: ReactNode
    footer?: ReactNode
    onNavigate?: () => void
  }) => (
    <div
      data-testid="sidebar"
      data-has-nav={onNavigate ? 'true' : 'false'}
      data-item-count={items?.length ?? 0}
    >
      {header}
      {footer}
      <button data-testid="nav-trigger" onClick={onNavigate}>
        nav
      </button>
    </div>
  ),
}))

const sampleItems: NavItem[] = [
  { id: 'n1', label: 'Accueil', href: '/home', icon: Home },
]

describe('AppShell', () => {
  it('rend le contenu de page dans <main>', () => {
    render(
      <AppShell>
        <div data-testid="page-content">Page</div>
      </AppShell>,
    )
    expect(screen.getByTestId('page-content')).toBeInTheDocument()
  })

  it("rend le bouton menu mobile avec aria-label « Ouvrir le menu »", () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    )
    expect(screen.getByLabelText('Ouvrir le menu')).toBeInTheDocument()
  })

  it('rend SidebarContent deux fois (tiroir mobile + aside desktop)', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    )
    expect(screen.getAllByTestId('sidebar')).toHaveLength(2)
  })

  it('câble onNavigate sur la sidebar mobile (fermeture tiroir) mais pas sur la desktop', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    )
    const sidebars = screen.getAllByTestId('sidebar')
    // Ordre DOM : sidebars[0] = mobile (SheetContent), sidebars[1] = desktop (aside).
    expect(sidebars[0]).toHaveAttribute('data-has-nav', 'true')
    expect(sidebars[1]).toHaveAttribute('data-has-nav', 'false')
  })

  it('rend pageTitle en <h1> sur desktop et mobile (exclusifs par breakpoint)', () => {
    render(
      <AppShell pageTitle="Tableau de bord">
        <div />
      </AppShell>,
    )
    // Deux <h1> dans le DOM (desktop + mobile) ; masqués alternativement par CSS
    // au runtime (hidden / lg:hidden) → un seul visible par viewport pour le lecteur d'écran.
    const titres = screen.getAllByRole('heading', { level: 1, name: 'Tableau de bord' })
    expect(titres).toHaveLength(2)
  })

  it('transmet items/header/footer à SidebarContent (renderer paramétrable, AC2)', () => {
    render(
      <AppShell
        items={sampleItems}
        header={<span data-testid="custom-header">MH</span>}
        footer={<span data-testid="custom-footer">MF</span>}
      >
        <div />
      </AppShell>,
    )
    const sidebars = screen.getAllByTestId('sidebar')
    expect(sidebars[0]).toHaveAttribute('data-item-count', '1')
    expect(sidebars[1]).toHaveAttribute('data-item-count', '1')
    expect(screen.getAllByTestId('custom-header')).toHaveLength(2)
    expect(screen.getAllByTestId('custom-footer')).toHaveLength(2)
  })

  it('ferme le tiroir mobile et appelle onMobileNavigate après une navigation', () => {
    const onMobileNavigate = vi.fn()
    render(
      <AppShell onMobileNavigate={onMobileNavigate}>
        <div />
      </AppShell>,
    )
    fireEvent.click(screen.getAllByTestId('nav-trigger')[0])
    expect(onMobileNavigate).toHaveBeenCalledTimes(1)
  })

  it("rend le libellé TimePick dans l'en-tête mobile", () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    )
    expect(screen.getByText('TimePick')).toBeInTheDocument()
  })

  it('expose AppShellProps et NavItem/NavSubItem comme interface publique stable', () => {
    // Garde-fou de non-régression d'API : AppShell doit accepter la forme d'items
    // documentée (NavItem avec children NavSubItem optionnel).
    const itemsWithChildren: NavItem[] = [
      {
        id: 'parent',
        label: 'Parent',
        href: '/parent',
        icon: Home,
        children: [{ id: 'child', label: 'Enfant', href: '/parent/child' }],
      },
    ]
    render(
      <AppShell items={itemsWithChildren}>
        <div />
      </AppShell>,
    )
    expect(screen.getAllByTestId('sidebar')[0]).toHaveAttribute('data-item-count', '1')
  })
})
