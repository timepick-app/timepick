import { describe, it, expect } from 'vitest'
import {
  SYSTEM_TEMPLATE_VARIABLES,
  SYSTEM_TEMPLATE_CRITICAL_VARIABLES,
  findMissingSystemCriticalVariables,
  type SystemTemplateKey,
} from '../email-system-template-constants'

const SYSTEM_KEYS: readonly SystemTemplateKey[] = [
  'magic_link_login',
  'reservation_confirmation',
  'account_created',
  'cancellation_confirmation',
  'role_promoted',
  'role_demoted',
  'unregistration_confirmation',
] as const

describe('email-system-template-constants', () => {
  describe('SYSTEM_TEMPLATE_VARIABLES', () => {
    it('exposes the locked canonical map for all seven system keys', () => {
      expect(SYSTEM_TEMPLATE_VARIABLES).toEqual({
        magic_link_login: ['user_first_name', 'user_last_name', 'user_full_name', 'magic_link', 'expiration_date'],
        reservation_confirmation: [
          'user_first_name',
          'user_last_name',
          'user_full_name',
          'event_name',
          'slot_date',
          'slot_time',
          'calendar_url',
        ],
        account_created: ['user_first_name', 'user_last_name', 'user_full_name', 'login_url'],
        cancellation_confirmation: [
          'user_first_name',
          'user_last_name',
          'user_full_name',
          'event_name',
          'slot_date',
          'slot_time',
          'cancellation_reason',
          'calendar_url',
        ],
        role_promoted: ['user_first_name', 'user_last_name', 'user_full_name', 'login_url'],
        role_demoted: ['user_first_name', 'user_last_name', 'user_full_name', 'login_url'],
        unregistration_confirmation: ['user_first_name', 'user_last_name', 'user_full_name', 'event_name', 'slot_date', 'slot_time', 'calendar_url'],
      })
    })

    it.each(SYSTEM_KEYS)('exposes a non-empty list for %s', (key) => {
      expect(SYSTEM_TEMPLATE_VARIABLES[key].length).toBeGreaterThan(0)
    })
  })

  describe('SYSTEM_TEMPLATE_CRITICAL_VARIABLES', () => {
    it('exposes the locked critical-token map (skeleton-locked tokens excluded)', () => {
      expect(SYSTEM_TEMPLATE_CRITICAL_VARIABLES).toEqual({
        magic_link_login: ['expiration_date'],
        reservation_confirmation: ['event_name', 'slot_date', 'slot_time'],
        account_created: [],
        cancellation_confirmation: [],
        role_promoted: [],
        role_demoted: [],
        unregistration_confirmation: ['event_name', 'slot_date', 'slot_time'],
      })
    })

    it.each(SYSTEM_KEYS)(
      'every critical token for %s is also listed as available',
      (key) => {
        const critical = SYSTEM_TEMPLATE_CRITICAL_VARIABLES[key]
        for (const token of critical) {
          expect(SYSTEM_TEMPLATE_VARIABLES[key]).toContain(token)
        }
      },
    )
  })

  describe('findMissingSystemCriticalVariables', () => {
    describe.each(SYSTEM_KEYS)('templateKey=%s', (key) => {
      const critical = SYSTEM_TEMPLATE_CRITICAL_VARIABLES[key]
      const presentBody = critical.map((n) => `{{${n}}}`).join(' ')

      it('returns [] when all critical tokens appear in the concatenation', () => {
        expect(findMissingSystemCriticalVariables(key, presentBody, '')).toEqual(
          [],
        )
        expect(findMissingSystemCriticalVariables(key, '', presentBody)).toEqual(
          [],
        )
      })

      it('returns the full critical list when both fields are empty', () => {
        expect(findMissingSystemCriticalVariables(key, '', '')).toEqual([
          ...critical,
        ])
      })

      it('flags every token that is absent (one missing)', () => {
        if (critical.length === 0) return
        const [first, ...rest] = critical
        const partial = rest.map((n) => `{{${n}}}`).join(' ')
        expect(findMissingSystemCriticalVariables(key, partial, '')).toEqual([
          first,
        ])
      })

      it('treats a token in signatureText as present even when introText is empty', () => {
        const sig = critical.map((n) => `{{${n}}}`).join(' ')
        expect(findMissingSystemCriticalVariables(key, '', sig)).toEqual([])
      })

      it('treats a token in introText as present even when signatureText is empty', () => {
        const intro = critical.map((n) => `{{${n}}}`).join(' ')
        expect(findMissingSystemCriticalVariables(key, intro, '')).toEqual([])
      })

      it('tolerates whitespace inside the braces', () => {
        const variants = critical.map((n) => `{{ ${n} }}`).join(' ')
        expect(findMissingSystemCriticalVariables(key, variants, '')).toEqual([])

        const tabs = critical.map((n) => `{{\t${n}\t}}`).join(' ')
        expect(findMissingSystemCriticalVariables(key, tabs, '')).toEqual([])
      })

      it('ignores skeleton-locked tokens (they are not critical UI-side)', () => {
        // A body without the structural token (magic_link / calendar_url) is
        // still valid — the server skeleton owns it.
        const skeletonOnly = SYSTEM_TEMPLATE_VARIABLES[key]
          .filter((n) => !critical.includes(n))
          .map((n) => `{{${n}}}`)
          .join(' ')
        expect(
          findMissingSystemCriticalVariables(key, skeletonOnly, presentBody),
        ).toEqual([])
      })
    })

    it('flags only the absent token in reservation_confirmation when only slot_date is removed', () => {
      const intro = '{{event_name}} {{slot_time}}'
      expect(
        findMissingSystemCriticalVariables('reservation_confirmation', intro, ''),
      ).toEqual(['slot_date'])
    })

    it('treats the bare token name (no braces) as missing', () => {
      const body = 'event_name slot_date slot_time'
      expect(
        findMissingSystemCriticalVariables('reservation_confirmation', body, ''),
      ).toEqual(['event_name', 'slot_date', 'slot_time'])
    })
  })
})
