import fs from 'node:fs'
import path from 'node:path'
import { EMAIL_BRAND_FACTORY_DEFAULTS } from '../emailBrandDefaults'

describe('emailBrandDefaults — TSDoc divergence-warning header (AC13)', () => {
  const sourcePath = path.join(__dirname, '..', 'emailBrandDefaults.ts')
  const source = fs.readFileSync(sourcePath, 'utf-8')

  // Extract the leading TSDoc block (lines between the first `/**` and the
  // first `*/` of the file). Asserting against the whole file would let a
  // matching string elsewhere (e.g. inside a value) accidentally pass.
  const headerMatch = source.match(/\/\*\*[\s\S]*?\*\//)
  const header = headerMatch?.[0] ?? ''

  it('contains the migration reference (006_email_refactoring.sql:127-129)', () => {
    expect(header).toMatch(/006_email_refactoring\.sql:127-129/i)
  })

  it('warns about ON CONFLICT (id) DO NOTHING', () => {
    expect(header).toMatch(/ON CONFLICT\s*\(id\)\s*DO NOTHING/i)
  })

  it('points to the Réinitialiser le branding admin recovery path', () => {
    expect(header).toMatch(/Réinitialiser le branding/i)
  })

  it('exports the 5 factory values (4 from migration 006 + buttonTextColor from migration 016; background_color dropped in migration 022)', () => {
    expect(EMAIL_BRAND_FACTORY_DEFAULTS).toEqual({
      logoUrl: null,
      primaryColor: '#18181b',
      buttonTextColor: '#ffffff',
      fontFamily: 'Inter, Arial, sans-serif',
      buttonBorderRadius: 4,
    })
  })
})
