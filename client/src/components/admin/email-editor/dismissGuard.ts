/**
 * External, body-level surfaces that the admin legitimately interacts with while
 * the email editor `DialogContent` is open, and which therefore must NOT dismiss
 * the Dialog. Radix's `DismissableLayer` closes the Dialog on any outside
 * pointer-down unless `onPointerDownOutside` / `onInteractOutside` calls
 * `preventDefault()` — so these callbacks consult this selector.
 *
 *   .sp-container         — GrapesJS Spectrum color picker popup (swatch fields)
 *
 *   Drawbridge dev review extension — every surface it appends to document.body:
 *   .float-moat           — docked review panel
 *   .float-project-menu   — Tools menu (Comment / Rectangle) + project menu
 *   .float-more-menu      — overflow menu
 *   .float-modal-overlay  — connect / clear-screenshots modals
 *   .float-comment-box    — comment input popup (textarea + actions)
 *   .float-drawing-canvas — full-viewport canvas active while drawing a rectangle
 *
 * Companion behaviour in MjmlEditorOverlay: when Drawbridge is present the Dialog
 * is rendered non-modal, so these surfaces also stay clickable and focusable
 * (Radix's modal mode sets `body { pointer-events: none }` and traps focus).
 */
const DISMISS_GUARD_SELECTOR =
  '.sp-container, .float-moat, .float-project-menu, .float-more-menu, .float-modal-overlay, .float-comment-box, .float-drawing-canvas'

/** True when `target` sits inside a surface that must not dismiss the editor. */
export function isDismissGuardedSurface(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(DISMISS_GUARD_SELECTOR) !== null
}

/**
 * The Drawbridge dev extension docks its review panel as `#moat-moat` on
 * document.body (moat.js → `moat.id = 'moat-moat'`). Its presence is the signal
 * to relax the editor Dialog to non-modal; absent (production, normal dev) the
 * editor stays modal.
 */
export function isDrawbridgePresent(): boolean {
  return document.getElementById('moat-moat') !== null
}
