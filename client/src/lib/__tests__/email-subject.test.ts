import { describe, it, expect } from 'vitest'
import {
  MAX_SUBJECT_LENGTH,
  findUnsupportedSubjectTokens,
  interpolateSubject,
  normalizeSubject,
  subjectBlockReason,
  type SubjectVariable,
} from '../email-subject'

// Jeu de variables minimal mais représentatif : un nom de famille vide simule
// le cas mononyme réel (un utilisateur sans nom de famille renseigné), et une
// valeur contenant `$&` vérifie que le remplacement ne passe pas par le moteur
// spécial des motifs de `String.prototype.replace`.
const VARS: SubjectVariable[] = [
  { name: 'event_name', label: "Nom de l'événement", previewValue: 'Kermesse de printemps' },
  { name: 'user_first_name', label: 'Prénom', previewValue: 'Alex' },
  { name: 'user_last_name', label: 'Nom de famille', previewValue: '' },
]

describe('normalizeSubject', () => {
  it('rabat les espaces multiples sur un espace simple', () => {
    expect(normalizeSubject('a    b')).toBe('a b')
  })

  it('rabat les retours à la ligne sur un espace', () => {
    expect(normalizeSubject('a\nb\r\nc')).toBe('a b c')
  })

  it('rabat les tabulations sur un espace', () => {
    expect(normalizeSubject('a\t\tb')).toBe('a b')
  })

  it('rogne les bords', () => {
    expect(normalizeSubject('   a b   ')).toBe('a b')
  })

  it("réduit une chaîne entièrement blanche à une chaîne vide", () => {
    expect(normalizeSubject('   \t\n  ')).toBe('')
  })

  it('laisse une chaîne sans blanc inchangée', () => {
    expect(normalizeSubject('abc')).toBe('abc')
  })

  it('rabat un caractère de contrôle C0 ou C1 (NUL, ESC) sur un espace', () => {
    expect(normalizeSubject('Objet\u0000Test')).toBe('Objet Test')
    expect(normalizeSubject('Objet\u001bTest')).toBe('Objet Test')
  })

  it('rabat les caractères de largeur nulle et les marques de contrôle bidi sur un espace', () => {
    expect(normalizeSubject('Objet\u200bTest')).toBe('Objet Test')
    expect(normalizeSubject('Objet\u202eTest')).toBe('Objet Test')
  })

  it("ne laisse subsister aucun caractère des catégories Unicode Cc/Cf, quel que soit le mélange en entrée", () => {
    const dirty = 'A\u0000B\u001bC\u200bD\u202eE\u0085F'
    const clean = normalizeSubject(dirty)
    expect(/[\p{Cc}\p{Cf}]/u.test(clean)).toBe(false)
    expect(clean).toBe('A B C D E F')
  })
})

describe('interpolateSubject', () => {
  it('remplace un jeton connu par sa valeur de démonstration', () => {
    expect(interpolateSubject('Bonjour {{event_name}}', VARS)).toBe(
      'Bonjour Kermesse de printemps',
    )
  })

  it('laisse un jeton absent de la liste littéral', () => {
    expect(interpolateSubject('Bonjour {{unknown_token}}', VARS)).toBe(
      'Bonjour {{unknown_token}}',
    )
  })

  it("laisse littéral un jeton avec des espaces à l'intérieur des accolades", () => {
    expect(interpolateSubject('Bonjour {{ event_name }}', VARS)).toBe(
      'Bonjour {{ event_name }}',
    )
  })

  it('remplace un jeton dont la valeur de démonstration est vide (mononyme)', () => {
    expect(interpolateSubject('{{user_last_name}}', VARS)).toBe('')
  })

  it("insère littéralement une valeur contenant `$&` (pas de motif spécial de replace)", () => {
    const varsWithDollar: SubjectVariable[] = [
      { name: 'user_first_name', label: 'Prénom', previewValue: 'A$&B' },
    ]
    expect(interpolateSubject('{{user_first_name}}', varsWithDollar)).toBe('A$&B')
  })
})

describe('findUnsupportedSubjectTokens', () => {
  it("liste les jetons non autorisés dans l'ordre d'apparition, sans doublon", () => {
    expect(
      findUnsupportedSubjectTokens('{{zeta}} texte {{alpha}} encore {{zeta}}', VARS),
    ).toEqual(['{{zeta}}', '{{alpha}}'])
  })

  it('exclut les jetons connus de la liste des variables', () => {
    expect(findUnsupportedSubjectTokens('{{event_name}} et {{alpha}}', VARS)).toEqual([
      '{{alpha}}',
    ])
  })

  it("compte un jeton avec espaces internes comme non autorisé, accolades comprises", () => {
    expect(findUnsupportedSubjectTokens('{{ event_name }}', VARS)).toEqual([
      '{{ event_name }}',
    ])
  })

  it("retourne un tableau vide quand tous les jetons sont autorisés", () => {
    expect(findUnsupportedSubjectTokens('{{event_name}} {{user_first_name}}', VARS)).toEqual([])
  })
})

describe('subjectBlockReason', () => {
  it('retourne null pour un objet valide', () => {
    expect(subjectBlockReason('Bonjour {{event_name}}', VARS)).toBeNull()
  })

  it("nomme le jeton en cause pour une seule variable non autorisée", () => {
    expect(subjectBlockReason('Bonjour {{alpha}}', VARS)).toBe(
      "Objet : la variable {{alpha}} n'est pas autorisée pour ce modèle.",
    )
  })

  it("signale l'objet vide", () => {
    expect(subjectBlockReason('   ', VARS)).toBe("Objet : l'objet ne peut pas être vide.")
  })

  it('signale le dépassement de la longueur maximale avec le compte réel', () => {
    const tooLong = 'a'.repeat(MAX_SUBJECT_LENGTH + 1)
    expect(subjectBlockReason(tooLong, VARS)).toBe(
      `Objet : ${MAX_SUBJECT_LENGTH + 1} caractères, le maximum est ${MAX_SUBJECT_LENGTH}.`,
    )
  })

  it('accorde au pluriel et liste les deux jetons fautifs', () => {
    expect(subjectBlockReason('{{alpha}} et {{beta}}', VARS)).toBe(
      'Objet : les variables {{alpha}}, {{beta}} ne sont pas autorisées pour ce modèle.',
    )
  })
})
