import { describe, it, expect } from 'vitest'
import {
  sanitizeRichHtml,
  isLikelyHtml,
  plainTextToSafeHtml,
  normalizeStoredDescription,
  htmlToPlainText,
  isRichTextEmpty,
  flattenToLineBreaks,
} from '../richText'

// ---------------------------------------------------------------------------
// sanitizeRichHtml — sécurité critique
// ---------------------------------------------------------------------------
describe('sanitizeRichHtml', () => {
  it('conserve les balises autorisées : <strong>', () => {
    const out = sanitizeRichHtml('<p><strong>texte</strong></p>')
    expect(out).toContain('<strong>')
    expect(out).toContain('texte')
  })

  it('conserve <em>', () => {
    const out = sanitizeRichHtml('<p><em>italique</em></p>')
    expect(out).toContain('<em>')
  })

  it('conserve un lien https valide avec href', () => {
    const out = sanitizeRichHtml('<a href="https://x.com">lien</a>')
    expect(out).toContain('href="https://x.com"')
    expect(out).toContain('lien')
  })

  it('supprime <script>', () => {
    const out = sanitizeRichHtml('<p>ok</p><script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert')
    expect(out).toContain('ok')
  })

  it("supprime l'attribut onclick", () => {
    const out = sanitizeRichHtml('<p onclick="alert(1)">texte</p>')
    expect(out).not.toContain('onclick')
  })

  it("supprime l'attribut onerror", () => {
    const out = sanitizeRichHtml('<img src="x" onerror="alert(1)">')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('<img')
  })

  it('supprime <img> (hors allowlist)', () => {
    const out = sanitizeRichHtml('<img src="https://evil.com/x.png" />')
    expect(out).not.toContain('<img')
  })

  it('bloque un lien javascript: (href retiré ou balise supprimée)', () => {
    const out = sanitizeRichHtml('<a href="javascript:alert(1)">xss</a>')
    expect(out).not.toMatch(/href\s*=\s*["']?javascript:/i)
    // Soit le href est retiré, soit la balise entière est supprimée
  })

  it("bloque un lien data: (hors schémas http/https)", () => {
    const out = sanitizeRichHtml('<a href="data:text/html,<script>alert(1)</script>">xss</a>')
    expect(out).not.toMatch(/href\s*=\s*["']?data:/i)
  })

  it('ajoute rel="noopener noreferrer" sur target="_blank"', () => {
    const out = sanitizeRichHtml('<a href="https://x.com" target="_blank">lien</a>')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('ajoute rel sur un lien target=_blank même sans rel initial', () => {
    const out = sanitizeRichHtml('<a href="https://example.com" target="_blank">go</a>')
    expect(out).toMatch(/rel=["']noopener noreferrer["']/)
  })

  it('retourne une chaîne vide sur une entrée vide', () => {
    expect(sanitizeRichHtml('')).toBe('')
  })

  it('supprime les balises inconnues (<div>, <span>)', () => {
    const out = sanitizeRichHtml('<div><span>texte</span></div>')
    expect(out).not.toContain('<div')
    expect(out).not.toContain('<span')
    expect(out).toContain('texte')
  })

  it("supprime l'attribut style (hors allowlist)", () => {
    const out = sanitizeRichHtml('<p style="color:red">rouge</p>')
    expect(out).not.toContain('style=')
    expect(out).toContain('rouge')
  })

  it('supprime <iframe>', () => {
    const out = sanitizeRichHtml('<iframe src="https://evil.com"></iframe>')
    expect(out).not.toContain('<iframe')
  })

  it('conserve <br>', () => {
    const out = sanitizeRichHtml('<p>ligne1<br>ligne2</p>')
    expect(out).toMatch(/<br\s*\/?>/)
  })
})

// ---------------------------------------------------------------------------
// isLikelyHtml
// ---------------------------------------------------------------------------
describe('isLikelyHtml', () => {
  it("retourne true pour '<p>x</p>'", () => {
    expect(isLikelyHtml('<p>x</p>')).toBe(true)
  })

  it("retourne true pour '<strong>gras'", () => {
    expect(isLikelyHtml('<strong>gras')).toBe(true)
  })

  it("retourne true pour '<em>it</em>'", () => {
    expect(isLikelyHtml('<em>it</em>')).toBe(true)
  })

  it("retourne true pour '<a href=\"...\">lien</a>'", () => {
    expect(isLikelyHtml('<a href="https://x.com">lien</a>')).toBe(true)
  })

  it("retourne true pour '<br>'", () => {
    expect(isLikelyHtml('<br>')).toBe(true)
  })

  it("retourne false pour du texte brut", () => {
    expect(isLikelyHtml('Texte brut sans balises')).toBe(false)
  })

  it("pas de faux positif sur '5 < 10 and 3 > 2'", () => {
    // Comparaisons arithmétiques ne contiennent pas les balises de l'allowlist
    expect(isLikelyHtml('5 < 10 and 3 > 2')).toBe(false)
  })

  it("pas de faux positif sur '<unknown>'", () => {
    // Balise inconnue non listée dans l'allowlist
    expect(isLikelyHtml('<div>contenu</div>')).toBe(false)
  })

  it("retourne false pour une chaîne vide", () => {
    expect(isLikelyHtml('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// plainTextToSafeHtml
// ---------------------------------------------------------------------------
describe('plainTextToSafeHtml', () => {
  it('échappe < en &lt;', () => {
    const out = plainTextToSafeHtml('a < b')
    expect(out).toContain('&lt;')
    expect(out).not.toContain('<b')
  })

  it('échappe & en &amp;', () => {
    const out = plainTextToSafeHtml('AT&T')
    expect(out).toContain('&amp;')
    expect(out).not.toContain('&T')
  })

  it('convertit un simple \\n en <br>', () => {
    const out = plainTextToSafeHtml('ligne1\nligne2')
    expect(out).toContain('<br>')
    expect(out).toContain('ligne1')
    expect(out).toContain('ligne2')
  })

  it('convertit une ligne vide (\\n\\n) en <br><br> dans un seul <p>', () => {
    expect(plainTextToSafeHtml('para1\n\npara2')).toBe('<p>para1<br><br>para2</p>')
  })

  it("retourne '' pour une chaîne vide", () => {
    expect(plainTextToSafeHtml('')).toBe('')
  })

  it('encapsule le texte dans un <p>', () => {
    const out = plainTextToSafeHtml('bonjour')
    expect(out).toBe('<p>bonjour</p>')
  })

  it('échappe > en &gt;', () => {
    const out = plainTextToSafeHtml('a > b')
    expect(out).toContain('&gt;')
  })

  it('échappe les guillemets doubles', () => {
    const out = plainTextToSafeHtml('"citation"')
    expect(out).toContain('&quot;')
  })
})

// ---------------------------------------------------------------------------
// normalizeStoredDescription
// ---------------------------------------------------------------------------
describe('normalizeStoredDescription', () => {
  it("retourne '' pour null", () => {
    expect(normalizeStoredDescription(null)).toBe('')
  })

  it("retourne '' pour undefined", () => {
    expect(normalizeStoredDescription(undefined)).toBe('')
  })

  it("retourne '' pour une chaîne vide", () => {
    expect(normalizeStoredDescription('')).toBe('')
  })

  it('sanitise le HTML en entrée (conserve <strong>)', () => {
    const out = normalizeStoredDescription('<p><strong>gras</strong></p>')
    expect(out).toContain('<strong>')
  })

  it('supprime <script> dans un HTML stocké', () => {
    const out = normalizeStoredDescription('<p>ok<script>alert(1)</script></p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert')
  })

  it("convertit le texte brut legacy avec \\n en HTML structuré", () => {
    const out = normalizeStoredDescription('ligne1\nligne2')
    // Le texte brut doit être converti ; <br> attendu
    expect(out).toContain('<br>')
    expect(out).toContain('ligne1')
    expect(out).toContain('ligne2')
  })

  it('convertit une ligne vide en <br><br> dans un seul <p>', () => {
    expect(normalizeStoredDescription('para1\n\npara2')).toBe('<p>para1<br><br>para2</p>')
  })

  it('traite une chaîne HTML comme du HTML (pas de double-conversion)', () => {
    // Une valeur HTML valide doit rester du HTML, pas être ré-encodée
    const input = '<p>simple</p>'
    const out = normalizeStoredDescription(input)
    expect(out).toContain('simple')
    expect(out).not.toContain('&lt;p&gt;')
  })
})

// ---------------------------------------------------------------------------
// htmlToPlainText
// ---------------------------------------------------------------------------
describe('htmlToPlainText', () => {
  it("retourne '' pour null", () => {
    expect(htmlToPlainText(null)).toBe('')
  })

  it("retourne '' pour une chaîne vide", () => {
    expect(htmlToPlainText('')).toBe('')
  })

  it("extrait le texte de '<p>A</p><p>B</p>' avec espace entre blocs", () => {
    const out = htmlToPlainText('<p>A</p><p>B</p>')
    expect(out).toBe('A B')
  })

  it('supprime les balises HTML', () => {
    const out = htmlToPlainText('<strong>texte</strong>')
    expect(out).toBe('texte')
    expect(out).not.toContain('<')
  })

  it('décode &amp;', () => {
    const out = htmlToPlainText('<p>AT&amp;T</p>')
    expect(out).toContain('AT&T')
    expect(out).not.toContain('&amp;')
  })

  it('décode &lt; et &gt;', () => {
    const out = htmlToPlainText('<p>a &lt; b &gt; c</p>')
    expect(out).toContain('a < b > c')
  })

  it('retourne le texte sans espaces superflus', () => {
    const out = htmlToPlainText('<p>  texte  </p>')
    expect(out.trim()).toBe('texte')
  })

  it('gère un seul paragraphe sans espace parasite', () => {
    const out = htmlToPlainText('<p>bonjour</p>')
    expect(out).toBe('bonjour')
  })
})

// ---------------------------------------------------------------------------
// isRichTextEmpty
// ---------------------------------------------------------------------------
describe('isRichTextEmpty', () => {
  it('retourne true pour null', () => {
    expect(isRichTextEmpty(null)).toBe(true)
  })

  it("retourne true pour ''", () => {
    expect(isRichTextEmpty('')).toBe(true)
  })

  it("retourne true pour '<p></p>' (paragraphe vide Tiptap)", () => {
    expect(isRichTextEmpty('<p></p>')).toBe(true)
  })

  it("retourne true pour '<p><br></p>'", () => {
    expect(isRichTextEmpty('<p><br></p>')).toBe(true)
  })

  it("retourne true pour du HTML avec seulement des espaces/&nbsp;", () => {
    expect(isRichTextEmpty('<p>&nbsp;</p>')).toBe(true)
  })

  it("retourne false pour '<p>hi</p>'", () => {
    expect(isRichTextEmpty('<p>hi</p>')).toBe(false)
  })

  it("retourne false pour du texte sans balises", () => {
    expect(isRichTextEmpty('bonjour')).toBe(false)
  })

  it("retourne false pour '<p><strong>gras</strong></p>'", () => {
    expect(isRichTextEmpty('<p><strong>gras</strong></p>')).toBe(false)
  })

  it('retourne true pour undefined', () => {
    expect(isRichTextEmpty(undefined)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// flattenToLineBreaks — modèle « retour = <br> » (remarque UX #2)
// ---------------------------------------------------------------------------

describe('flattenToLineBreaks', () => {
  it('aplatit des paragraphes en un seul <p> à base de <br>', () => {
    expect(flattenToLineBreaks('<p>A</p><p>B</p>')).toBe('<p>A<br>B</p>')
  })

  it('transforme un paragraphe vide en ligne vide (<br><br>)', () => {
    expect(flattenToLineBreaks('<p>A</p><p></p><p>B</p>')).toBe('<p>A<br><br>B</p>')
  })

  it('plafonne à 2 les <br> issus de paragraphes vides multiples', () => {
    expect(flattenToLineBreaks('<p>A</p><p></p><p></p><p>B</p>')).toBe('<p>A<br><br>B</p>')
  })

  it('idempotent sur un contenu déjà à base de <br>', () => {
    expect(flattenToLineBreaks('<p>A<br>B</p>')).toBe('<p>A<br>B</p>')
  })

  it('chaîne vide => chaîne vide', () => {
    expect(flattenToLineBreaks('')).toBe('')
  })
})

describe('normalizeStoredDescription — modèle <br>', () => {
  it('aplatit les paragraphes stockés en <br> et plafonne à 2', () => {
    expect(normalizeStoredDescription('<p>A</p><p></p><p></p><p>B</p>')).toBe('<p>A<br><br>B</p>')
  })

  it('préserve le nombre de <br> existant (1:1) sous le plafond', () => {
    expect(normalizeStoredDescription('<p>A<br>B<br><br>C</p>')).toBe('<p>A<br>B<br><br>C</p>')
  })
})
