import { describe, it, expect } from 'vitest'
import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'

/**
 * Garde anti-régression (plan 2026-06-28-email-bg-color-dry) :
 * aucun test client ne doit recopier en littéral la couleur de fond email.
 * Un changement de couleur = 1 ligne (la constante) + changelog, zéro édition de test.
 * La fragilité historique : commit 2d16d11a (changement de la couleur de fond) a cassé 9 tests.
 *
 * Méthode : on interdit la VALEUR RUNTIME de la constante (pas une chaîne figée),
 * pour rester pertinent quelle que soit la couleur courante.
 *
 * LIMITE CONNUE (garde coarse / textuel) : ce garde ne distingue pas « ce littéral
 * est le fond email » d'« un bouton / une carte / un token de marque ». Il peut donc
 * produire des FAUX POSITIFS si MJ_BODY_BACKGROUND_COLOR prend une valeur déjà
 * utilisée comme littéral NON-fond ailleurs (typiquement #ffffff). En cas de
 * collision : remplacer le littéral non-fond par un placeholder arbitraire distinct,
 * ou documenter une exception — NE PAS coupler un champ non-fond à la constante.
 * La solution structurelle à cette limite est la factory makeDefaultResolvedShell
 * (Plan B du plan DRY), qui élimine la duplication à la source.
 */
describe('Garde anti-littéral couleur de fond email', () => {
  // Source brut de tous les tests client, ce fichier excepté. Le motif est aligné sur
  // l'`include` de vitest.config.ts (test + spec), borné à client/src.
  const testFiles = import.meta.glob('../**/*.{test,spec}.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  // Auto-exclusion (sinon ce fichier se scannerait lui-même).
  const SELF = '../__tests__/no-color-literals.test.ts'

  /**
   * Exceptions documentées, chemin → raison — la collision que la LIMITE CONNUE
   * ci-dessus annonçait, survenue le 2026-08-01.
   *
   * Une exception se justifie PAR ÉCRIT et se borne à un chemin. Le test
   * « aucune exception documentée n'est morte » ci-dessous refuse toute entrée
   * qui ne protège plus rien : une exception périmée rouvre un trou dans la
   * garde sans que personne le voie.
   */
  const DOCUMENTED_EXCEPTIONS: Record<string, string> = {
    '../components/ui/__tests__/focusRingContrast.test.ts':
      "MJ_BODY_BACKGROUND_COLOR vaut aujourd'hui la même valeur que zinc-50, le " +
      "fond de la barre d'outils de l'éditeur. Ce test CALCULE un rapport de " +
      'contraste WCAG contre ce fond : la valeur y est le sujet du calcul, pas ' +
      'une donnée de fixture. Un placeholder rendrait le test faux, et importer ' +
      'MJ_BODY_BACKGROUND_COLOR coupleraient deux couleurs sans rapport — ce que ' +
      'la LIMITE CONNUE interdit explicitement.',
  }

  const forbidden = MJ_BODY_BACKGROUND_COLOR // valeur runtime, jamais figée

  // Token hex ENTIER (frontières non-hex), insensible à la casse : '#fafafa'
  // matche, mais '#fafafaaa' (8-digits), '#faf' (3-digits) ou le littéral
  // embarqué dans un identifiant (ex. un import) ne matchent pas.
  const literalRe = new RegExp(
    `(?<![0-9a-fA-F])${forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9a-fA-F])`,
    'i',
  )

  it('la sonde est un hex 6-digits valide (sinon le garde serait inopérant)', () => {
    // Garde-fou : si la constante n'est plus un hex 6-digits (ex. '#fff', ''),
    // on échoue explicitement plutôt que de faux-positiver massivement ou de matcher vide.
    expect(/^#[0-9a-fA-F]{6}$/.test(forbidden)).toBe(true)
  })

  it('le glob a chargé des fichiers (sinon le garde est silencieusement inopérant)', () => {
    // Anti faux-vert : si import.meta.glob résolvait {} (déplacement du fichier,
    // changement de base Vite), la boucle ci-dessous n'itérerait sur rien.
    expect(Object.keys(testFiles).length).toBeGreaterThan(0)
  })

  it('aucune exception documentée n’est morte', () => {
    // Une exception qui ne protège plus rien est pire qu'absente : elle rouvre
    // un trou dans la garde sans que personne le voie. Même discipline que la
    // table `IMPACTS` du détecteur de dérive documentaire.
    const dead = Object.keys(DOCUMENTED_EXCEPTIONS).filter(
      (path) => !literalRe.test(testFiles[path] ?? ''),
    )
    expect(
      dead,
      `Exception(s) devenue(s) inutile(s) — le littéral « ${forbidden} » n'y est plus (ou le fichier a été déplacé) :\n${dead.join('\n')}\n\nRetirer l'entrée de DOCUMENTED_EXCEPTIONS.`,
    ).toEqual([])
  })

  it('aucun test client ne recopie en littéral la valeur de MJ_BODY_BACKGROUND_COLOR', () => {
    const offenders = Object.entries(testFiles)
      .filter(([path]) => path !== SELF && !(path in DOCUMENTED_EXCEPTIONS))
      .filter(([, source]) => literalRe.test(source))
      .map(([path]) => path)

    expect(
      offenders,
      `Littéral « ${forbidden} » (couleur de fond email) trouvé dans :\n${offenders.join('\n')}\n\n` +
        `• Si c'est le fond email → importe MJ_BODY_BACKGROUND_COLOR depuis '@timepick/shared' au lieu du littéral.\n` +
        `• Si c'est une AUTRE couleur (bouton, carte, marque…) → FAUX POSITIF : remplace par un placeholder arbitraire distinct (ne couple PAS un champ non-fond à la constante), ou inscris une exception DOCUMENTÉE dans DOCUMENTED_EXCEPTIONS.`,
    ).toEqual([])
  })
})
