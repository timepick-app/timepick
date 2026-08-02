import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { Editor } from 'grapesjs'
import {
  injectLayerPanelLockCss,
  injectLockedShellSignalCss,
  LAYER_PANEL_LOCK_CSS,
  LOCKED_SHELL_LABEL_CSS,
  LOCKED_SHELL_SIGNAL_CSS,
} from '../lockedShellSignalCss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// La palette Tailwind elle-même : la seule référence qui rende vérifiable
// « #d97706 EST amber-600 » plutôt que simplement affirmé.
import tailwindColors from 'tailwindcss/colors'

// Le thème lui-même, lu tel qu'il est écrit : c'est la seule façon qu'un
// ajustement de token fasse ROUGIR ce fichier au lieu de le désynchroniser en
// silence. Lu depuis le disque et non importé : vitest neutralise les imports
// CSS, `?raw` compris — l'import rendait une chaîne vide, donc un test vert à
// vide sans la garde de non-vacuité plus bas.
// import.meta.dirname → client/src/components/admin/email-editor/__tests__
const indexCss = readFileSync(
  resolve(import.meta.dirname, '..', '..', '..', '..', 'index.css'),
  'utf8',
)

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

  it('drift guard: le sélecteur empirique du POC Finding #10 et les invariants du signal de STRUCTURE (AC3)', () => {
    // Sélecteur — match sur liste de tokens (~=) pour couvrir
    // css-class="locked-shell" seul ET css-class="locked-shell <autre>"
    // (fix de revue post-D1, cf. Story 26-2a Review Findings).
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain(
      '[data-gjs-type="mj-section"][css-class~="locked-shell"]',
    )
    // Structure figée = liseré pointillé GRIS neutre, sur tous les blocs de
    // coque, indépendamment de l'héritage. L'ambre inconditionnel d'avant le
    // 2026-07-30 ne transportait aucune information : il coiffait aussi bien un
    // bloc éditable qu'un bloc verrouillé (et jusqu'au cadre de page, stylable).
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('outline: 2px dashed #71717a')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('outline-offset: -2px')
    // Le cadre de page porte le liseré structurel et AUCUNE pastille.
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('.tp-frame-signal {')
    expect(LOCKED_SHELL_SIGNAL_CSS).not.toContain('.tp-frame-signal::after')
    // Le cadenas a disparu du produit : son arceau ne doit pas revenir, ni ici
    // ni dans la pastille de structure.
    expect(LOCKED_SHELL_SIGNAL_CSS).not.toContain("d='M7 11V7a5 5 0 0 1 10 0v4'")
    expect(LOCKED_SHELL_LABEL_CSS).not.toContain("d='M7 11V7a5 5 0 0 1 10 0v4'")
  })

  it("drift guard: la pastille de STRUCTURE cible le porteur de l'attribut, jamais la classe", () => {
    // ⚠️ L'ANCÊTRE porte `data-locked-label`, un DESCENDANT porte la classe
    // `locked-shell`. Toute forme qui exige les deux sur le même élément — dont
    // `.locked-shell[data-locked-label]`, en place et morte jusqu'au 2026-07-30 —
    // ne rend RIEN, silencieusement, et l'étiquette permanente exigée par la
    // policy disparaît de l'éditeur.
    expect(LOCKED_SHELL_LABEL_CSS).toContain('[data-locked-label]::before')
    expect(LOCKED_SHELL_LABEL_CSS).not.toContain('.locked-shell[data-locked-label]')
    // Le texte vient de l'attribut : une pastille sans `content: attr(...)`
    // n'afficherait qu'une icône, or c'est le TEXTE qui porte le sens.
    expect(LOCKED_SHELL_LABEL_CSS).toContain('content: attr(data-locked-label)')
    // Icône + texte dans la MÊME pastille.
    expect(LOCKED_SHELL_LABEL_CSS).toContain('background-image: url("data:image/svg+xml')
    expect(LOCKED_SHELL_LABEL_CSS).toContain('background-color: #f4f4f5')
    // Épingle Lucide `pin` — sa tête est le trait distinctif ; un échange
    // d'icône est un choix produit qui doit se voir ici.
    expect(LOCKED_SHELL_LABEL_CSS).toContain("d='M12 17v5'")
  })

  it('drift guard: les deux pastilles restent lisibles (contraste AA, taille de police)', () => {
    // Ces pastilles sont l'UNIQUE porteur textuel des deux signaux : aucune
    // explication au survol ne rattraperait un texte illisible. Les couples
    // livrés le 2026-07-30 échouaient AA (gris 4,40:1 ; blanc sur ambre 3,19:1)
    // et le second était une RÉGRESSION — l'étiquette remplacée tenait 6,87:1.
    // Ces assertions verrouillent les couples corrigés, pas une préférence.
    expect(LOCKED_SHELL_LABEL_CSS).toContain('color: #18181b') //  16,12:1 sur #f4f4f5
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('color: #18181b') //   5,56:1 sur #d97706
    // Texte blanc sur l'ambre : 3,19:1, sous le seuil. Ne doit pas revenir.
    expect(LOCKED_SHELL_SIGNAL_CSS).not.toContain('color: #ffffff')
    // 10px placerait les deux pastilles sous le plus petit pas typographique du
    // système ET hors du régime « large text » de WCAG.
    expect(LOCKED_SHELL_LABEL_CSS).not.toContain('font-size: 10px')
    expect(LOCKED_SHELL_SIGNAL_CSS).not.toContain('font-size: 10px')
    expect(LOCKED_SHELL_LABEL_CSS).toContain('font-size: 11px')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('font-size: 11px')
  })

  it("drift guard: la pastille de structure passe SOUS l'étiquette de nom GrapesJS", () => {
    // GrapesJS rabat son étiquette de nom à l'intérieur de l'élément (haut à
    // gauche) quand il n'y a pas de place au-dessus — ce qui est toujours le cas
    // du bloc le plus haut de l'iframe. Elle vit dans le document HÔTE : aucun
    // z-index posé depuis l'iframe ne peut la dépasser. `top: 6px` faisait donc
    // disparaître l'étiquette « toujours affichée » exigée par la policy, pile
    // pendant le survol et la sélection.
    expect(LOCKED_SHELL_LABEL_CSS).toContain('top: 24px')
    expect(LOCKED_SHELL_LABEL_CSS).not.toContain('top: 6px')
  })

  it("drift guard: le signal d'HÉRITAGE est conditionné à data-inherited et porte son libellé", () => {
    const inheritedSelector =
      '[data-gjs-type="mj-section"][css-class~="locked-shell"][data-inherited="true"]'
    // L'ambre ne sort QUE sous `data-inherited` — c'est ce qui le rend
    // informatif. Les 3 marques partent ensemble : liseré, pastille, estompage.
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain(`${inheritedSelector} {`)
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('outline-color: #d97706')
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain(`${inheritedSelector}::after`)
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('background-color: #d97706')
    // Estompage sur les ENFANTS du wrapper : posé sur le wrapper lui-même,
    // l'opacité délaverait aussi ses deux pastilles.
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain(`${inheritedSelector} > * {`)
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('opacity: 0.55')
    // La mention nomme l'origine (« Hérité du modèle / de la marque / Contenu
    // d'origine ») via l'attribut : sans `attr()`, la pastille serait muette.
    expect(LOCKED_SHELL_SIGNAL_CSS).toContain('content: attr(data-inherited-label)')
    // Aucun estompage ni pastille d'héritage sur un bloc surchargé au niveau
    // courant : la règle non conditionnée ne doit pas réapparaître.
    expect(LOCKED_SHELL_SIGNAL_CSS).not.toContain(
      '[data-gjs-type="mj-section"][css-class~="locked-shell"]::after',
    )
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

// ============================================================================
// Contraste CALCULÉ depuis les constantes, jamais apprécié sur une capture.
//
// Les deux couples livrés le 2026-07-30 (gris 4,40:1 ; blanc sur ambre 3,19:1,
// le second en RÉGRESSION sur l'étiquette qu'il remplaçait) ont passé une
// relecture visuelle sur capture d'écran ET la garde par littéraux ci-dessus —
// laquelle ne verrouille que les couples qu'on a pensé à lister. Ce bloc-ci
// MESURE toutes les règles qui posent un texte ou une icône sur un fond : un
// futur couple jamais listé est couvert par construction.
//
// Seuil 4,5:1 (AA, texte normal) et non 3:1 : les deux pastilles sont à 11px /
// 600, donc hors du régime « large text » de WCAG (18,66px gras ou 24px). C'est
// le drift guard de `font-size` ci-dessus qui maintient cette hypothèse.
// ============================================================================

/** WCAG 1.4.3 — texte normal. */
const AA_TEXT_RATIO = 4.5
/** WCAG 1.4.11 — objet graphique porteur d'information (ici : l'icône). */
const AA_NON_TEXT_RATIO = 3

interface CssRule {
  selector: string
  decls: Map<string, string>
}

/**
 * Découpe une feuille en règles `sélecteur { prop: valeur; … }`. Les valeurs de
 * ces constantes ne contiennent ni accolade ni point-virgule (les icônes sont
 * des data-URI percent-encodés), donc ce découpage naïf y est exact — et la
 * non-vacuité est assertée plus bas plutôt que supposée.
 */
function parseRules(css: string): CssRule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  for (const [, selector, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = new Map<string, string>()
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon === -1) continue
      decls.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim())
    }
    rules.push({ selector: selector.trim(), decls })
  }
  return rules
}

function srgbToLinear(byte: number): number {
  const channel = byte / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const rgb = Number.parseInt(hex.slice(1), 16)
  return (
    0.2126 * srgbToLinear((rgb >> 16) & 0xff) +
    0.7152 * srgbToLinear((rgb >> 8) & 0xff) +
    0.0722 * srgbToLinear(rgb & 0xff)
  )
}

/** WCAG 2.x — (L_clair + 0,05) / (L_sombre + 0,05). */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const CANVAS_RULES = [
  ...parseRules(LOCKED_SHELL_LABEL_CSS),
  ...parseRules(LOCKED_SHELL_SIGNAL_CSS),
]

/** Les 2 pastilles textuelles, seul porteur du sens des deux signaux. */
const PILL_SELECTORS = [
  '[data-locked-label]::before',
  '[data-gjs-type="mj-section"][css-class~="locked-shell"][data-inherited="true"]::after',
]

/** Icônes en data-URI : les 2 pastilles + le crayon des zones éditables. */
const ICON_RULE_COUNT = 3

describe('signaux de canvas — contraste CALCULÉ, pas apprécié', () => {
  it('le découpage naïf reste valide pour ces feuilles', () => {
    // `parseRules` sépare les déclarations sur `;` : un data-URI en `;base64,`
    // ou `;utf8,` scinderait une déclaration en deux et retirerait
    // SILENCIEUSEMENT l'icône concernée de la mesure. Les icônes actuelles sont
    // en `svg+xml,` percent-encodé, sans `;`. Si cela change, c'est ici que ça
    // doit rougir, pas dans un rapport de contraste devenu incomplet.
    for (const sheet of [LOCKED_SHELL_LABEL_CSS, LOCKED_SHELL_SIGNAL_CSS]) {
      expect(sheet).not.toMatch(/;\s*(base64|utf8|charset)/i)
    }
  })

  it('aucune règle ne pose un texte sans déclarer sa couleur ET son fond', () => {
    // Deux trous à fermer ensemble :
    //  - `color` sans `background-color` → le fond viendrait de l'e-mail de
    //    l'admin, dont ce fichier ne sait rien : rapport incalculable ;
    //  - `content` porteur de texte SANS `color` → la règle n'entre dans aucun
    //    filet ci-dessous, donc un futur libellé pourrait s'afficher dans la
    //    couleur héritée du document sans jamais être mesuré. C'est le cas que
    //    la promesse « couvert par construction » doit tenir.
    const carriesText = (rule: CssRule): boolean => {
      const content = rule.decls.get('content')
      return content !== undefined && content !== "''" && content !== '""'
    }
    const mustBeMeasured = CANVAS_RULES.filter(
      (rule) => rule.decls.has('color') || carriesText(rule),
    )
    expect(mustBeMeasured.length).toBeGreaterThan(0)
    for (const rule of mustBeMeasured) {
      expect(
        rule.decls.get('color'),
        `${rule.selector} : texte sans couleur déclarée — il échapperait à la mesure`,
      ).toBeDefined()
      expect(
        rule.decls.get('background-color'),
        `${rule.selector} : couleur de texte sans fond déclaré — contraste incalculable ici`,
      ).toBeDefined()
    }
  })

  it('chaque couple texte / fond atteint 4,5:1', () => {
    const measured = CANVAS_RULES.flatMap((rule) => {
      const color = rule.decls.get('color')
      const background = rule.decls.get('background-color')
      return color && background ? [{ selector: rule.selector, color, background }] : []
    })
    // Non-vacuité : un parseur qui ne renverrait rien rendrait la boucle
    // ci-dessous verte sans avoir mesuré quoi que ce soit.
    expect(measured.map((pair) => pair.selector)).toEqual(
      expect.arrayContaining(PILL_SELECTORS),
    )
    for (const { selector, color, background } of measured) {
      const ratio = contrastRatio(color, background)
      expect(
        ratio,
        `${selector} : ${color} sur ${background} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_TEXT_RATIO)
    }
  })

  it("chaque icône atteint 3:1 sur le fond qui l'entoure", () => {
    // L'icône de la pastille verte (zones éditables système) est son SEUL
    // contenu : aucun texte ne rattraperait un trait invisible. Elle est aussi
    // la plus juste des trois (3,30:1), d'où le compte EXACT ci-dessous : une
    // icône qui cesserait de matcher (hex à 3 chiffres, data-URI encodé
    // autrement) sortirait de la mesure sans faire tomber une simple borne.
    const measured = CANVAS_RULES.flatMap((rule) => {
      const stroke = rule.decls.get('background-image')?.match(/stroke='%23([0-9a-f]{6})'/i)
      const background = rule.decls.get('background-color')
      return stroke && background
        ? [{ selector: rule.selector, stroke: `#${stroke[1]}`, background }]
        : []
    })
    expect(measured.length, 'une icône a échappé à la mesure').toBe(ICON_RULE_COUNT)
    for (const { selector, stroke, background } of measured) {
      const ratio = contrastRatio(stroke, background)
      expect(
        ratio,
        `${selector} : trait ${stroke} sur ${background} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO)
    }
  })
})

// ============================================================================
// La provenance des couleurs du canvas est VÉRIFIÉE, pas affirmée (R13).
//
// Le canvas est un document e-mail : ni Tailwind ni les variables CSS du thème
// n'y sont disponibles, donc les couleurs s'y écrivent en littéral. Sans ce
// test, leur parenté avec le système de design n'est qu'une intention écrite
// dans un commentaire : un ajustement des tokens laisserait toute la suite
// verte et le canvas désaligné, sans un mot.
//
// Les deux provenances admises par R13 sont gardées séparément : les NEUTRES
// contre les tokens de `index.css`, les SIGNAUX contre les familles Tailwind
// que les composants `ui/` emploient déjà (`warning` → amber, `success` →
// green). Sans la seconde, « aucune couleur nouvelle » resterait une parole.
//
// Le thème CLAIR fait foi, délibérément : la cible de rendu est un e-mail, pas
// l'interface d'administration. Le bloc `.dark` de `index.css` redéfinit
// `--primary` en quasi-blanc — appliqué ici, il rendrait le texte des pastilles
// illisible sur leur fond clair.
// ============================================================================

/** Littéral du canvas → token `:root` dont il est la conversion. */
const CANVAS_NEUTRAL_BY_TOKEN: Record<string, string> = {
  '--muted': '#f4f4f5',
  '--border': '#e4e4e7',
  '--primary': '#18181b',
  '--muted-foreground': '#71717a',
  // Trait du crayon des zones éditables système.
  '--background': '#ffffff',
}

/** Littéral de signal → famille Tailwind employée par le `Badge` du DS. */
const CANVAS_SIGNAL_BY_FAMILY: Record<string, string> = {
  'amber-600': '#d97706',
  'green-600': '#16a34a',
}

/** Le `:root` du thème clair — `[^{}]*` garantit qu'on s'arrête au premier
 *  bloc, donc jamais sur le `.dark` ni sur le `:root` de media query. */
function lightThemeBlock(css: string): string {
  return css.match(/:root\s*\{([^{}]*)\}/)?.[1] ?? ''
}

function readToken(block: string, token: string): string {
  return block.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1]?.trim() ?? ''
}

/** Forme shadcn sans unités (`H S% L%`) → hexadécimal. */
function hslTokenToHex(token: string): string {
  const [h, s, l] = token.split(/\s+/).map((part) => Number.parseFloat(part))
  const saturation = s / 100
  const lightness = l / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const offsets: [number, number, number][] = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ]
  const sector = offsets[Math.floor((h % 360) / 60)]
  const base = lightness - chroma / 2
  return `#${sector
    .map((offset) => Math.round((offset + base) * 255).toString(16).padStart(2, '0'))
    .join('')}`
}

describe('signaux de canvas — parenté avec le système de design', () => {
  const lightTheme = lightThemeBlock(indexCss)

  it('le thème clair est bien lu, et le thème sombre bien écarté', () => {
    // Non-vacuité : un `index.css` restructuré (tokens déplacés dans un autre
    // sélecteur, par exemple) rendrait les assertions suivantes vertes à vide.
    expect(lightTheme).not.toBe('')
    for (const token of Object.keys(CANVAS_NEUTRAL_BY_TOKEN)) {
      expect(readToken(lightTheme, token), `${token} introuvable dans :root`).not.toBe('')
    }
    // Le `.dark` existe et diverge : c'est ce qui rend le choix du thème clair
    // significatif plutôt qu'accidentel.
    expect(indexCss).toContain('.dark {')
    expect(readToken(lightTheme, '--primary')).not.toBe('0 0% 98%')
  })

  /** Une couleur apparaît soit en clair (`#18181b`), soit percent-encodée dans
   *  un data-URI d'icône (`%23ffffff`) — les deux comptent comme « employée ». */
  const appearsInCanvas = (hex: string): boolean => {
    const sheets = `${LOCKED_SHELL_LABEL_CSS}${LOCKED_SHELL_SIGNAL_CSS}`
    return sheets.includes(hex) || sheets.includes(`%23${hex.slice(1)}`)
  }

  it('chaque neutre du canvas est la conversion exacte de son token', () => {
    for (const [token, hex] of Object.entries(CANVAS_NEUTRAL_BY_TOKEN)) {
      const converted = hslTokenToHex(readToken(lightTheme, token))
      expect(converted, `${token} = ${readToken(lightTheme, token)} → ${converted}`).toBe(hex)
      // Et le littéral est bien celui qu'emploie le canvas, pas une valeur morte
      // recopiée ici.
      expect(
        appearsInCanvas(hex),
        `${hex} (${token}) absent des feuilles du canvas`,
      ).toBe(true)
    }
  })

  it('chaque signal du canvas est exactement la famille Tailwind annoncée', () => {
    // `warning` et `success` du `Badge` (bg-amber-*, bg-green-*) : le canvas en
    // reprend le ton 600. Comparé à la palette elle-même, sinon « aucune
    // couleur nouvelle » n'est qu'une affirmation de commentaire.
    for (const [family, hex] of Object.entries(CANVAS_SIGNAL_BY_FAMILY)) {
      const [name, shade] = family.split('-')
      const palette = (tailwindColors as unknown as Record<string, Record<string, string>>)[name]
      expect(palette?.[shade], `famille Tailwind ${family} introuvable`).toBeDefined()
      expect(palette[shade], `${family} vaut ${palette[shade]}, le canvas pose ${hex}`).toBe(hex)
      expect(
        appearsInCanvas(hex),
        `${hex} (${family}) absent des feuilles du canvas`,
      ).toBe(true)
    }
  })
})
