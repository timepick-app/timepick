import { describe, it, expect, afterEach } from 'vitest'
import { isDismissGuardedSurface, isDrawbridgePresent } from '../dismissGuard'

afterEach(() => {
  document.body.innerHTML = ''
})

/**
 * The guard decides whether a body-level pointer/focus event should keep the
 * email editor open (color picker + every Drawbridge surface) or let Radix
 * dismiss it. The selector is the part that silently regresses, so each guarded
 * surface — and the negative case — is asserted directly.
 */
describe('isDismissGuardedSurface', () => {
  it.each([
    ['Drawbridge moat panel', 'float-moat'],
    ['Drawbridge tools menu (Comment / Rectangle)', 'float-project-menu'],
    ['Drawbridge overflow menu', 'float-more-menu'],
    ['Drawbridge modal overlay', 'float-modal-overlay'],
    ['Drawbridge comment box', 'float-comment-box'],
    ['Drawbridge drawing canvas', 'float-drawing-canvas'],
    ['Spectrum color picker', 'sp-container'],
  ])('guards a click inside the %s', (_label, className) => {
    document.body.innerHTML = `<div class="${className}"><button id="t">x</button></div>`
    expect(isDismissGuardedSurface(document.getElementById('t'))).toBe(true)
  })

  it('guards the surface element itself, not only descendants', () => {
    document.body.innerHTML = '<div class="float-project-menu" id="t"></div>'
    expect(isDismissGuardedSurface(document.getElementById('t'))).toBe(true)
  })

  it('does not guard unrelated elements (editor is allowed to dismiss)', () => {
    document.body.innerHTML = '<div class="gjs-pn-panel"><button id="t">x</button></div>'
    expect(isDismissGuardedSurface(document.getElementById('t'))).toBe(false)
  })

  it('returns false for null and non-Element targets', () => {
    expect(isDismissGuardedSurface(null)).toBe(false)
    expect(isDismissGuardedSurface(new EventTarget())).toBe(false)
  })
})

/**
 * Drawbridge presence drives the editor's modal/non-modal switch, keyed on the
 * extension's stable root id `#moat-moat`.
 */
describe('isDrawbridgePresent', () => {
  it('is true when the Drawbridge moat root is mounted', () => {
    document.body.innerHTML = '<div id="moat-moat" class="float-moat"></div>'
    expect(isDrawbridgePresent()).toBe(true)
  })

  it('is false without the extension (production / normal dev)', () => {
    expect(isDrawbridgePresent()).toBe(false)
  })
})
