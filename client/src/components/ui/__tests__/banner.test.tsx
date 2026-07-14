import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Banner, BannerTitle, BannerDescription } from '@/components/ui/banner'

describe('Banner', () => {
  it('rend un élément role="alert" par défaut', () => {
    render(<Banner>contenu</Banner>)

    const banner = screen.getByRole('alert')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveTextContent('contenu')
  })

  it('accepte role="status" et supprime le role alert', () => {
    render(<Banner role="status">feedback</Banner>)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('applique les classes couleur selon le variant', () => {
    const { rerender } = render(
      <Banner data-testid="b" variant="warning">w</Banner>,
    )
    expect(screen.getByTestId('b').className).toContain('bg-amber-50')

    rerender(<Banner data-testid="b" variant="info">i</Banner>)
    expect(screen.getByTestId('b').className).toContain('bg-blue-50')

    rerender(<Banner data-testid="b" variant="success">s</Banner>)
    expect(screen.getByTestId('b').className).toContain('bg-green-50')

    rerender(<Banner data-testid="b" variant="destructive">d</Banner>)
    expect(screen.getByTestId('b').className).toContain('text-destructive')
  })

  it('applique les classes de densité par défaut (py-3, text-sm)', () => {
    render(<Banner data-testid="b" density="default">x</Banner>)

    const el = screen.getByTestId('b')
    expect(el.className).toContain('py-3')
    expect(el.className).toContain('text-sm')
  })

  it('applique les classes de densité compact (py-2, text-xs)', () => {
    render(<Banner data-testid="b" density="compact">x</Banner>)

    const el = screen.getByTestId('b')
    expect(el.className).toContain('py-2')
    expect(el.className).toContain('text-xs')
  })

  it('compose BannerTitle et BannerDescription et propage data-testid', () => {
    render(
      <Banner data-testid="banner-root">
        <BannerTitle>Titre</BannerTitle>
        <BannerDescription>Desc</BannerDescription>
      </Banner>,
    )

    expect(screen.getByTestId('banner-root')).toBeInTheDocument()
    expect(screen.getByText('Titre')).toBeInTheDocument()
    expect(screen.getByText('Desc')).toBeInTheDocument()
  })

  it("propage aria-live sur l'élément racine", () => {
    render(<Banner aria-live="polite">info</Banner>)

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
  })
})
