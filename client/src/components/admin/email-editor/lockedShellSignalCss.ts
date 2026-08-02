import type { Editor } from 'grapesjs'

/**
 * SIGNAL 1 — structure figée. Étiquette permanente « En-tête » / « Corps » /
 * « Pied » sur les 3 blocs, exigée par la politique de personnalisation de la
 * coque email, section « Indicateurs de structure verrouillée » (« Toujours
 * affichée, pas au survol »). Pilotée par `data-locked-label`, posé par
 * `addLockedLabel()` et par le wrap de la carte (`bodyExtraction.ts`).
 *
 * Passée à GrapesJS via `canvas.frameStyle` (et non injectée comme
 * `LOCKED_SHELL_SIGNAL_CSS`) : l'étiquette doit exister dès le premier rendu de
 * l'iframe, avant toute passe de verrou.
 *
 * SÉLECTEUR — tout le sujet de cette règle. La forme précédente
 * `.locked-shell[data-locked-label]` exigeait la CLASSE et l'ATTRIBUT sur le
 * MÊME élément ; dans le DOM compilé ils sont sur deux éléments distincts (le
 * wrapper GrapesJS porte les `data-*`, un descendant porte la classe). La règle
 * n'a donc JAMAIS rendu : l'étiquette exigée par la policy était absente de
 * l'éditeur depuis son introduction (story 26-2 / AC6), sans que rien ne le
 * signale. On vise désormais le porteur de l'attribut, seul élément dont la
 * présence est garantie par le wrap.
 *
 * Pastille unique icône + texte : l'épingle (Lucide `pin`, data-URI) dans le
 * `background-image`, le texte dans `content`. Une épingle dit « fixé en
 * place », ce qui est vrai — le bloc ne bouge pas, son contenu est libre. Le
 * cadenas qu'elle remplace disait « accès interdit », ce qui était faux.
 *
 * COULEURS — R13 du système de design (« Couleur sur une surface sans classes
 * utilitaires ») : ce document est un e-mail, donc sans classe utilitaire ni
 * variable de thème ; les littéraux ci-dessous sont la conversion des tokens
 * `--muted` / `--border` / `--primary` / `--muted-foreground` du thème CLAIR, et
 * le fichier de test COMPARE cette conversion au thème. Ce n'est donc pas une
 * ressemblance de bonne foi mais une dérivation gardée — le thème sombre est
 * délibérément écarté, il rendrait ce texte illisible sur son propre fond.
 * L'ambre, lui, est réservé à l'héritage.
 */
export const LOCKED_SHELL_LABEL_CSS = `[data-locked-label] {
  position: relative;
}
[data-locked-label]::before {
  content: attr(data-locked-label);
  position: absolute;
  /* 24px et non 6px : GrapesJS pose son étiquette de nom de composant AU-DESSUS
     de l'élément quand la place existe, et LA RABAT À L'INTÉRIEUR (top:0 left:0)
     sinon. Le bloc d'en-tête étant le plus haut de l'iframe, il n'y a jamais de
     place au-dessus : le recouvrement y était donc systématique, et impossible
     sur le pied. Cette étiquette-là vit dans la couche d'outils du document
     HÔTE, au-dessus de l'iframe — aucun z-index posé depuis l'intérieur ne peut
     la dépasser. Descendre sous elle est la seule réponse. La policy exige
     l'étiquette « toujours affichée » : occultée pile pendant le survol et la
     sélection, elle ne l'était pas. */
  top: 24px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px 0 20px;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  /* 11px + paire de tokens --secondary / --secondary-foreground : le couple
     --muted / --muted-foreground (#f4f4f5 / #71717a) ne donne que 4,40:1 a
     cette taille, sous le seuil AA de 4,5:1 — et l'étiquette remplacée était à
     12px / 6,87:1, donc c'eût été une régression d'accessibilité. Ici 16,12:1.
     Ces pastilles sont l'UNIQUE porteur textuel du signal (pas d'explication au
     survol), donc aucun canal de repli ne rattraperait un texte illisible. */
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  letter-spacing: 0.01em;
  color: #18181b;
  background-color: #f4f4f5;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%2318181b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 17v5'/%3E%3Cpath d='M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 5px center;
  border: 1px solid #e4e4e7;
  border-radius: 9999px;
  pointer-events: none;
  z-index: 9;
}`

/**
 * Feuille de style injectée dans l'iframe du canvas GrapesJS. Elle porte deux
 * signaux ORTHOGONAUX, à ne pas confondre — c'est leur confusion qui a produit
 * l'ambiguïté que cette version corrige :
 *
 *  1. STRUCTURE FIGÉE — gris neutre, sur les 3 blocs, toujours. Liseré
 *     pointillé ici + pastille « épingle + En-tête / Corps / Pied » portée par
 *     `LOCKED_SHELL_LABEL_CSS` ci-dessus. Signifie : ce bloc ne s'ajoute, ne se
 *     déplace, ne se supprime pas.
 *  2. CONTENU HÉRITÉ — ambre, UNIQUEMENT sous `[data-inherited="true"]`.
 *     Liseré ambre + pastille « Hérité du modèle / de la marque / Contenu
 *     d'origine » (`data-inherited-label`) + contenu estompé. Signifie : ce
 *     bloc n'a pas encore de cible de sauvegarde ici, il faut d'abord créer la
 *     surcharge (bouton « Personnaliser ce bloc »).
 *
 * Historique — pourquoi ces deux signaux sont désormais distincts : jusqu'au
 * 2026-07-30 un unique badge ambre au cadenas coiffait les 2 blocs de coque ET
 * le cadre de page, lequel est parfaitement stylable par événement. Un signal
 * qui ne varie jamais ne transporte aucune information ; l'admin ne pouvait pas
 * distinguer un bloc éditable d'un bloc verrouillé. Le cadenas disait de plus
 * « accès interdit » là où seule la structure est figée — son propre
 * commentaire l'admettait en le redéfinissant en « structure verrouillée,
 * contenu éditable », ce qu'un cadenas ne dit pas. La policy, elle, ne
 * mentionne aucune icône : elle exige une étiquette permanente et une mention
 * d'héritage, toutes deux textuelles. Aucune couleur nouvelle n'est introduite —
 * l'ambre existant cesse d'être partout et devient informatif.
 *
 * Sélecteur basé sur POC Finding #10 — cible le wrapper GrapesJS pleine largeur
 * (la `<mj-section>` porteuse de l'attribut MJML `css-class`), pas le div MJML
 * interne de 600px. Durci avec `~=` (match sur liste de tokens) plutôt que le
 * `=` strict du POC pour couvrir `css-class="locked-shell"` seul ET
 * `css-class="locked-shell <autre>"` (le helper `addLockedShellClass` préfixe au
 * lieu de remplacer). Le drift guard conserve la forme `[css-class~=]` — tout
 * changement casse l'hypothèse empirique validée sur grapesjs@0.22.15 +
 * grapesjs-mjml@1.0.8.
 *
 * Plan 1.5 (2026-05-23 post-smoke v3) — le cadre `<mj-body>` est couvert par le
 * même liseré pointillé, via la classe `.tp-frame-signal` posée sur l'élément de
 * vue par `applyMjBodyLock` (l'attribut auto `data-gjs-type` n'est empiriquement
 * pas posé sur le mj-body rendu en grapesjs 0.22.15). Il n'a PAS de pastille :
 * il est stylable au niveau événement et n'hérite de rien, or son badge était le
 * plus trompeur des trois puisqu'il coiffe tout l'e-mail. Son liseré englobe les
 * 3 sections (12px de padding cliquable) — l'imbrication reste lisible, les deux
 * liserés disant la même chose : structure figée.
 *
 * Éditeurs système — état MESURÉ le 2026-07-30, dans l'éditeur réel : en-tête ET
 * pied y sont hérités (`isShellBlockInherited` renvoie vrai partout hors onglet
 * Invitation), donc tous deux portent le liseré ambre, la pastille de provenance
 * et l'estompage. C'est exact et informatif — la coque ne s'édite QUE depuis
 * l'onglet Invitation, et l'admin voit désormais que ces blocs ne lui
 * appartiennent pas ici, là où il ne voyait qu'un cadenas indistinct.
 *
 * ⚠️ Un commentaire L3b (D8, 2026-06-06) affirmait ici que « en mode système
 * l'en-tête est éditable comme en invitation ». C'était vrai à l'époque et
 * FAUX depuis « Lot 2 T4 », qui a restreint l'éditabilité de la coque au seul
 * onglet Invitation (cf. le commentaire de `wrapBodyForEditing`). L'affirmation a
 * survécu à ce changement ; ne pas la restaurer sans la re-mesurer.
 *
 * Le corps système reste majoritairement gelé : sa lecture seule se lit à
 * l'ABSENCE du liseré vert + crayon (seules les 2 zones accroche/signature le
 * portent), et le corps n'est jamais estompé — vérifié, opacité 1.
 */
export const LOCKED_SHELL_SIGNAL_CSS = `[data-gjs-type="mj-section"][css-class~="locked-shell"] {
  position: relative !important;
  outline: 2px dashed #71717a !important;
  outline-offset: -2px !important;
}
/* Signal 2 — héritage. L'ambre ne sort QUE là : liseré, pastille et estompage
   marquent ensemble un bloc sans cible de sauvegarde au niveau courant. */
[data-gjs-type="mj-section"][css-class~="locked-shell"][data-inherited="true"] {
  outline-color: #d97706 !important;
}
/* Estompage du CONTENU seul : cible les enfants du wrapper, pas le wrapper —
   sinon l'opacité s'appliquerait aussi à ses pseudo-éléments et délaverait les
   deux pastilles, qui doivent rester lisibles. Sélecteur volontairement
   agnostique de la classe interne posée par le compilateur MJML. */
[data-gjs-type="mj-section"][css-class~="locked-shell"][data-inherited="true"] > * {
  opacity: 0.55 !important;
}
[data-gjs-type="mj-section"][css-class~="locked-shell"][data-inherited="true"]::after {
  content: attr(data-inherited-label);
  position: absolute;
  /* En haut à DROITE, donc hors d'atteinte de l'étiquette de nom GrapesJS (qui
     se rabat en haut a gauche) : ce top n'a pas a descendre comme celui de la
     pastille de structure. */
  top: 6px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px 0 20px;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  /* Texte SOMBRE sur l'ambre, pas blanc : blanc sur #d97706 ne donne que 3,19:1,
     sous le seuil AA. #18181b (token --primary) donne 5,56:1 — et surtout
     l'ambre reste EXACTEMENT #d97706, la décision produit « aucune couleur
     nouvelle » étant tenue. Assombrir l'ambre lui-même l'aurait violée. */
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  letter-spacing: 0.01em;
  color: #18181b;
  background-color: #d97706;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%2318181b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M19 3H5'/%3E%3Cpath d='M12 21V7'/%3E%3Cpath d='m6 15 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 5px center;
  border-radius: 9999px;
  pointer-events: none;
  z-index: 10;
}
/* Cadre de page (mj-body) — liseré structurel seul, AUCUNE pastille : il est
   stylable au niveau événement et n'hérite de rien. */
.tp-frame-signal {
  position: relative !important;
  outline: 2px dashed #71717a !important;
  outline-offset: -2px !important;
  /* Marge cliquable visible autour des sections, pour que l'admin puisse
     sélectionner le cadre en cliquant entre les sections et le bord de l'iframe. */
  padding: 12px !important;
}
/* L3a (D6 affordance) — signal POSITIF inverse sur les 2 zones editables des
   emails systeme (accroche + signature). ATTENTION Selecteur de CLASSE HTML :
   le compilateur MJML projette le css-class d'un mj-text en vraie classe sur le
   td (PAS en attribut css-class comme les mj-section) — d'ou td.tp-edit-* et non
   la forme attribut css-class. Inerte hors mode systeme (aucun td ne porte ces
   classes). Lisere vert + crayon ; z-index 12, au-dessus des pastilles de coque
   (structure 9, heritage 10 ; le 11 est libre depuis le retrait du badge du
   cadre de page) pour ne pas etre masque. */
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
 * Insère un unique `<style>` dans le `<head>` de l'iframe du canvas, pour que
 * les blocs de coque portent leurs signaux permanents — liseré pointillé gris
 * de structure, et liseré + pastille ambre + estompage quand le contenu est
 * hérité — visibles avant toute sélection. Ferme le silent-failure de la story
 * 26-2 d'origine en rendant lisibles d'un coup d'œil la structure figée ET
 * l'héritage, conformément à la politique de personnalisation de la coque
 * email, sections « Indicateurs de structure verrouillée » et « Indicateurs de
 * contenu hérité ».
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
