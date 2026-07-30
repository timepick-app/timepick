import { sanitizeRichText } from '../../utils/sanitize-rich-text'

/**
 * MIROIR CLIENT/SERVEUR — table jumelle du `it.each` « miroir serveur » de
 * `client/src/lib/__tests__/richText.test.ts` (describe `flattenToLineBreaks`).
 *
 * `sanitizeRichText` ré-aplatit CHAQUE écriture de description (câblé via
 * `organization.validator.ts` et `event.validator.ts`). Si les deux
 * implémentations divergent d'un seul `<br>`, le client affiche une ligne vide
 * que le serveur efface au save suivant : panne silencieuse et destructrice,
 * déjà survenue une fois (frontière de bloc restée à un `<br>` unique côté
 * serveur). Ce fichier existe pour qu'elle ne puisse plus passer.
 *
 * Les deux tables DOIVENT rester identiques : toute entrée ajoutée d'un côté
 * doit l'être de l'autre, avec la même attente.
 *
 * Seule différence connue et VOULUE, donc hors table : une entrée sans aucun
 * `<p>` ressort nue ici (drapeau `hadParagraph`) et enveloppée côté client.
 *
 * `isomorphic-dompurify` est remplacé par un passthrough sous Jest
 * (`server/src/__mocks__/isomorphic-dompurify.ts` — le vrai paquet est ESM-only
 * et fait exploser ts-jest). Ce fichier ne teste donc que l'aplatissement,
 * c'est-à-dire exactement la moitié qui doit être en miroir.
 */
describe('sanitizeRichText — miroir du modèle « retour = <br> » côté client', () => {
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
  ])('%s => %s', (input, expected) => {
    expect(sanitizeRichText(input)).toBe(expected)
  })

  it('différence assumée : une entrée sans <p> ressort nue (pas d\'enveloppe ajoutée)', () => {
    expect(sanitizeRichText('texte nu')).toBe('texte nu')
    expect(sanitizeRichText('texte<br>nu')).toBe('texte<br>nu')
  })
})
