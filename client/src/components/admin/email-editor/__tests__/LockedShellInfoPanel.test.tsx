import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LockedShellInfoPanel } from '../LockedShellInfoPanel'
import type { BlockOrigin } from '@/services/editor-context.service'

const cases: ReadonlyArray<[BlockOrigin, string]> = [
  ['template', "Ce contenu est défini au niveau du modèle d'invitation."],
  ['brand', 'Ce contenu est défini au niveau de la marque (Paramètres > Email).'],
  ['hardcoded', "Ce contenu est le contenu d'origine fourni avec l'application."],
  ['event', 'Ce contenu est défini au niveau de cet événement.'],
]

describe('LockedShellInfoPanel', () => {
  it.each(cases)('renders the French description for origin "%s"', (origin, expected) => {
    render(<LockedShellInfoPanel origin={origin} partKind="header" />)
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it.each([
    ['header', 'en-tête'],
    ['footer', 'pied'],
  ] as const)('renders the corresponding partKind label for %s', (partKind, expectedLabel) => {
    render(<LockedShellInfoPanel origin="template" partKind={partKind} />)
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
        data-extra="value"
        className="custom"
      />,
    )
    const panel = screen.getByTestId('locked-shell-info-panel-header')
    expect(panel).toHaveAttribute('data-extra', 'value')
    expect(panel.className).toContain('custom')
  })
})
