import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { USER_FACING_ERROR_CODES } from '../userFacingErrorCodes'

/**
 * Garde mécanique sur le CONTENU des messages d'échec.
 *
 * Le design system légifère sur le canal d'un message — où il s'affiche, un
 * seul canal par échec, annonce accessible. Rien ne disait ce qu'un message
 * doit contenir, et pendant des mois l'application a affiché à l'administrateur
 * des noms de champs, des unités machine et des phrases anglaises d'axios.
 *
 * Ce que cette garde couvre : les **littéraux** passés à `toast.*` et les
 * phrases de repli passées à `userFacingErrorMessage`. C'est le motif dominant,
 * et la totalité des cas d'aujourd'hui.
 *
 * Ce qu'elle NE couvre PAS — à savoir avant de s'y fier :
 * - un message construit dynamiquement (variable, ternaire, concaténation) ;
 * - un texte rendu directement en JSX sans passer par une notification ;
 * - les **messages du serveur** émis sous un code de la liste blanche, qui sont
 *   pourtant le texte réellement affiché. Un code admis dont le message serveur
 *   porterait du jargon échapperait à cette garde : c'est la revue humaine de la
 *   liste blanche qui tient ce point, pas ce fichier.
 *
 * Une garde partielle sur le motif dominant vaut mieux qu'une règle purement
 * disciplinaire — à condition de ne pas la croire exhaustive.
 */

// import.meta.dirname → client/src/lib/__tests__
const SRC_ROOT = resolve(import.meta.dirname, '..', '..')

/**
 * Marqueurs internes : noms de champs de l'API, unités machine, identifiants de
 * décision, et les textes qu'axios écrit lui-même.
 */
const INTERNAL_MARKERS = [
  'bodyMjml',
  'mjml',
  'uuid',
  'octets',
  'D-ext',
  'Network Error',
  'timeout of',
  'Expected ',
  'received ',
]

/**
 * Comparaison insensible à la casse : le jargon cité par le dossier d'origine
 * s'écrit « UUID valide » en toutes majuscules, que `includes('uuid')` laissait
 * passer.
 */
const containsMarker = (text: string, marker: string): boolean =>
  text.toLowerCase().includes(marker.toLowerCase())

/** Ces deux codes relaient du jargon ; les laisser entrer serait rouvrir la fuite. */
const CODES_NEVER_WHITELISTED = ['VALIDATION_ERROR', 'INTERNAL_ERROR']

/**
 * Le code de production uniquement. Sont exclus : les tests, et les deux
 * surfaces qui contiennent des exemples DÉLIBÉRÉMENT incorrects — les
 * `*.meta.ts` du design system (source du manifeste, qui cite les
 * anti-patrons) et la page de référence visuelle.
 */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules' || entry === 'design-system') continue
      collectSourceFiles(full, out)
      continue
    }
    if (entry.endsWith('.meta.ts')) continue
    if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Extrait les textes destinés à l'utilisateur : l'argument d'un `toast.error` /
 * `toast.success` / `toast.warning`, et la phrase de repli passée en second
 * argument de `userFacingErrorMessage`.
 *
 * On ne lit que les littéraux : une phrase construite dynamiquement échappe au
 * filet, et c'est assumé — le filet doit tenir sur ce qui est écrit à la main,
 * qui est la totalité des cas d'aujourd'hui.
 */
function extractUserFacingLiterals(source: string): string[] {
  const literals: string[] = []
  const patterns = [
    /toast\.(?:error|success|warning|info)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    /userFacingErrorMessage\(\s*[^,()]*,\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    // `toast.error('titre', { description: '…' })` — la description est affichée
    // au même titre que le titre, et échappait au premier motif.
    /\bdescription:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) literals.push(match[2])
  }
  return literals
}

const SOURCE_FILES = collectSourceFiles(SRC_ROOT)

describe('contenu des messages destinés à l\'utilisateur', () => {
  it('trouve bien des textes à inspecter (garde de non-vacuité)', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(100)
    const total = SOURCE_FILES.reduce(
      (n, file) => n + extractUserFacingLiterals(readFileSync(file, 'utf8')).length,
      0,
    )
    expect(total).toBeGreaterThan(50)
  })

  it('aucun ne contient de marqueur interne', () => {
    const offences: string[] = []
    for (const file of SOURCE_FILES) {
      const relative = file.slice(SRC_ROOT.length + 1)
      for (const text of extractUserFacingLiterals(readFileSync(file, 'utf8'))) {
        for (const marker of INTERNAL_MARKERS) {
          if (containsMarker(text, marker)) offences.push(`${relative} — « ${text} » contient « ${marker} »`)
        }
      }
    }
    expect(offences).toEqual([])
  })

  it('aucun ne préfixe le message par « Erreur : »', () => {
    const offences: string[] = []
    for (const file of SOURCE_FILES) {
      const source = readFileSync(file, 'utf8')
      // Le doublon historique : `toast.error(`Erreur: ${msg}`)` produisait
      // « Erreur : Erreur lors de la mise à jour ».
      for (const match of source.matchAll(/toast\.\w+\(\s*`Erreur\s*:/g)) {
        offences.push(`${file.slice(SRC_ROOT.length + 1)} — ${match[0]}`)
      }
    }
    expect(offences).toEqual([])
  })
})

describe('liste blanche des codes serveur', () => {
  it('exclut les codes qui relaient du jargon', () => {
    // `USER_FACING_ERROR_CODES` a maintenant des clés littérales : l'indexer par
    // une chaîne quelconque ne compile plus. On interroge donc l'objet comme la
    // production le fait — par `in` — ce qui teste le même fait sans se mentir
    // sur la forme.
    const whitelisted: Record<string, unknown> = USER_FACING_ERROR_CODES
    for (const code of CODES_NEVER_WHITELISTED) {
      expect(code in whitelisted, `${code} ne doit jamais être en liste blanche`).toBe(false)
    }
  })

  it('documente chaque code par la raison de sa présence', () => {
    for (const [code, reason] of Object.entries(USER_FACING_ERROR_CODES)) {
      expect(code, `${code} doit être un code SCREAMING_SNAKE_CASE`).toMatch(/^[A-Z][A-Z0-9_]*$/)
      expect(reason.length, `${code} doit porter sa raison`).toBeGreaterThan(10)
    }
  })
})
