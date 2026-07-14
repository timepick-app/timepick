/**
 * Tests de rendu pour RichTextEditor (RENDER-ONLY).
 *
 * IMPORTANT : ProseMirror a besoin d'APIs de layout que jsdom ne fournit pas.
 * Toute interaction (clic sur un bouton, frappe clavier, sélection) déclenche
 * coordsAtPos/posAtCoords et lève une erreur.
 * Ces tests n'exercent que la structure statique rendue.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RichTextEditor } from '../rich-text-editor'

const INITIAL_HTML = '<p>Bonjour <strong>monde</strong></p>'

describe('RichTextEditor — rendu statique', () => {
  it('affiche les trois boutons de la barre d\'outils', async () => {
    render(
      <RichTextEditor
        value={INITIAL_HTML}
        onChange={vi.fn()}
        maxLength={5000}
        aria-labelledby="lbl"
      />,
    )

    // Les boutons sont rendus immédiatement (non conditionnels à l'état de l'éditeur)
    expect(screen.getByRole('button', { name: 'Gras' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Italique' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lien' })).toBeInTheDocument()
  })

  it('rend la zone d\'édition avec role=textbox et aria-multiline=true', async () => {
    render(
      <RichTextEditor
        value={INITIAL_HTML}
        onChange={vi.fn()}
        maxLength={5000}
        aria-labelledby="lbl"
      />,
    )

    const textbox = await screen.findByRole('textbox')
    expect(textbox).toBeInTheDocument()
    expect(textbox).toHaveAttribute('aria-multiline', 'true')
  })

  it('contient le texte initial dans le contenteditable', async () => {
    render(
      <RichTextEditor
        value={INITIAL_HTML}
        onChange={vi.fn()}
        maxLength={5000}
        aria-labelledby="lbl"
      />,
    )

    const textbox = await screen.findByRole('textbox')
    await waitFor(() => {
      expect(textbox.textContent).toContain('Bonjour')
      expect(textbox.textContent).toContain('monde')
    })
  })

  it('affiche le compteur de caractères quand maxLength est fourni', async () => {
    render(
      <RichTextEditor
        value={INITIAL_HTML}
        onChange={vi.fn()}
        maxLength={5000}
        aria-labelledby="lbl"
      />,
    )

    // La regex correspond à "X/5000 caractères" (X quelconque)
    const counter = await screen.findByText(/\/5000 caract\u00e8res/)
    expect(counter).toBeInTheDocument()
  })

  it("n'affiche pas de compteur quand maxLength est absent", async () => {
    render(
      <RichTextEditor
        value={INITIAL_HTML}
        onChange={vi.fn()}
        aria-labelledby="lbl"
      />,
    )

    // Attendre que le composant se stabilise, puis vérifier l'absence du compteur
    await screen.findByRole('textbox')
    expect(screen.queryByText(/caract\u00e8res/)).toBeNull()
  })
})

describe('RichTextEditor — placeholder ciblé (remarque UX #1)', () => {
  it("n'applique pas is-editor-empty quand le champ contient du texte", async () => {
    const { container } = render(
      <RichTextEditor value={INITIAL_HTML} onChange={vi.fn()} aria-labelledby="lbl" />,
    )
    await screen.findByRole('textbox')
    // Le placeholder (CSS ::before) ne cible que p.is-editor-empty:first-child :
    // avec du contenu, aucun paragraphe ne doit porter cette classe.
    expect(container.querySelector('p.is-editor-empty')).toBeNull()
  })

  it('applique is-editor-empty quand le champ est entièrement vide', async () => {
    const { container } = render(
      <RichTextEditor value="" onChange={vi.fn()} aria-labelledby="lbl" />,
    )
    await screen.findByRole('textbox')
    await waitFor(() => {
      expect(container.querySelector('p.is-editor-empty')).not.toBeNull()
    })
  })
})
