import { describe, it, expect, jest } from '@jest/globals'

// Évite l'explosion à l'import : isomorphic-dompurify → jsdom → @exodus/bytes (ESM-only).
// Le mock passthrough (server/src/__mocks__/isomorphic-dompurify.ts) est activé ici.
// La correction DOMPurify réelle (suppression de <script>, des handlers, des
// schémas javascript:) est couverte côté client par
// client/src/lib/__tests__/richText.test.ts, dont l'allowlist est identique.
jest.mock('isomorphic-dompurify')

// Les imports de modules sous test viennent après les jest.mock (hoisting ts-jest).
import { organizationSettingsSchema } from '../../validators/organization.validator'

describe('organizationSettingsSchema — champ description', () => {
  it('rejette une description dépassant 5 000 caractères', () => {
    const result = organizationSettingsSchema.safeParse({
      name: 'Chorale',
      description: 'a'.repeat(5001),
    })
    expect(result.success).toBe(false)
  })

  it('accepte une description exactement à la limite (5 000 caractères)', () => {
    const result = organizationSettingsSchema.safeParse({
      name: 'Chorale',
      description: 'a'.repeat(5000),
    })
    expect(result.success).toBe(true)
  })

  it('préserve un texte brut sans balises (transform câblé, pas d\'exception)', () => {
    const result = organizationSettingsSchema.parse({
      name: 'Chorale',
      description: 'Répétitions hebdomadaires',
    })
    expect(result.description).toBe('Répétitions hebdomadaires')
  })

  it('aplatit les paragraphes en <br> et plafonne à 2 (même modèle que l\'événement)', () => {
    const result = organizationSettingsSchema.parse({
      name: 'Chorale',
      description: '<p>A</p><p></p><p></p><p></p><p>B</p>',
    })
    expect(result.description).toBe('<p>A<br><br>B</p>')
  })

  // Garde de MIROIR avec le client : le cas ci-dessus a des paragraphes vides,
  // donc le plafond le ramène à 2 <br> quel que soit le modèle de frontière —
  // il ne pouvait pas détecter une divergence. Ce cas-ci, à frontière UNIQUE,
  // est le seul qui la détecte.
  it('une frontière de paragraphe unique vaut une LIGNE VIDE (miroir de flattenToLineBreaks)', () => {
    const result = organizationSettingsSchema.parse({
      name: 'Chorale',
      description: '<p>A</p><p>B</p>',
    })
    expect(result.description).toBe('<p>A<br><br>B</p>')
  })

  it('description absente ⇒ chaîne vide (convention « non configuré »)', () => {
    const result = organizationSettingsSchema.parse({ name: 'Chorale' })
    expect(result.description).toBe('')
  })
})
