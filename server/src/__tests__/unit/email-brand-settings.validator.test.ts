import { emailBrandSettingsPatchSchema } from '../../validators/email-brand-settings.validator'
import { ZodError } from 'zod'

describe('emailBrandSettingsPatchSchema', () => {
  it('valide tous les cinq champs remplis', () => {
    const input = {
      logoUrl: 'https://example.com/logo.png',
      primaryColor: '#ff0000',
      buttonTextColor: '#0a0a0a',
      fontFamily: 'Georgia, serif',
      buttonBorderRadius: 8,
    }
    expect(emailBrandSettingsPatchSchema.parse(input)).toEqual(input)
  })

  it('valide un champ unique', () => {
    const result = emailBrandSettingsPatchSchema.parse({ primaryColor: '#ff0000' })
    expect(result).toEqual({ primaryColor: '#ff0000' })
  })

  it('accepte logoUrl: null pour effacement explicite', () => {
    const result = emailBrandSettingsPatchSchema.parse({ logoUrl: null })
    expect(result).toEqual({ logoUrl: null })
  })

  it('rejette un body vide', () => {
    expect(() => emailBrandSettingsPatchSchema.parse({})).toThrow(ZodError)
    try {
      emailBrandSettingsPatchSchema.parse({})
    } catch (e) {
      expect(e instanceof ZodError).toBe(true)
      expect((e as ZodError).issues[0].message).toContain('Au moins un champ')
    }
  })

  it('rejette un hex shorthand (#fff)', () => {
    expect(() => emailBrandSettingsPatchSchema.parse({ primaryColor: '#fff' })).toThrow(ZodError)
  })

  it('rejette un radius non-entier (1.5)', () => {
    expect(() => emailBrandSettingsPatchSchema.parse({ buttonBorderRadius: 1.5 })).toThrow(ZodError)
  })

  it('rejette une police non listée', () => {
    expect(() => emailBrandSettingsPatchSchema.parse({ fontFamily: 'Comic Sans' })).toThrow(ZodError)
  })

  it('rejette une clé inconnue (strict mode)', () => {
    expect(() => emailBrandSettingsPatchSchema.parse({ unknown_key: 'x' })).toThrow(ZodError)
    try {
      emailBrandSettingsPatchSchema.parse({ unknown_key: 'x' })
    } catch (e) {
      expect(e instanceof ZodError).toBe(true)
      // strict mode reports unrecognized keys
      expect((e as ZodError).issues.some(err => err.message.includes('Unrecognized key') || err.code === 'unrecognized_keys')).toBe(true)
    }
  })

  it('valide buttonTextColor seul', () => {
    expect(emailBrandSettingsPatchSchema.parse({ buttonTextColor: '#000000' })).toEqual({ buttonTextColor: '#000000' })
  })
  it('rejette un hex invalide pour buttonTextColor', () => {
    expect(() => emailBrandSettingsPatchSchema.parse({ buttonTextColor: '#zzzzzz' })).toThrow(ZodError)
  })
  it('rejette un hex shorthand (#fff) pour buttonTextColor', () => {
    expect(() => emailBrandSettingsPatchSchema.parse({ buttonTextColor: '#fff' })).toThrow(ZodError)
  })
})
