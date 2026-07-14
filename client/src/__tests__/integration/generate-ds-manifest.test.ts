import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

// Vitest cwd is `client/` (see scripts/run-vitest-single.js).
// import.meta.dirname → client/src/__tests__/integration
// Walk up 4 levels to reach the repo root.
const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..')
const MANIFEST = resolve(ROOT, 'docs', 'DESIGN_SYSTEM.md')

describe('generate-ds-manifest', () => {
  let manifestContent: string

  beforeAll(() => {
    execSync('npm run generate:ds', { cwd: ROOT, stdio: 'pipe' })
    manifestContent = readFileSync(MANIFEST, 'utf8')
  })

  it('produces docs/DESIGN_SYSTEM.md when run', () => {
    expect(existsSync(MANIFEST)).toBe(true)
  })

  it('manifest contains all 5 migrated components', () => {
    expect(manifestContent).toMatch(/## Button/)
    expect(manifestContent).toMatch(/## Badge/)
    expect(manifestContent).toMatch(/## Typography/)
    expect(manifestContent).toMatch(/## ToggleGroup/)
    expect(manifestContent).toMatch(/## Tabs/)
  })

  it('manifest mentions the import path for each component', () => {
    expect(manifestContent).toMatch(/@\/components\/ui\/button/)
    expect(manifestContent).toMatch(/@\/components\/ui\/badge/)
    expect(manifestContent).toMatch(/@\/components\/ui\/typography/)
    expect(manifestContent).toMatch(/@\/components\/ui\/toggle-group/)
    expect(manifestContent).toMatch(/@\/components\/ui\/tabs/)
  })

  it('manifest header warns it is auto-generated', () => {
    expect(manifestContent).toMatch(/auto-generated|généré automatiquement/i)
  })
})
