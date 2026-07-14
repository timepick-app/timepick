import { describe, it, expect, vi } from 'vitest'
import type { Editor } from 'grapesjs'
import { registerVariableBlocks } from '../variableBlock'

function makeFakeEditor() {
  const calls: Array<{ id: string; def: { label: string; category: string; content: string } }> = []
  const editor = {
    BlockManager: {
      add: vi.fn((id: string, def: { label: string; category: string; content: string }) => {
        calls.push({ id, def })
      }),
    },
  } as unknown as Editor
  return { editor, calls }
}

describe('registerVariableBlocks', () => {
  it('adds one block per variable with the canonical id prefix', () => {
    const { editor, calls } = makeFakeEditor()
    registerVariableBlocks(editor, ['event_name', 'magic_link'])
    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.id)).toEqual(['var-event_name', 'var-magic_link'])
  })

  it('uses the {{name}} label format', () => {
    const { editor, calls } = makeFakeEditor()
    registerVariableBlocks(editor, ['user_email'])
    expect(calls[0].def.label).toBe('{{user_email}}')
  })

  it('places blocks under the Variables category', () => {
    const { editor, calls } = makeFakeEditor()
    registerVariableBlocks(editor, ['x'])
    expect(calls[0].def.category).toBe('Variables')
  })

  it('produces the canonical mj-text + email-token content', () => {
    const { editor, calls } = makeFakeEditor()
    registerVariableBlocks(editor, ['foo'])
    expect(calls[0].def.content).toBe(
      '<mj-text padding="4px 0"><span class="email-token">{{foo}}</span></mj-text>',
    )
  })

  it('is a no-op for an empty variables array', () => {
    const { editor, calls } = makeFakeEditor()
    registerVariableBlocks(editor, [])
    expect(calls).toHaveLength(0)
  })

  it('preserves variable order', () => {
    const { editor, calls } = makeFakeEditor()
    registerVariableBlocks(editor, ['c', 'a', 'b'])
    expect(calls.map((c) => c.id)).toEqual(['var-c', 'var-a', 'var-b'])
  })
})
