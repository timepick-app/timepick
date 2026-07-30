import { describe, it, expect } from 'vitest'
import {
  sanitizeRichHtml,
  isLikelyHtml,
  plainTextToSafeHtml,
  normalizeStoredDescription,
  htmlToPlainText,
  isRichTextEmpty,
  flattenToLineBreaks,
  pastedHtmlToLineBreakHtml,
  pastedTextToLineBreakHtml,
  isSameRichText,
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
  it('conserve la séparation des paragraphes en ligne vide (<br><br>)', () => {
    // Un <br> unique collerait les deux blocs — la ligne vide de l'auteur est
    // exactement ce que le collage doit préserver.
    expect(flattenToLineBreaks('<p>A</p><p>B</p>')).toBe('<p>A<br><br>B</p>')
  })

  it('aplatit trois paragraphes en un seul <p>', () => {
    expect(flattenToLineBreaks('<p>A</p><p>B</p><p>C</p>')).toBe('<p>A<br><br>B<br><br>C</p>')
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

  /**
   * MIROIR CLIENT/SERVEUR — table jumelle de
   * `server/src/__tests__/unit/sanitize-rich-text.mirror.test.ts`.
   *
   * `sanitizeRichText` (serveur) ré-aplatit CHAQUE écriture. Si les deux
   * implémentations divergent d'un seul `<br>`, le client affiche une ligne
   * vide que le serveur efface au save suivant — panne silencieuse et
   * destructrice, déjà survenue. Les deux tables DOIVENT rester identiques :
   * toute entrée ajoutée ici doit l'être là-bas, avec la même attente.
   *
   * Seule différence connue et VOULUE, donc hors table : une entrée sans aucun
   * `<p>` ressort nue côté serveur (`hadParagraph`) et enveloppée ici.
   */
  it.each([
    ['<p>A</p><p>B</p>', '<p>A<br><br>B</p>'],
    ['<p>A</p><p></p><p>B</p>', '<p>A<br><br>B</p>'],
    ['<p>A</p><p></p><p></p><p></p><p>B</p>', '<p>A<br><br>B</p>'],
    ['<p>A</p><p>B</p><p>C</p>', '<p>A<br><br>B<br><br>C</p>'],
    ['<p>A<br>B</p>', '<p>A<br>B</p>'],
    ['<p>A<br><br><br>B</p>', '<p>A<br><br>B</p>'],
    ['<p>A</p> <p>B</p>', '<p>A<br><br>B</p>'],
    ['<p><strong>A</strong></p><p><em>B</em></p>', '<p><strong>A</strong><br><br><em>B</em></p>'],
    ['<p>A</p>', '<p>A</p>'],
    ['<p></p>', ''],
  ])('miroir serveur : %s => %s', (input, expected) => {
    expect(flattenToLineBreaks(input)).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// pastedTextToLineBreakHtml — collage de TEXTE BRUT (presse-papiers sans HTML)
// ---------------------------------------------------------------------------

describe('pastedTextToLineBreakHtml', () => {
  it('convertit une ligne vide en <br><br> dans un seul <p>', () => {
    expect(pastedTextToLineBreakHtml('para1\n\npara2')).toBe('<p>para1<br><br>para2</p>')
  })

  it('convertit un simple retour en un seul <br>', () => {
    expect(pastedTextToLineBreakHtml('ligne1\nligne2')).toBe('<p>ligne1<br>ligne2</p>')
  })

  it('plafonne à 2 les retours consécutifs', () => {
    expect(pastedTextToLineBreakHtml('A\n\n\n\nB')).toBe('<p>A<br><br>B</p>')
  })

  it('gère les fins de ligne Windows (CRLF)', () => {
    expect(pastedTextToLineBreakHtml('A\r\n\r\nB')).toBe('<p>A<br><br>B</p>')
  })

  it('convertit un « \\r » seul (ancien Mac) en <br>', () => {
    // Sans normalisation, le `\r` survit jusqu'au DOM qui le rend en espace :
    // le saut voulu disparaît silencieusement.
    expect(pastedTextToLineBreakHtml('A\rB')).toBe('<p>A<br>B</p>')
  })

  it('convertit les fins de ligne Unicode (U+2028, U+2029, NEL) en <br>', () => {
    // Récoltées en copiant depuis un PDF ou Word. Laissées telles quelles, le
    // navigateur les affiche comme un saut mais htmlToPlainText les compte
    // comme une espace : deux vérités pour un même contenu.
    expect(pastedTextToLineBreakHtml('A\u2028B')).toBe('<p>A<br>B</p>')
    expect(pastedTextToLineBreakHtml('A\u2029B')).toBe('<p>A<br>B</p>')
    expect(pastedTextToLineBreakHtml('A\u0085B')).toBe('<p>A<br>B</p>')
  })

  it('retire le retour final (copier un paragraphe embarque son \\n)', () => {
    expect(pastedTextToLineBreakHtml('A\n')).toBe('<p>A</p>')
    expect(pastedTextToLineBreakHtml('A\n\n')).toBe('<p>A</p>')
  })

  it('retire aussi le retour de tête (symétrie avec le chemin HTML)', () => {
    expect(pastedTextToLineBreakHtml('\n\nA')).toBe('<p>A</p>')
    expect(pastedTextToLineBreakHtml('\nA')).toBe('<p>A</p>')
  })

  it('entrée faite de retours seuls => chaîne vide', () => {
    expect(pastedTextToLineBreakHtml('\n\n')).toBe('')
  })

  it('préserve les espaces de bord (collage au milieu d\'une phrase)', () => {
    expect(pastedTextToLineBreakHtml(' suite ')).toBe('<p> suite </p>')
  })

  it('échappe le HTML du presse-papiers', () => {
    expect(pastedTextToLineBreakHtml('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    )
  })

  it('chaîne vide => chaîne vide', () => {
    expect(pastedTextToLineBreakHtml('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// pastedHtmlToLineBreakHtml — collage de HTML (site web, Word, Notion, Slack)
// ---------------------------------------------------------------------------

describe('pastedHtmlToLineBreakHtml', () => {
  it('convertit une frontière de <p> en ligne vide', () => {
    expect(pastedHtmlToLineBreakHtml('<p>AAA</p><p>BBB</p>')).toBe('<p>AAA<br><br>BBB</p>')
  })

  it('aplatit les <div> d\'un site web ou de Slack (pas de <p> dans le presse-papiers)', () => {
    // Sans ce traitement, les <div> survivaient : le parseur ressortait un
    // paragraphe vide parasite en tête puis deux blocs collés.
    expect(pastedHtmlToLineBreakHtml('<div>AAA</div><div>BBB</div>')).toBe(
      '<p>AAA<br><br>BBB</p>'
    )
  })

  it('aplatit les titres', () => {
    expect(pastedHtmlToLineBreakHtml('<h1>Titre</h1><h2>Sous-titre</h2>')).toBe(
      '<p>Titre<br><br>Sous-titre</p>'
    )
  })

  it('aplatit une liste en lignes', () => {
    expect(pastedHtmlToLineBreakHtml('<ul><li>un</li><li>deux</li></ul>')).toBe(
      '<p>un<br><br>deux</p>'
    )
  })

  it('ne laisse aucune ligne vide de bord', () => {
    expect(pastedHtmlToLineBreakHtml('<div>seul</div>')).toBe('<p>seul</p>')
  })

  it('préserve les marques inline (gras, italique, lien)', () => {
    expect(
      pastedHtmlToLineBreakHtml('<p><strong>gras</strong> et <a href="https://ex.com">lien</a></p>')
    ).toBe('<p><strong>gras</strong> et <a href="https://ex.com">lien</a></p>')
  })

  it('laisse un fragment inline intact (collage au milieu d\'une phrase)', () => {
    expect(pastedHtmlToLineBreakHtml('<em>suite</em>')).toBe('<p><em>suite</em></p>')
  })

  it('ne touche pas aux <br> déjà présents, et les plafonne à 2', () => {
    expect(pastedHtmlToLineBreakHtml('<p>A<br>B<br><br><br>C</p>')).toBe(
      '<p>A<br>B<br><br>C</p>'
    )
  })

  it('chaîne vide => chaîne vide', () => {
    expect(pastedHtmlToLineBreakHtml('')).toBe('')
  })

  it('HTML sans texte => chaîne vide', () => {
    expect(pastedHtmlToLineBreakHtml('<div></div>')).toBe('')
  })

  // --- Régressions : nœuds commentaire du presse-papiers réel --------------

  it('ignore l\'emballage <!--StartFragment--> de Chromium et Firefox', () => {
    // Forme RÉELLE d'un presse-papiers navigateur. Les commentaires n'étant pas
    // des éléments, ils faisaient échouer le rognage des bords (ancré ^/$) et
    // tout collage gagnait une ligne vide en tête et en queue.
    expect(
      pastedHtmlToLineBreakHtml(
        "<meta charset='utf-8'><!--StartFragment--><p>A</p><p>B</p><!--EndFragment-->"
      )
    ).toBe('<p>A<br><br>B</p>')
  })

  it('respecte le plafond de 2 malgré un commentaire entre deux blocs', () => {
    // Le commentaire séparait deux séries de <br> que le plafond ne pouvait
    // plus fusionner : 4 sauts consécutifs passaient.
    expect(pastedHtmlToLineBreakHtml('<p>A</p><!--x--><p>B</p>')).toBe('<p>A<br><br>B</p>')
  })

  it('HTML réduit à un commentaire => chaîne vide', () => {
    expect(pastedHtmlToLineBreakHtml('<!--rien-->')).toBe('')
  })

  // --- Régressions : éléments inline ---------------------------------------

  it('un inline VIDE entre deux blocs ne fait pas passer 4 sauts', () => {
    // Même piège que le commentaire : intercalé entre deux séries de <br>, il
    // empêchait le plafond de les fusionner.
    expect(pastedHtmlToLineBreakHtml('<p>A</p><span></span><p>B</p>')).toBe('<p>A<br><br>B</p>')
    expect(pastedHtmlToLineBreakHtml('<p>A</p><wbr><p>B</p>')).toBe('<p>A<br><br>B</p>')
    expect(pastedHtmlToLineBreakHtml('<p>A</p><a href="x"></a><p>B</p>')).toBe(
      '<p>A<br><br>B</p>'
    )
  })

  it('un inline PORTEUR entre deux blocs garde ses deux frontières', () => {
    expect(pastedHtmlToLineBreakHtml('<p>A</p><span>x</span><p>B</p>')).toBe(
      '<p>A<br><br><span>x</span><br><br>B</p>'
    )
  })

  it('préserve un <br> emballé dans un inline vide de texte', () => {
    // Le rognage des inlines inertes ne doit pas emporter un saut d'auteur.
    expect(pastedHtmlToLineBreakHtml('<p>A<span><br></span>B</p>')).toBe(
      '<p>A<span><br></span>B</p>'
    )
  })

  it('n\'éclate pas une phrase sur du contenu phrasé (del, ins, label, ruby)', () => {
    // Traités en frontière de bloc, ils inséraient une ligne vide autour de
    // chaque balise : « a », ligne vide, « b », ligne vide, « c ».
    expect(pastedHtmlToLineBreakHtml('<p>a<del>b</del>c</p>')).toBe('<p>a<del>b</del>c</p>')
    expect(pastedHtmlToLineBreakHtml('<p>a<ins>b</ins>c</p>')).toBe('<p>a<ins>b</ins>c</p>')
    expect(pastedHtmlToLineBreakHtml('<p>a<label>b</label>c</p>')).toBe(
      '<p>a<label>b</label>c</p>'
    )
    expect(pastedHtmlToLineBreakHtml('<p>a<ruby>b<rt>c</rt></ruby>d</p>')).toBe(
      '<p>a<ruby>b<rt>c</rt></ruby>d</p>'
    )
  })

  it('n\'éclate pas une phrase sur les balises de présentation de Word', () => {
    expect(pastedHtmlToLineBreakHtml('<p>a<tt>b</tt><big>c</big><strike>d</strike>e</p>')).toBe(
      '<p>a<tt>b</tt><big>c</big><strike>d</strike>e</p>'
    )
  })

  // --- Régressions : ce que l'approche regex laissait fuir -----------------

  it('ne fait pas fuir un attribut contenant un « > » (défaut de l\'ancien [^>]*>)', () => {
    expect(pastedHtmlToLineBreakHtml('<div title="a>b">X</div><div>Y</div>')).toBe(
      '<p>X<br><br>Y</p>'
    )
  })

  it('jette le bloc <style> que Word et Excel embarquent toujours', () => {
    expect(pastedHtmlToLineBreakHtml('<style>p{color:red}</style><p>X</p><p>Y</p>')).toBe(
      '<p>X<br><br>Y</p>'
    )
  })

  it('jette le contenu de <script>', () => {
    expect(pastedHtmlToLineBreakHtml('<script>alert(1)</script><p>X</p>')).toBe('<p>X</p>')
  })

  it('ne colle pas les mots d\'une balise hors liste (<details>/<summary>)', () => {
    expect(pastedHtmlToLineBreakHtml('<details><summary>S</summary>corps</details>')).toBe(
      '<p>S<br><br>corps</p>'
    )
  })

  it('traite un élément inconnu comme un bloc (liste inversée, pas de rattrapage)', () => {
    expect(pastedHtmlToLineBreakHtml('<x-card>A</x-card><x-card>B</x-card>')).toBe(
      '<p>A<br><br>B</p>'
    )
  })

  it('aplatit les blocs imbriqués sans ligne vide surnuméraire', () => {
    expect(pastedHtmlToLineBreakHtml('<div><div>A</div><div>B</div></div>')).toBe(
      '<p>A<br><br>B</p>'
    )
  })

  it('aplatit une cellule de tableau avec sa légende', () => {
    expect(
      pastedHtmlToLineBreakHtml('<table><caption>Cap</caption><tr><td>A</td></tr></table>')
    ).toBe('<p>Cap<br><br>A</p>')
  })

  it('ignore le <meta charset> que Chromium préfixe au presse-papiers', () => {
    expect(pastedHtmlToLineBreakHtml("<meta charset='utf-8'><p>A</p><p>B</p>")).toBe(
      '<p>A<br><br>B</p>'
    )
  })

  it('échappe le texte, jamais de balise inventée en sortie', () => {
    expect(pastedHtmlToLineBreakHtml('<p>5 &lt; 10 &amp; 3 &gt; 2</p>')).toBe(
      '<p>5 &lt; 10 &amp; 3 &gt; 2</p>'
    )
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

// ---------------------------------------------------------------------------
// isSameRichText — « ces deux écritures désignent-elles le même contenu ? »
//
// C'est le prédicat qui décide « rien n'a changé » (étape organisation du
// wizard) et « le serveur confirme ce que le formulaire affiche » (garde de
// resync du panneau admin). Chaque cas ci-dessous est une orthographe que
// l'éditeur et la base peuvent porter simultanément pour un même contenu.
// Dettes W1 et W2 de la revue « étape organisation ».
// ---------------------------------------------------------------------------
describe('isSameRichText', () => {
  it("reconnaît l'éditeur vidé et la chaîne vide comme identiques (W1)", () => {
    expect(isSameRichText('<p></p>', '')).toBe(true)
  })

  it("reconnaît un paragraphe réduit à un <br> comme vide (une Entrée dans un éditeur vierge)", () => {
    expect(isSameRichText('<p><br></p>', '')).toBe(true)
  })

  it('traite null et undefined comme la chaîne vide', () => {
    expect(isSameRichText(null, undefined)).toBe(true)
    expect(isSameRichText(undefined, '<p></p>')).toBe(true)
  })

  it('reconnaît une description seedée en texte brut et le HTML que l\'éditeur en fait (W2)', () => {
    expect(isSameRichText('Plateforme de participation', '<p>Plateforme de participation</p>')).toBe(
      true
    )
  })

  it("reconnaît un texte brut à apostrophe : &#39; et ' désignent le même caractère", () => {
    // `plainTextToSafeHtml` échappe l'apostrophe, Tiptap la laisse brute. Sans
    // ré-sérialisation des deux côtés, toute description française resterait
    // « différente » d'elle-même — et l'écriture inutile de W2 survivrait.
    expect(isSameRichText("L'asso & co", "<p>L'asso &amp; co</p>")).toBe(true)
  })

  it('reconnaît un texte brut multi-lignes et sa forme aplatie en <br>', () => {
    expect(isSameRichText('ligne1\nligne2', '<p>ligne1<br>ligne2</p>')).toBe(true)
  })

  it('est insensible au plafond de <br> déjà appliqué par le serveur', () => {
    expect(isSameRichText('<p>A<br><br><br>B</p>', '<p>A<br><br>B</p>')).toBe(true)
  })

  // ── Garde-fous : le prédicat doit rester STRICT sur tout changement visible.
  // Sans eux, un `return true` constant passerait la moitié de cette suite.
  it('distingue deux contenus différents', () => {
    expect(isSameRichText('<p>A</p>', '<p>B</p>')).toBe(false)
  })

  it('distingue un contenu vide d\'un contenu réel', () => {
    expect(isSameRichText('', '<p>A</p>')).toBe(false)
  })

  it('distingue un changement de mise en forme', () => {
    expect(isSameRichText('<p>A</p>', '<p><strong>A</strong></p>')).toBe(false)
  })

  it('distingue un saut de ligne ajouté', () => {
    expect(isSameRichText('<p>A<br>B</p>', '<p>AB</p>')).toBe(false)
  })

  it("distingue un lien ajouté sur le même texte", () => {
    expect(
      isSameRichText('<p>lien</p>', '<p><a href="https://x.com">lien</a></p>')
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Sortie réelle de Tiptap — MESURÉE, pas supposée.
//
// Protocole (2026-07-29, instance de dev, Chromium headless) : saisie dans le
// vrai éditeur du panneau admin, clic sur Enregistrer, lecture du corps de la
// requête `PUT /api/admin/settings/organization`. Le DOM de ProseMirror n'est
// PAS un substitut valable (il porte `<br class="ProseMirror-trailingBreak">`
// que `getHTML()` n'émet pas).
//
// Ces chaînes verrouillent l'hypothèse sur laquelle repose `isSameRichText` :
// l'éditeur n'émet qu'UN paragraphe, à base de `<br>`, plafonné à 2. Si une
// évolution de la config Tiptap la casse, c'est ici que ça doit échouer.
// ---------------------------------------------------------------------------
describe('formes réellement émises par Tiptap', () => {
  // Clavier : « L'asso & co ». L'apostrophe part BRUTE, `&` est échappé —
  // c'est ce qui rend la passe de ré-sérialisation obligatoire, `plainTextToSafeHtml`
  // écrivant `&#39;` pour la même apostrophe.
  const SAISIE_APOSTROPHE = "<p>L'asso &amp; co</p>"
  // Deux Entrées consécutives (extension maison `LineBreakOnly`).
  const DEUX_ENTREES = '<p>A<br><br>B</p>'
  // Collage de `<p>Para un</p><p>Para deux</p>` (via `transformPastedHTML`).
  const COLLAGE_DEUX_PARAGRAPHES = '<p>Para un<br>Para deux</p>'
  // Quatre Entrées consécutives : l'éditeur plafonne lui aussi à 2 `<br>`.
  const QUATRE_ENTREES = '<p>X<br><br>Y</p>'

  it("n'émet jamais plusieurs paragraphes", () => {
    for (const html of [SAISIE_APOSTROPHE, DEUX_ENTREES, COLLAGE_DEUX_PARAGRAPHES, QUATRE_ENTREES]) {
      expect(html.match(/<p[\s>]/g)).toHaveLength(1)
    }
  })

  it('est un point fixe de la normalisation stockée', () => {
    for (const html of [SAISIE_APOSTROPHE, DEUX_ENTREES, COLLAGE_DEUX_PARAGRAPHES, QUATRE_ENTREES]) {
      expect(normalizeStoredDescription(html)).toBe(html)
    }
  })

  it("s'égale à la description en texte brut dont il dérive (W2)", () => {
    expect(isSameRichText("L'asso & co", SAISIE_APOSTROPHE)).toBe(true)
    expect(isSameRichText('A\n\nB', DEUX_ENTREES)).toBe(true)
    expect(isSameRichText('Para un\nPara deux', COLLAGE_DEUX_PARAGRAPHES)).toBe(true)
  })

  it('reste distinct d\'un contenu réellement différent', () => {
    expect(isSameRichText(DEUX_ENTREES, QUATRE_ENTREES)).toBe(false)
    expect(isSameRichText("L'asso & co", COLLAGE_DEUX_PARAGRAPHES)).toBe(false)
  })
})
