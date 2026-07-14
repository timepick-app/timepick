import { describe, it, expect } from 'vitest'
import {
  INVITATION_VARIABLES,
  INVITATION_CRITICAL_VARIABLES,
  findMissingCriticalVariables,
} from '../email-template-constants'

describe('email-template-constants', () => {
  describe('INVITATION_VARIABLES', () => {
    it('exposes the five canonical invitation tokens in PRD order', () => {
      expect(INVITATION_VARIABLES).toEqual([
        'user_first_name',
        'event_name',
        'event_description',
        'magic_link',
        'expiration_date',
      ])
    })
  })

  describe('INVITATION_CRITICAL_VARIABLES', () => {
    it('exposes only the magic-link-related tokens (FR55)', () => {
      expect(INVITATION_CRITICAL_VARIABLES).toEqual([
        'magic_link',
        'expiration_date',
      ])
    })
  })

  describe('findMissingCriticalVariables', () => {
    it('returns an empty array when both critical tokens are present', () => {
      const body = '<mj-text>{{magic_link}} expires on {{expiration_date}}</mj-text>'
      expect(findMissingCriticalVariables(body)).toEqual([])
    })

    it("returns ['magic_link'] when only {{magic_link}} is missing", () => {
      const body = '<mj-text>Use the link to reach {{expiration_date}}</mj-text>'
      expect(findMissingCriticalVariables(body)).toEqual(['magic_link'])
    })

    it("returns ['expiration_date'] when only {{expiration_date}} is missing", () => {
      const body = '<mj-text>Click {{magic_link}} now</mj-text>'
      expect(findMissingCriticalVariables(body)).toEqual(['expiration_date'])
    })

    it('returns both when both critical tokens are missing', () => {
      const body = '<mj-text>Just a plain message</mj-text>'
      expect(findMissingCriticalVariables(body)).toEqual([
        'magic_link',
        'expiration_date',
      ])
    })

    it('ignores non-critical variables (event_name removed → still empty)', () => {
      const body = '<mj-text>Hello {{magic_link}} until {{expiration_date}}</mj-text>'
      expect(findMissingCriticalVariables(body)).toEqual([])
    })

    it('tolerates whitespace inside the braces', () => {
      const variants = [
        '{{magic_link}}',
        '{{ magic_link }}',
        '{{  magic_link  }}',
        '{{\tmagic_link\t}}',
      ]
      for (const variant of variants) {
        const body = `<mj-text>${variant} {{expiration_date}}</mj-text>`
        expect(findMissingCriticalVariables(body)).toEqual([])
      }
    })

    it('handles empty body — both tokens missing', () => {
      expect(findMissingCriticalVariables('')).toEqual([
        'magic_link',
        'expiration_date',
      ])
    })

    it('treats the bare token name (no braces) as missing', () => {
      const body = '<mj-text>magic_link expiration_date</mj-text>'
      expect(findMissingCriticalVariables(body)).toEqual([
        'magic_link',
        'expiration_date',
      ])
    })
  })
})
