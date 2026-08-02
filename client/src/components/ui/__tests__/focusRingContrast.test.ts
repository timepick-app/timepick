import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// La palette Tailwind elle-même : la seule référence qui rende vérifiable
// « #fafafa EST zinc-50 » plutôt que simplement affirmé (même provenance que
// email-editor/__tests__/lockedShellSignalCss.test.ts).
import tailwindColors from 'tailwindcss/colors'

// ============================================================================
// Contraste de l'anneau de focus CALCULÉ depuis les fichiers sources, jamais
// apprécié sur une capture. Pour un bouton icône-seule (`size="icon"`), cet
// anneau est le SEUL repère de focus visible — WCAG 1.4.11 (non-text
// contrast), seuil 3:1.
//
// Mesuré sur le jeton `--ring` (index.css :root, thème clair) tel qu'il est
// RÉELLEMENT composé par les classes focus de Button et Select : si l'un ou
// l'autre réintroduit une opacité réduite (`ring-ring/50`) ou que le jeton
// est réclairci, ce fichier rougit — la mesure part du code, pas d'un
// littéral recopié qui se désynchroniserait en silence.
// ============================================================================

/** WCAG 1.4.11 — objet graphique porteur d'information (ici : l'anneau). */
const AA_NON_TEXT_RATIO = 3

// import.meta.dirname → client/src/components/ui/__tests__
const indexCss = readFileSync(resolve(import.meta.dirname, '..', '..', '..', 'index.css'), 'utf8')
const buttonSource = readFileSync(resolve(import.meta.dirname, '..', 'button.tsx'), 'utf8')
const selectSource = readFileSync(resolve(import.meta.dirname, '..', 'select.tsx'), 'utf8')

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

/** Le `:root` du thème clair — `[^{}]*` garantit qu'on s'arrête au premier
 *  bloc, donc jamais sur le `.dark` ni sur le `:root` de media query. */
function lightThemeBlock(css: string): string {
  return css.match(/:root\s*\{([^{}]*)\}/)?.[1] ?? ''
}

function readToken(block: string, token: string): string {
  return block.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1]?.trim() ?? ''
}

/** Alpha-blend d'une couleur `fg` (opacité `alpha`, 0–1) sur un fond `bg`. */
function compositeOver(fgHex: string, alpha: number, bgHex: string): string {
  const fg = Number.parseInt(fgHex.slice(1), 16)
  const bg = Number.parseInt(bgHex.slice(1), 16)
  const channel = (shift: number) => {
    const f = (fg >> shift) & 0xff
    const b = (bg >> shift) & 0xff
    return Math.round(f * alpha + b * (1 - alpha))
  }
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Opacité RÉELLEMENT appliquée à `ring-ring` par une classe focus
 * (`ring-ring` = pleine opacité, `ring-ring/50` = 50 %). Une classe absente
 * échoue explicitement (non-vacuité) plutôt que de mesurer silencieusement
 * une opacité par défaut inventée.
 */
function ringOpacity(source: string, utility: 'focus-visible' | 'focus'): number {
  const match = source.match(new RegExp(`${utility}:ring-ring(\\/(\\d+))?\\b`))
  if (!match) throw new Error(`aucune classe ${utility}:ring-ring trouvée`)
  return match[2] ? Number.parseInt(match[2], 10) / 100 : 1
}

const lightTheme = lightThemeBlock(indexCss)
const ringToken = readToken(lightTheme, '--ring')
const ringHex = hslTokenToHex(ringToken)
const backgroundHex = hslTokenToHex(readToken(lightTheme, '--background'))

// Fonds de référence : zinc-50 = toolbar de l'éditeur d'e-mails (bg-zinc-50) ;
// --background (thème clair) = blanc.
const ZINC_50 = tailwindColors.zinc[50]

describe('anneau de focus — contraste CALCULÉ, pas apprécié (WCAG 1.4.11)', () => {
  it('le jeton --ring (thème clair) est bien lu depuis index.css', () => {
    expect(ringToken).not.toBe('')
    expect(ringHex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('--background (thème clair) se résout bien en blanc', () => {
    expect(backgroundHex).toBe('#ffffff')
  })

  it('Button : `focus-visible:ring-ring` est en pleine opacité (pas `/50`)', () => {
    expect(ringOpacity(buttonSource, 'focus-visible')).toBe(1)
  })

  it('Select : `focus:ring-ring` est en pleine opacité (pas `/50`)', () => {
    expect(ringOpacity(selectSource, 'focus')).toBe(1)
  })

  it('Button : anneau composité ≥ 3:1 sur zinc-50 (toolbar) et sur blanc', () => {
    const alpha = ringOpacity(buttonSource, 'focus-visible')
    for (const bg of [ZINC_50, backgroundHex]) {
      const composited = compositeOver(ringHex, alpha, bg)
      const ratio = contrastRatio(composited, bg)
      expect(
        ratio,
        `--ring ${ringToken} (${ringHex}) à ${alpha * 100}% sur ${bg} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO)
    }
  })

  it('Select : anneau composité ≥ 3:1 sur zinc-50 et sur blanc', () => {
    const alpha = ringOpacity(selectSource, 'focus')
    for (const bg of [ZINC_50, backgroundHex]) {
      const composited = compositeOver(ringHex, alpha, bg)
      const ratio = contrastRatio(composited, bg)
      expect(
        ratio,
        `--ring ${ringToken} (${ringHex}) à ${alpha * 100}% sur ${bg} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO)
    }
  })
})
