import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RichTextContent } from '../rich-text-content'

describe('RichTextContent', () => {
  it('rend du texte en gras via <strong>', () => {
    const { container } = render(
      <RichTextContent html="<p><strong>bold</strong> <em>it</em></p>" />,
    )
    expect(container.querySelector('strong')).not.toBeNull()
    expect(container.querySelector('strong')!.textContent).toBe('bold')
  })

  it('rend du texte en italique via <em>', () => {
    const { container } = render(
      <RichTextContent html="<p><strong>bold</strong> <em>it</em></p>" />,
    )
    expect(container.querySelector('em')).not.toBeNull()
    expect(container.querySelector('em')!.textContent).toBe('it')
  })

  it('rend un lien avec href', () => {
    const { container } = render(
      <RichTextContent html='<p><a href="https://example.com">lien</a></p>' />,
    )
    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('https://example.com')
    expect(link!.textContent).toBe('lien')
  })

  it('supprime <script> injecté dans le HTML', () => {
    const { container } = render(
      <RichTextContent html='<p>hi<script>alert(1)<\/script></p>' />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('alert')
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('convertit le texte brut legacy avec \\n en <br>', () => {
    const { container } = render(<RichTextContent html={'Line1\nLine2'} />)
    // Le texte brut doit être converti par normalizeStoredDescription → <br> présent
    expect(container.innerHTML).toContain('<br>')
  })

  it("retourne null pour html='' (container vide)", () => {
    const { container } = render(<RichTextContent html="" />)
    expect(container.firstChild).toBeNull()
  })

  it('retourne null pour html={null} (container vide)', () => {
    const { container } = render(<RichTextContent html={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('retourne null pour html={undefined}', () => {
    const { container } = render(<RichTextContent />)
    expect(container.firstChild).toBeNull()
  })

  it("retourne null pour un HTML vide '<p></p>'", () => {
    const { container } = render(<RichTextContent html="<p></p>" />)
    expect(container.firstChild).toBeNull()
  })

  it('rend une frontière de paragraphe comme une ligne vide (<br><br>)', () => {
    const { container } = render(
      <RichTextContent html="<p>premier</p><p>second</p>" />,
    )
    expect(container.querySelectorAll('p').length).toBe(1)
    // Un <br> unique collerait les deux blocs : la séparation voulue par
    // l'auteur doit rester visible côté façade.
    expect(container.querySelectorAll('br').length).toBe(2)
    expect(container.textContent).toContain('premier')
    expect(container.textContent).toContain('second')
  })

  it('applique la className transmise', () => {
    const { container } = render(
      <RichTextContent html="<p>texte</p>" className="ma-classe" />,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('ma-classe')
  })

  it('rend les retours en <br> 1:1, plafonnés à 2 (remarque UX #2)', () => {
    const { container } = render(
      <RichTextContent html="<p>A</p><p></p><p></p><p></p><p>B</p>" />,
    )
    // 5 paragraphes = 4 frontières -> 8 <br>, plafonnés à 2.
    // Cas NON discriminant du modèle de frontière (l'ancien 1 <br> par
    // frontière plafonnait déjà à 2 ici) : il ne garde que le plafond. La
    // frontière elle-même est défendue par le test « ligne vide » plus haut,
    // dont l'entrée n'a aucun paragraphe vide.
    expect(container.querySelectorAll('br').length).toBe(2)
  })

  it('préserve le nombre de <br> sous le plafond (1:1)', () => {
    const { container } = render(<RichTextContent html="<p>A<br>B</p>" />)
    expect(container.querySelectorAll('br').length).toBe(1)
  })
})
