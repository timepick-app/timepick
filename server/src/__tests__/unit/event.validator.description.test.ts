import { describe, it, expect, jest } from '@jest/globals'

// Évite l'explosion à l'import : isomorphic-dompurify → jsdom → @exodus/bytes (ESM-only).
// Le mock passthrough (server/src/__mocks__/isomorphic-dompurify.ts) est activé ici.
// La correction DOMPurify réelle (suppression de <script>, etc.) est couverte côté client
// (client/src/lib/__tests__/richText.test.ts) et par scripts/verify-mjml-sanitizer.mjs.
jest.mock('isomorphic-dompurify')

// Les imports de modules sous test viennent après les jest.mock (hoisting ts-jest).
import { createEventSchema, updateEventSchema } from '../../validators/event.validator'

describe('createEventSchema — champ description', () => {
  it('rejette une description dépassant 20 000 caractères', () => {
    const result = createEventSchema.safeParse({
      name: 'événement',
      description: 'a'.repeat(20001),
    })
    expect(result.success).toBe(false)
  })

  it('accepte une description exactement à la limite (20 000 caractères)', () => {
    const result = createEventSchema.safeParse({
      name: 'événement',
      description: 'a'.repeat(20000),
    })
    expect(result.success).toBe(true)
  })

  it('préserve un texte brut sans balises (transform câblé, pas d\'exception)', () => {
    const result = createEventSchema.parse({
      name: 'événement',
      description: 'just text',
    })
    expect(result.description).toBe('just text')
  })

  it('retourne une string quand la description contient du HTML (transform câblé, pas d\'exception)', () => {
    const result = createEventSchema.parse({
      name: 'x',
      description: '<p>ok</p><strong>gras</strong>',
    })
    expect(typeof result.description).toBe('string')
  })

  it('accepte une description absente (optional)', () => {
    const result = createEventSchema.safeParse({ name: 'x' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeUndefined()
    }
  })

  it('aplatit les paragraphes en <br> et plafonne à 2 (modèle <br>)', () => {
    const result = createEventSchema.parse({
      name: 'x',
      description: '<p>A</p><p></p><p></p><p></p><p>B</p>',
    })
    expect(result.description).toBe('<p>A<br><br>B</p>')
  })
})

describe('updateEventSchema — champ description', () => {
  it('accepte description: null (nullable préservé)', () => {
    const result = updateEventSchema.parse({ description: null })
    expect(result.description).toBeNull()
  })

  it('accepte une description absente (optional)', () => {
    const result = updateEventSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeUndefined()
    }
  })

  it('préserve un texte brut (transform câblé sans exception)', () => {
    const result = updateEventSchema.parse({ description: 'just text' })
    expect(result.description).toBe('just text')
  })

  it('rejette une description dépassant 20 000 caractères', () => {
    const result = updateEventSchema.safeParse({ description: 'b'.repeat(20001) })
    expect(result.success).toBe(false)
  })
})
