/**
 * SSOT drift guard — the hardcoded shell fallback MUST stay byte-identical to
 * the factory card shell (the single source of truth seeded by migration 018
 * and restored by « Restaurer le gabarit d'usine »).
 *
 * Background: the header fallback used to be an independently-defined black band
 * (#18181b). When a DB wipe left `shell_parts` empty, the cascade fell back to
 * that stale fragment and emails rendered the OLD design (regression 2026-06).
 * Deriving the fallback from `INVITATION_FACTORY_*` removed the second source of
 * truth; these assertions are the alarm that fires if anyone re-introduces one.
 *
 * Phase 2 (@timepick/shared): MJ_BODY_BACKGROUND_COLOR is now the SSOT for the
 * page background color. Both HARDCODED_MJ_BODY_ATTRS and INVITATION_FACTORY_MJBODY_MJML
 * derive from it — drift between them is now structurally impossible, but the
 * assertion below keeps the shared constant itself honest.
 */
import {
  HARDCODED_HEADER_TEXT,
  hardcodedHeader,
  hardcodedHeaderLogo,
} from '../shell-hardcoded-fallback'
import { HARDCODED_MJ_BODY_ATTRS } from '../shell-resolver.service'
import {
  INVITATION_FACTORY_HEADER_MJML,
  INVITATION_FACTORY_MJBODY_MJML,
} from '../shell-parts.service'
import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'

describe('shell fallback ↔ factory card SSOT (drift guard)', () => {
  describe('header', () => {
    it('HARDCODED_HEADER_TEXT IS the factory card header (byte-exact)', () => {
      expect(HARDCODED_HEADER_TEXT).toBe(INVITATION_FACTORY_HEADER_MJML)
    })

    it('empty-logo guard: hardcodedHeader("") returns the factory card header', () => {
      expect(hardcodedHeader('')).toBe(INVITATION_FACTORY_HEADER_MJML)
    })

    it('logo variant = the factory card with the brand logo swapped in', () => {
      const url = 'https://cdn.example.com/logo.png'
      const out = hardcodedHeaderLogo(url)
      expect(out).toContain(`<mj-image src="${url}" alt="TimePick" width="160px" align="center">`)
      expect(out).toContain('background-color="#ffffff"')
      expect(out).toContain('border-radius="10px 10px 0px 0px"')
    })
  })

  describe('mj-body', () => {
    it('MJ_BODY_BACKGROUND_COLOR (shared SSOT) vaut #fafafa', () => {
      expect(MJ_BODY_BACKGROUND_COLOR).toBe('#fafafa')
    })
  })
})
