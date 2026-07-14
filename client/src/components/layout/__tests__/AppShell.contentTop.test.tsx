import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AppShell } from '../AppShell'

// Couverture relocalisée hors `AppShell.test.tsx` (fichier protégé NFR2, Story 1.3) :
// le slot `contentTop` et la garde « pas de <h1> sans pageTitle » sont des ajouts
// AppShell de la Story 1.3 (consommés par MemberLayout via D12 + pages squelettes).
// Même approche de mocks UI que `AppShell.test.tsx`.

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

// SidebarContent est testée séparément ; mock neutre suffisant ici.
vi.mock('../SidebarContent', () => ({
  SidebarContent: () => <div data-testid="sidebar" />,
}))

describe('AppShell — slot contentTop + garde pageTitle (Story 1.3)', () => {
  it('rend contentTop en tête de <main> (au-dessus du titre)', () => {
    render(
      <AppShell pageTitle="Tableau de bord" contentTop={<div data-testid="banner">Bannière</div>}>
        <div />
      </AppShell>,
    )
    expect(screen.getByTestId('banner')).toBeInTheDocument()
  })

  it("n'affiche aucun <h1> de titre quand pageTitle est absent", () => {
    render(
      <AppShell>
        <div data-testid="page-content">Page</div>
      </AppShell>,
    )
    // La garde {pageTitle && …} évite un <h1> vide (WCAG titre non-vide) et le
    // header fantôme (mb-6) pour les appelants sans titre.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByTestId('page-content')).toBeInTheDocument()
  })
})
