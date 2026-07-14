/**
 * SSOT drift guard (review finding P2, 2026-06-08).
 *
 * The common-shell "card" factory MJML is duplicated byte-exact across three
 * sites: migration 018 SQL literals, the `INVITATION_FACTORY_*_MJML` TS
 * constants, and the baseline/reset test seeds (which consume the TS constants).
 * The test DB boots from the raw migration SQL, while the render/reset suites
 * re-seed via the TS constants — so a future desync between the SQL and the
 * constants would make a fresh install diverge from the post-reset/test state
 * with NO suite failing, silently defeating the "fresh-install factory ==
 * admin-saved card" guarantee.
 *
 * This guard reads the migration SQL and asserts its dollar-quoted literals are
 * byte-exact with the TS single-source-of-truth, closing the loop.
 */

import fs from 'fs'
import path from 'path'
import {
  INVITATION_FACTORY_HEADER_MJML,
  INVITATION_FACTORY_CONTENT_WRAPPER_MJML,
  INVITATION_FACTORY_MJBODY_MJML,
} from '../../services/shell-parts.service'

const MIGRATION_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/018_seed_common_card_shell.sql'),
  'utf8',
)

// Extract every `$tag$ ... $tag$` dollar-quoted literal body (non-greedy).
function dollarLiterals(tag: string, sql: string): string[] {
  const re = new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) out.push(m[1])
  return out
}

describe('migration 018 ↔ TS SSOT factory shell (drift guard)', () => {
  it('header SQL literal is byte-exact with INVITATION_FACTORY_HEADER_MJML', () => {
    const lits = dollarLiterals('h', MIGRATION_SQL)
    expect(lits).toHaveLength(1)
    expect(lits[0]).toBe(INVITATION_FACTORY_HEADER_MJML)
  })

  it('content-wrapper SQL literal is byte-exact with INVITATION_FACTORY_CONTENT_WRAPPER_MJML', () => {
    const lits = dollarLiterals('c', MIGRATION_SQL)
    expect(lits).toHaveLength(1)
    expect(lits[0]).toBe(INVITATION_FACTORY_CONTENT_WRAPPER_MJML)
  })

  it('mj-body SQL literal is byte-exact with INVITATION_FACTORY_MJBODY_MJML', () => {
    const lits = dollarLiterals('m', MIGRATION_SQL)
    expect(lits).toHaveLength(1)
    expect(lits[0]).toBe(INVITATION_FACTORY_MJBODY_MJML)
  })

  it('both invitation-body SQL literals match each other', () => {
    const bodies = dollarLiterals('body', MIGRATION_SQL)
    // 2a (body_mjml conditional) + 2b (default_body_mjml) must be identical.
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toBe(bodies[1])
  })
})
