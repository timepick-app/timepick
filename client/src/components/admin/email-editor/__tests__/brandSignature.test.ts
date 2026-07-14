import { describe, it, expect } from 'vitest'
import { decideBrandRebuild } from '../brandSignature'

const PREVIEW_A = JSON.stringify(['#18181b', 'Inter, Arial, sans-serif', 4])
const PREVIEW_B = JSON.stringify(['#7e65bd', 'Georgia, serif', 12])
const STRUCT_A = JSON.stringify([null, '#ffffff', '<header-a>', '<footer-a>'])
// Couleur placeholder ARBITRAIRE (≠ fond email) — sert uniquement à distinguer
// STRUCT_B de STRUCT_A. Ne pas importer MJ_BODY_BACKGROUND_COLOR ici : ce n'est
// pas la couleur de fond, juste un marqueur de différence structurelle.
const STRUCT_B = JSON.stringify(['/uploads/logo.png', '#aabbcc', '<header-b>', '<footer-b>'])

describe('decideBrandRebuild (Plan 5a defer-A)', () => {
  it('returns "skip" when nothing changed (dirty or not)', () => {
    expect(decideBrandRebuild(PREVIEW_A, STRUCT_A, PREVIEW_A, STRUCT_A, false)).toBe('skip')
    expect(decideBrandRebuild(PREVIEW_A, STRUCT_A, PREVIEW_A, STRUCT_A, true)).toBe('skip')
  })

  it('returns "full" on a clean canvas for any change', () => {
    expect(decideBrandRebuild(PREVIEW_A, STRUCT_A, PREVIEW_B, STRUCT_A, false)).toBe('full')
    expect(decideBrandRebuild(PREVIEW_A, STRUCT_A, PREVIEW_A, STRUCT_B, false)).toBe('full')
    expect(decideBrandRebuild(PREVIEW_A, STRUCT_A, PREVIEW_B, STRUCT_B, false)).toBe('full')
  })

  it('returns "preview-dirty" when a preview field changes while dirty', () => {
    expect(decideBrandRebuild(PREVIEW_A, STRUCT_A, PREVIEW_B, STRUCT_A, true)).toBe('preview-dirty')
  })

  it('returns "skip" when ONLY a structural field changes while dirty (deferred)', () => {
    expect(decideBrandRebuild(PREVIEW_A, STRUCT_A, PREVIEW_A, STRUCT_B, true)).toBe('skip')
  })

  it('returns "preview-dirty" when preview AND structural both change while dirty (preview applied, structural deferred)', () => {
    // Regression guard for review finding F3 — a color tweak must still preview
    // even when a logo override is co-pending while the canvas is dirty.
    expect(decideBrandRebuild(PREVIEW_A, STRUCT_A, PREVIEW_B, STRUCT_B, true)).toBe('preview-dirty')
  })
})
