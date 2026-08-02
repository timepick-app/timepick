import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LockedShellInfoPanel } from '../LockedShellInfoPanel'
import type { BlockOrigin } from '@/services/editor-context.service'

const cases: ReadonlyArray<[BlockOrigin, string]> = [
  ['template', "Ce contenu est défini au niveau du modèle d'invitation."],
  ['brand', 'Ce contenu est défini au niveau de la marque (Paramètres > Email).'],
  ['hardcoded', "Ce contenu est le contenu d'origine fourni avec l'application."],
  ['event', 'Ce contenu est défini au niveau de cet événement.'],
]

const noop = () => {}

describe('LockedShellInfoPanel', () => {
  it.each(cases)('renders the French description for origin "%s"', (origin, expected) => {
    render(
      <LockedShellInfoPanel
        origin={origin}
        partKind="header"
        onCustomize={noop}
        isCustomizing={false}
      />,
    )
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it.each([
    ['header', 'en-tête'],
    ['footer', 'pied'],
  ] as const)('renders the corresponding partKind label for %s', (partKind, expectedLabel) => {
    render(
      <LockedShellInfoPanel
        origin="template"
        partKind={partKind}
        onCustomize={noop}
        isCustomizing={false}
      />,
    )
    const panel = screen.getByTestId(`locked-shell-info-panel-${partKind}`)
    expect(panel).toHaveAttribute('data-origin', 'template')
    // P1 — the rendered DOM must actually contain the partLabel; the prior
    // assertion only checked data-origin and would have passed even if the
    // label rendering was deleted.
    expect(panel.textContent).toMatch(new RegExp(`Élément concerné.+${expectedLabel}`))
  })

  it('forwards extra HTMLAttributes (data-* + className) to the rendered DOM node', () => {
    render(
      <LockedShellInfoPanel
        origin="template"
        partKind="header"
        onCustomize={noop}
        isCustomizing={false}
        data-extra="value"
        className="custom"
      />,
    )
    const panel = screen.getByTestId('locked-shell-info-panel-header')
    expect(panel).toHaveAttribute('data-extra', 'value')
    expect(panel.className).toContain('custom')
  })

  // Le bouton est le SEUL chemin d'interface vers la création d'une surcharge de
  // coque par événement : son absence a rendu la capacité inatteignable de juin
  // au 2026-07-30. Ces trois tests ancrent son existence, son câblage et son
  // état en cours.
  it.each(['header', 'footer'] as const)(
    'calls onCustomize when the customize button is clicked (%s)',
    async (partKind) => {
      const onCustomize = vi.fn()
      render(
        <LockedShellInfoPanel
          origin="template"
          partKind={partKind}
          onCustomize={onCustomize}
          isCustomizing={false}
        />,
      )
      await userEvent.click(screen.getByTestId(`locked-shell-customize-btn-${partKind}`))
      expect(onCustomize).toHaveBeenCalledTimes(1)
    },
  )

  it('disables the customize button and swaps its icon while the PUT is in flight', () => {
    const onCustomize = vi.fn()
    const { rerender } = render(
      <LockedShellInfoPanel
        origin="template"
        partKind="header"
        onCustomize={onCustomize}
        isCustomizing={false}
      />,
    )
    const button = screen.getByTestId('locked-shell-customize-btn-header')
    expect(button).toBeEnabled()
    expect(button.querySelector('.animate-spin')).toBeNull()

    rerender(
      <LockedShellInfoPanel
        origin="template"
        partKind="header"
        onCustomize={onCustomize}
        isCustomizing
      />,
    )
    expect(button).toBeDisabled()
    // R10 bis du Design System — un bouton désactivé pour requête en cours porte
    // l'information dans son icône (ici l'échange d'icône), pas seulement dans
    // l'attribut `disabled`.
    expect(button.querySelector('.animate-spin')).not.toBeNull()
  })

  it('keeps the policy wording that names the button', () => {
    render(
      <LockedShellInfoPanel
        origin="brand"
        partKind="footer"
        onCustomize={noop}
        isCustomizing={false}
      />,
    )
    const panel = screen.getByTestId('locked-shell-info-panel-footer')
    expect(panel.textContent).toContain('Personnaliser ce bloc')
    // Le message « pas encore disponible » actait le retrait de la capacité —
    // il ne doit plus réapparaître.
    expect(panel.textContent).not.toContain('pas encore disponible')
  })
})
