import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { Editor } from 'grapesjs'
import {
  injectLayerPanelLockCss,
  injectLockedShellSignalCss,
  LAYER_PANEL_LOCK_CSS,
  LOCKED_SHELL_SIGNAL_CSS,
} from '../lockedShellSignalCss'

function makeEditor(doc: Document | null): Editor {
  return {
    Canvas: {
      getDocument: vi.fn(() => doc),
    },
  } as unknown as Editor
}

function freshDocument(): Document {
  return document.implementation.createHTMLDocument('test')
}

describe('injectLockedShellSignalCss', () => {
  it('inserts exactly one <style data-tp-locked-shell-signal> in the iframe head (AC1)', () => {
    const doc = freshDocument()
    const editor = makeEditor(doc)

    injectLockedShellSignalCss(editor)

    const styles = doc.querySelectorAll('style[data-tp-locked-shell-signal]')
    expect(styles.length).toBe(1)
    expect(styles[0].textContent).toBe(LOCKED_SHELL_SIGNAL_CSS)
  })

  it('is idempotent — calling twice still yields exactly one style tag (AC2)', () => {
    const doc = freshDocument()
    const editor = makeEditor(doc)

    injectLockedShellSignalCss(editor)
    injectLockedShellSignalCss(editor)

    expect(doc.querySelectorAll('style[data-tp-locked-shell-signal]').length).toBe(1)
  })

  it('drift guard: the CSS constant targets the selector + the critical visual invariants validated empirically in POC Finding #10 (AC3)', () => {
    // Selector — token-list match (~=) so the signal covers both
    // css-class="locked-shell" alone AND css-class="locked-shell <other>"
    // (post-D1 review fix, see Story 26-2a Review Findings).
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain(
      '[data-gjs-type="mj-section"][css-class~="locked-shell"]',
    )
    // Visual invariants — a rounded amber (#d97706) badge holding a white
    // Lucide `lock` icon (SVG data-URI) + the orange dashed border are the
    // user-facing structural signals (per the email-shell customization policy). Any
    // regression silently breaks policy compliance. Asserted via the badge
    // background colour, its rounded corners, and the distinctive lock shackle
    // path so a swap to another icon/colour/shape is caught.
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('background-color: #d97706')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('border-radius: 9999px')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('background-image: url("data:image/svg+xml')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain("d='M7 11V7a5 5 0 0 1 10 0v4'")
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('outline: 2px dashed #d97706')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('outline-offset: -2px')
  })

  it('drift guard L3a: les 2 zones éditables système (✏️) ciblent td.tp-edit-* (classe HTML, pas attribut)', () => {
    // ⚠️ Sélecteur de CLASSE HTML : mj-text projette css-class en classe sur le
    // <td> (spike §3) — `td.tp-edit-*`, jamais `[css-class~="tp-edit-*"]`. Un
    // retour silencieux à la forme attribut rendrait l'affordance muette.
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('td.tp-edit-intro, td.tp-edit-sig')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain(
      'td.tp-edit-intro::after, td.tp-edit-sig::after',
    )
    // Signal positif inverse : badge arrondi vert (#16a34a) + icône `pencil`
    // Lucide blanche + liseré vert (≠ badge orange du lock). Asserté via la
    // couleur de fond du badge + le trait distinctif du crayon.
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('background-color: #16a34a')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain("d='m15 5 4 4'")
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('outline: 2px solid #16a34a')
  })

  it('no-ops without throwing when Canvas.getDocument() returns null', () => {
    const editor = makeEditor(null)

    expect(() => injectLockedShellSignalCss(editor)).not.toThrow()
  })
})

describe('injectLayerPanelLockCss (Plan 1.5 D1 — AC #5)', () => {
  // Le helper écrit dans le `document` global (host, pas iframe). Cleanup
  // symétrique (before + after) pour neutraliser une pollution cross-file
  // (un autre test file qui injecterait le même marqueur dans `document.head`
  // ferait fail-positive Case A length===1). Plan 1.5 D1 review patch P2.
  const purge = (): void => {
    document.head.querySelectorAll('style[data-tp-layer-panel-lock]').forEach((el) => el.remove())
  }
  beforeEach(purge)
  afterEach(purge)

  it('Case A (AC #5) — insère exactement un <style data-tp-layer-panel-lock> dans document.head', () => {
    injectLayerPanelLockCss()

    const styles = document.head.querySelectorAll('style[data-tp-layer-panel-lock]')
    expect(styles.length).toBe(1)
    expect(styles[0].textContent).toBe(LAYER_PANEL_LOCK_CSS)
  })

  it('Case B (AC #5) — idempotent : 2 appels successifs n’insèrent pas un 2e style', () => {
    injectLayerPanelLockCss()
    injectLayerPanelLockCss()

    expect(document.head.querySelectorAll('style[data-tp-layer-panel-lock]').length).toBe(1)
  })

  it('Case C (AC #5 drift guard) — la règle CSS scope `.gjs-layer-move { display: none }` au LayerManager de l’overlay', () => {
    // Sans ces invariants, un drift sur le sélecteur ou la propriété
    // ferait réapparaître les poignées de drag dans le Layer panel
    // (régression P5 du smoke v1 Plan 1.5).
    expect(LAYER_PANEL_LOCK_CSS).toContain('[data-testid="mjml-editor-inner"]')
    expect(LAYER_PANEL_LOCK_CSS).toContain('.gjs-layer-move')
    expect(LAYER_PANEL_LOCK_CSS).toContain('display: none !important')
  })
})
