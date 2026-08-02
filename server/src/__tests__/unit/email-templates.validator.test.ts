import {
  templateKeyParamSchema,
  invitationPatchSchema,
  systemTemplatePatchSchema,
  pickPatchSchema,
  MAX_BODY_MJML_BYTES,
  MAX_TEXT_LENGTH,
} from '../../validators/email-templates.validator'

describe('email-templates.validator', () => {
  // =========================================================
  // templateKeyParamSchema
  // =========================================================
  describe('templateKeyParamSchema', () => {
    it.each(['invitation', 'magic_link_login', 'reservation_confirmation'])(
      'accepts known key: %s',
      (key) => {
        expect(templateKeyParamSchema.parse(key)).toBe(key)
      },
    )

    it('rejects unknown key with French error', () => {
      const result = templateKeyParamSchema.safeParse('unknown')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("templateKey doit être l'un de")
      }
    })

    it('rejects slot_modification — corps dynamique hors périmètre édition (exclu de EDITABLE_TEMPLATE_KEYS)', () => {
      // slot_modification a un body assemblé au runtime (blocs conditionnels),
      // jamais éditable via cet éditeur : le param schema doit le refuser
      // comme n'importe quelle clé inconnue, avant d'atteindre la projection.
      expect(templateKeyParamSchema.safeParse('slot_modification').success).toBe(false)
    })
  })

  // =========================================================
  // invitationPatchSchema
  // =========================================================
  describe('invitationPatchSchema', () => {
    it('accepts valid bodyMjml', () => {
      const result = invitationPatchSchema.parse({ bodyMjml: '<mj-section></mj-section>' })
      expect(result.bodyMjml).toBe('<mj-section></mj-section>')
    })

    it('rejects empty object', () => {
      const result = invitationPatchSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects empty bodyMjml', () => {
      const result = invitationPatchSchema.safeParse({ bodyMjml: '' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('vide')
      }
    })

    it('rejects oversized bodyMjml', () => {
      const result = invitationPatchSchema.safeParse({ bodyMjml: 'a'.repeat(MAX_BODY_MJML_BYTES + 1) })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('octets')
      }
    })

    it('rejects unknown keys (strict mode)', () => {
      const result = invitationPatchSchema.safeParse({
        bodyMjml: '<mj-section></mj-section>',
        defaultBodyMjml: '<mj-section></mj-section>',
      })
      expect(result.success).toBe(false)
    })
  })

  // =========================================================
  // systemTemplatePatchSchema
  // =========================================================
  describe('systemTemplatePatchSchema', () => {
    it('accepts valid introText and signatureText', () => {
      const result = systemTemplatePatchSchema.parse({ introText: 'Hello', signatureText: 'Bye' })
      expect(result.introText).toBe('Hello')
      expect(result.signatureText).toBe('Bye')
    })

    it('rejects empty object', () => {
      const result = systemTemplatePatchSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects missing introText', () => {
      const result = systemTemplatePatchSchema.safeParse({ signatureText: 'Bye' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('introText')
      }
    })

    it('rejects missing signatureText', () => {
      const result = systemTemplatePatchSchema.safeParse({ introText: 'Hello' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('signatureText')
      }
    })

    it('rejects oversized introText', () => {
      const result = systemTemplatePatchSchema.safeParse({
        introText: 'x'.repeat(MAX_TEXT_LENGTH + 1),
        signatureText: 'ok',
      })
      expect(result.success).toBe(false)
    })

    it('rejects oversized signatureText', () => {
      const result = systemTemplatePatchSchema.safeParse({
        introText: 'ok',
        signatureText: 'x'.repeat(MAX_TEXT_LENGTH + 1),
      })
      expect(result.success).toBe(false)
    })

    it('rejects unknown keys (strict mode)', () => {
      const result = systemTemplatePatchSchema.safeParse({
        introText: 'Hello',
        signatureText: 'Bye',
        bodyMjml: '<mj-section></mj-section>',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty introText', () => {
      const result = systemTemplatePatchSchema.safeParse({ introText: '', signatureText: 'Bye' })
      expect(result.success).toBe(false)
    })

    it('rejects empty signatureText', () => {
      const result = systemTemplatePatchSchema.safeParse({ introText: 'Hello', signatureText: '' })
      expect(result.success).toBe(false)
    })
  })

  // =========================================================
  // pickPatchSchema
  // =========================================================
  describe('pickPatchSchema', () => {
    it('returns invitation schema for invitation key', () => {
      const schema = pickPatchSchema('invitation')
      expect(schema.safeParse({ bodyMjml: 'test' }).success).toBe(true)
      expect(schema.safeParse({ introText: 'x', signatureText: 'y' }).success).toBe(false)
    })

    it('returns system schema for magic_link_login key', () => {
      const schema = pickPatchSchema('magic_link_login')
      expect(schema.safeParse({ introText: 'x', signatureText: 'y' }).success).toBe(true)
      expect(schema.safeParse({ bodyMjml: 'test' }).success).toBe(false)
    })

    it('returns system schema for reservation_confirmation key', () => {
      const schema = pickPatchSchema('reservation_confirmation')
      expect(schema.safeParse({ introText: 'x', signatureText: 'y' }).success).toBe(true)
    })
  })
})
