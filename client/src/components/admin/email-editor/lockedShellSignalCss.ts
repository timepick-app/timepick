import type { Editor } from 'grapesjs'

/**
 * CSS injected into the GrapesJS canvas iframe to mark the 3 structural
 * sections of an invitation email (header / body / footer) with a permanent
 * orange dashed border + a rounded amber (#d97706) badge holding a white
 * Lucide `lock` icon (SVG data-URI) in the top-right corner.
 *
 * Selector based on POC Finding #10 — targets the full-width GrapesJS
 * wrapper (`<mj-section>` carrying the MJML `css-class` attribute), not the
 * inner 600px MJML div. Hardened with `~=` (token-list match) instead of the
 * POC's strict `=` so the signal covers both `css-class="locked-shell"` alone
 * AND `css-class="locked-shell <other>"` for personalized shells (the helper
 * `addLockedShellClass` prepends rather than replaces). Drift guard keeps
 * the `[css-class~=]` shape — any change breaks the empirical hypothesis
 * validated on grapesjs@0.22.15 + grapesjs-mjml@1.0.8.
 *
 * Plan 1.5 (2026-05-23 post-smoke v3) — extended to cover the `<mj-body>`
 * Frame with the EXACT SAME visual pattern as the 3 sections: orange
 * dashed outline + `::after` containing the 🔒 lock pictogram at top-right. The
 * Frame is identified via a CSS class `.tp-frame-signal` (added on the
 * view element by `applyMjBodyLock`), since the auto `data-gjs-type` attr
 * is empirically not posted on the rendered mj-body in grapesjs 0.22.15.
 * Distinction from sections : the Frame's outline encompasses ALL sections
 * (it sits around their wrapper, with a 12px clickable padding) — nested
 * orange outlines are visually coherent because they share the structural
 * lock vocabulary established in the email-shell customization policy.
 *
 * L3b (D8, 2026-06-06) — en mode système, l'EN-TÊTE est désormais éditable
 * (comme en invitation) tout en gardant `locked-shell` (structure verrouillée :
 * non déplaçable/supprimable). Le 🔒 = « structure verrouillée, contenu
 * éditable » — convention DÉJÀ établie en invitation, donc cohérente. Le corps
 * système reste majoritairement gelé : sa lecture-seule se lit à l'ABSENCE de
 * ✏️ (seules les 2 zones intro/sig portent le liseré vert + ✏️). Aucune règle
 * CSS ajoutée en L3b : l'affordance repose sur cette convention, validée au
 * smoke runtime (le headless ne route pas le RTE — cf. Phase 5 du plan L3b).
 */
export const LOCKED_SHELL_SIGNAL_CSS = `[data-gjs-type="mj-section"][css-class~="locked-shell"] {
  position: relative !important;
  outline: 2px dashed #d97706 !important;
  outline-offset: -2px !important;
}
[data-gjs-type="mj-section"][css-class~="locked-shell"]::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background-color: #d97706;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='11' x='3' y='11' rx='2' ry='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: none;
  z-index: 10;
}
.tp-frame-signal {
  position: relative !important;
  outline: 2px dashed #d97706 !important;
  outline-offset: -2px !important;
  /* Visible clickable margin around the sections so the admin can select
     the Frame by clicking the area between sections and the iframe edge. */
  padding: 12px !important;
}
.tp-frame-signal::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background-color: #d97706;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='11' x='3' y='11' rx='2' ry='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: none;
  z-index: 11;
}
/* L3a (D6 affordance) — signal POSITIF inverse sur les 2 zones editables des
   emails systeme (accroche + signature). ATTENTION Selecteur de CLASSE HTML :
   le compilateur MJML projette le css-class d'un mj-text en vraie classe sur le
   td (PAS en attribut css-class comme les mj-section) — d'ou td.tp-edit-* et non
   la forme attribut css-class. Inerte hors mode systeme (aucun td ne porte ces
   classes). Lisere vert + crayon ; z-index > cadenas (section 10 / frame 11)
   pour ne pas etre masque. */
td.tp-edit-intro, td.tp-edit-sig {
  position: relative !important;
  outline: 2px solid #16a34a !important;
  outline-offset: -2px !important;
}
td.tp-edit-intro::after, td.tp-edit-sig::after {
  content: '';
  position: absolute;
  top: 4px;
  right: 6px;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background-color: #16a34a;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'/%3E%3Cpath d='m15 5 4 4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: none;
  z-index: 12;
}`

const STYLE_MARKER_ATTR = 'data-tp-locked-shell-signal'

/**
 * Inserts a single `<style>` tag into the canvas iframe `<head>` so the
 * 3 locked-shell sections receive a permanent visual signal — orange dashed
 * border + 🔒 — visible before any selection. Closes the silent-failure of
 * Story 26-2 originelle by letting the user know structurally locked zones
 * at a glance, conformément à la politique de structure verrouillée des
 * emails, section « Indicateurs de structure verrouillée ».
 *
 * Idempotent: the marker attribute `data-tp-locked-shell-signal` prevents
 * duplicate insertions when `editor.on('load')` re-fires (template switch,
 * canvas rebuild).
 *
 * No-op when the canvas document is not yet accessible (defensive).
 */
export function injectLockedShellSignalCss(editor: Editor): void {
  const doc = editor.Canvas?.getDocument?.()
  if (!doc) {
    if (import.meta.env.DEV) {
      console.warn('[lockedShellSignalCss] canvas document inaccessible')
    }
    return
  }
  if (doc.querySelector(`style[${STYLE_MARKER_ATTR}]`)) {
    return
  }
  const styleEl = doc.createElement('style')
  styleEl.setAttribute(STYLE_MARKER_ATTR, '')
  styleEl.textContent = LOCKED_SHELL_SIGNAL_CSS
  doc.head.appendChild(styleEl)
}

const LAYER_PANEL_LOCK_STYLE_MARKER = 'data-tp-layer-panel-lock'

/**
 * Plan 1.5 (2026-05-23 post-smoke v2) — masks the Layer panel drag handles
 * (`.gjs-layer-move`) for the entire MjmlEditorOverlay LayerManager. All
 * shell components are `draggable: false` (mj-body Frame, the 3 sections,
 * and all descendants via DESCENDANT_LOCK_PROPS), so no layer should ever
 * expose a drag handle in our usage. The CSS lives in the HOST document
 * (not the canvas iframe) because the Layer panel is rendered host-side.
 *
 * Why CSS rather than the model `draggable` toggle: `ItemView.updateMove`
 * (grapesjs internals) only runs on `change:draggable`, and the mj-body
 * default is already `false` → our `set` is a no-op → handle stays
 * visible. Forcing a toggle (`true` → `false`) is timing-sensitive (the
 * Layer panel item must already be in the DOM) and proved unreliable
 * during the v1 smoke. A scoped HOST stylesheet is deterministic and
 * survives any future Layer panel re-renders.
 *
 * Scope `[data-testid="mjml-editor-inner"]` limits the rule to our editor
 * instance, so no other LayerManager elsewhere in the app is impacted.
 *
 * Idempotent — the marker attribute prevents duplicate inserts when the
 * editor is re-mounted (template switch).
 */
export const LAYER_PANEL_LOCK_CSS = `[data-testid="mjml-editor-inner"] .gjs-layer-move {
  display: none !important;
}`

export function injectLayerPanelLockCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[${LAYER_PANEL_LOCK_STYLE_MARKER}]`)) {
    return
  }
  const styleEl = document.createElement('style')
  styleEl.setAttribute(LAYER_PANEL_LOCK_STYLE_MARKER, '')
  styleEl.textContent = LAYER_PANEL_LOCK_CSS
  document.head.appendChild(styleEl)
}
