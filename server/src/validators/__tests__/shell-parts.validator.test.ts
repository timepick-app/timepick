/**
 * Unit tests for `shell-parts.validator.ts` — Story 26.2c / T5.2 + review patches.
 *
 * Layers covered:
 *   1. Path + body schema acceptance / rejection (AC2).
 *   2. UUID lowercasing transform for `ownerKind=event` (P1).
 *   3. Body size + NUL byte rejection (P5, P6).
 *   4. Drift guard parity between `shellPartsPathSchema` and the sibling
 *      `editorContextQuerySchema` (Story 26.1) — the two validators share
 *      the `ownerKindOwnerIdRefine` helper, so parity is now by construction
 *      rather than by textual coincidence. The guard remains as a
 *      defence-in-depth test that catches any future divergence in either
 *      schema's wrapping (e.g. if one schema adds its own superRefine block
 *      on top of the shared helper).
 */

import { ZodError } from 'zod'
import {
  CONTENT_MJML_MAX_BYTES,
  shellPartsBodySchema,
  shellPartsPathSchema,
} from '../shell-parts.validator'
import { editorContextQuerySchema } from '../editor-context.validator'

function expectIssue(fn: () => unknown, matcher: RegExp): void {
  try {
    fn()
    throw new Error('expected schema to throw a ZodError')
  } catch (err) {
    expect(err).toBeInstanceOf(ZodError)
    const messages = (err as ZodError).issues.map((i) => i.message).join(' | ')
    expect(messages).toMatch(matcher)
  }
}

describe('shellPartsPathSchema', () => {
  describe('happy path', () => {
    it('accepts brand singleton', () => {
      const parsed = shellPartsPathSchema.parse({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
      })
      expect(parsed).toEqual({ ownerKind: 'brand', ownerId: '1', partKind: 'header' })
    })

    it('accepts a known templateKey', () => {
      const parsed = shellPartsPathSchema.parse({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'body',
      })
      expect(parsed.ownerId).toBe('invitation')
    })

    it('accepts a valid UUID for event', () => {
      const parsed = shellPartsPathSchema.parse({
        ownerKind: 'event',
        ownerId: '11111111-1111-1111-1111-111111111111',
        partKind: 'footer',
      })
      expect(parsed.partKind).toBe('footer')
    })

    it('lowercases an uppercase event UUID after validation (P1)', () => {
      const parsed = shellPartsPathSchema.parse({
        ownerKind: 'event',
        ownerId: 'AABBCCDD-1111-2222-3333-444455556666',
        partKind: 'header',
      })
      expect(parsed.ownerId).toBe('aabbccdd-1111-2222-3333-444455556666')
    })

    it('does NOT lowercase ownerId for non-event ownerKind', () => {
      const parsed = shellPartsPathSchema.parse({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'body',
      })
      expect(parsed.ownerId).toBe('invitation')
    })
  })

  describe('ownerKind enum', () => {
    it('rejects an unknown ownerKind', () => {
      expectIssue(
        () =>
          shellPartsPathSchema.parse({
            ownerKind: 'unknown',
            ownerId: '1',
            partKind: 'header',
          }),
        /ownerKind must be one of/,
      )
    })
  })

  describe('partKind enum', () => {
    it('rejects an unknown partKind', () => {
      expectIssue(
        () =>
          shellPartsPathSchema.parse({
            ownerKind: 'brand',
            ownerId: '1',
            partKind: 'sidebar',
          }),
        /partKind must be one of/,
      )
    })
  })

  describe('ownerKind ↔ ownerId coupling', () => {
    it('rejects ownerKind=event with non-UUID ownerId', () => {
      expectIssue(
        () =>
          shellPartsPathSchema.parse({
            ownerKind: 'event',
            ownerId: 'not-a-uuid',
            partKind: 'header',
          }),
        /UUID/,
      )
    })

    it('rejects ownerKind=template with unknown templateKey', () => {
      expectIssue(
        () =>
          shellPartsPathSchema.parse({
            ownerKind: 'template',
            ownerId: 'newsletter',
            partKind: 'header',
          }),
        /known templateKey/,
      )
    })

    it('rejects ownerKind=brand with ownerId != "1"', () => {
      expectIssue(
        () =>
          shellPartsPathSchema.parse({
            ownerKind: 'brand',
            ownerId: '42',
            partKind: 'header',
          }),
        /singleton/,
      )
    })
  })

  describe('strict object', () => {
    it('rejects unknown keys', () => {
      expectIssue(
        () =>
          shellPartsPathSchema.parse({
            ownerKind: 'brand',
            ownerId: '1',
            partKind: 'header',
            extra: 'rogue',
          }),
        /[Uu]nrecognized/,
      )
    })
  })
})

describe('shellPartsBodySchema', () => {
  it('accepts a non-empty contentMjml', () => {
    expect(shellPartsBodySchema.parse({ contentMjml: '<mj-section/>' })).toEqual({
      contentMjml: '<mj-section/>',
    })
  })

  it('rejects an empty contentMjml', () => {
    expectIssue(
      () => shellPartsBodySchema.parse({ contentMjml: '' }),
      /contentMjml is empty/,
    )
  })

  it('rejects a missing contentMjml', () => {
    expectIssue(
      () => shellPartsBodySchema.parse({}),
      /[Rr]equired|contentMjml/,
    )
  })

  it('rejects a contentMjml larger than the size limit (P5)', () => {
    expectIssue(
      () =>
        shellPartsBodySchema.parse({
          contentMjml: 'x'.repeat(CONTENT_MJML_MAX_BYTES + 1),
        }),
      /exceeds size limit/,
    )
  })

  it('accepts a contentMjml exactly at the size limit', () => {
    expect(
      shellPartsBodySchema.parse({
        contentMjml: 'x'.repeat(CONTENT_MJML_MAX_BYTES),
      }).contentMjml.length,
    ).toBe(CONTENT_MJML_MAX_BYTES)
  })

  it('rejects a contentMjml containing a NUL byte (P6)', () => {
    expectIssue(
      () =>
        shellPartsBodySchema.parse({
          contentMjml: '<mj-section>\x00</mj-section>',
        }),
      /NUL byte/,
    )
  })

  it('rejects extra unknown keys (.strict)', () => {
    expectIssue(
      () =>
        shellPartsBodySchema.parse({
          contentMjml: '<mj-section/>',
          rogue: 'x',
        }),
      /[Uu]nrecognized/,
    )
  })
})

// ---------------------------------------------------------------------------
// Drift guard: parity with editor-context.validator.ts (Story 26.1 / P10/P13)
// ---------------------------------------------------------------------------

/**
 * Captures the issues on path 'ownerId' from a schema's ZodError so the two
 * validators can be compared structurally, not just on first-message text.
 * After P10 (shared `ownerKindOwnerIdRefine` helper) the count and messages
 * are identical by construction; this remains a defence-in-depth regression
 * test in case a future caller layers an extra superRefine on top.
 */
function captureOwnerIdIssues(
  schema: typeof shellPartsPathSchema | typeof editorContextQuerySchema,
  input: Record<string, string>,
): { count: number; messages: string[] } {
  try {
    schema.parse(input)
    return { count: 0, messages: [] }
  } catch (err) {
    if (!(err instanceof ZodError)) throw err
    const issues = err.issues.filter((i) => i.path.join('.') === 'ownerId')
    return { count: issues.length, messages: issues.map((i) => i.message) }
  }
}

describe('drift guard: shellPartsPathSchema ↔ editorContextQuerySchema', () => {
  const cases: Array<{
    label: string
    shellInput: Record<string, string>
    editorInput: Record<string, string>
  }> = [
    {
      label: 'ownerKind=event with non-UUID ownerId',
      shellInput: { ownerKind: 'event', ownerId: 'not-a-uuid', partKind: 'header' },
      editorInput: { ownerKind: 'event', ownerId: 'not-a-uuid', templateKey: 'invitation' },
    },
    {
      label: 'ownerKind=template with unknown templateKey',
      shellInput: { ownerKind: 'template', ownerId: 'newsletter', partKind: 'header' },
      editorInput: { ownerKind: 'template', ownerId: 'newsletter', templateKey: 'invitation' },
    },
    {
      label: 'ownerKind=brand with ownerId != "1"',
      shellInput: { ownerKind: 'brand', ownerId: '42', partKind: 'header' },
      editorInput: { ownerKind: 'brand', ownerId: '42', templateKey: 'invitation' },
    },
  ]

  for (const { label, shellInput, editorInput } of cases) {
    it(`produces the same count and messages for ${label}`, () => {
      const shell = captureOwnerIdIssues(shellPartsPathSchema, shellInput)
      const editor = captureOwnerIdIssues(editorContextQuerySchema, editorInput)
      expect(shell.count).toBeGreaterThan(0)
      expect(shell.count).toBe(editor.count)
      expect(shell.messages).toEqual(editor.messages)
    })
  }
})
