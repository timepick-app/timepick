import { describe, expect, it, vi } from 'vitest'
import {
  BRAND_LOCKED_BUTTON_STYLE_PROPS,
  BRAND_LOCKED_TEXT_STYLE_PROPS,
  applyBrandStyleManagerLock,
  type BrandLockableComponent,
  type BrandLockableEditor,
  type BrandLockableTree,
} from '../brandStyleManagerLock'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Crée un mock de composant avec un tableau `stylable` configurable.
 * `type` est retourné par `get('type')` et `get('stylable')` retourne le
 * tableau courant (mutable pour suivre les appels à `set`).
 */
function makeComp(type: string, stylable: string[]): BrandLockableComponent & {
  set: ReturnType<typeof vi.fn>
} {
  let currentStylable = [...stylable]
  const comp = {
    set: vi.fn((props: Record<string, unknown>) => {
      if ('stylable' in props) {
        currentStylable = props.stylable as string[]
      }
    }),
    get: vi.fn((key: string) => {
      if (key === 'type') return type
      if (key === 'stylable') return currentStylable
      return undefined
    }),
  }
  return comp
}

/** Crée un mock d'editor avec un wrapper contenant les composants donnés. */
function makeEditor(comps: BrandLockableComponent[]): BrandLockableEditor & {
  listeners: Map<string, (...args: unknown[]) => void>
} {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const tree: BrandLockableTree = {
    forEachChild: (fn) => comps.forEach(fn),
  }
  return {
    getWrapper: () => tree,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners.set(event, handler)
    }),
    off: vi.fn((event: string) => {
      listeners.delete(event)
    }),
    listeners,
  }
}

// Stylable par défaut de grapesjs-mjml 1.0.8 pour mj-button
const BUTTON_STYLABLE = [
  'width',
  'height',
  'background-color',
  'container-background-color',
  'font-style',
  'font-size',
  'font-weight',
  'font-family',
  'color',
  'text-decoration',
  'align',
  'vertical-align',
  'text-transform',
  'padding',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border',
  'border-width',
  'border-style',
  'border-color',
]

// Stylable par défaut de grapesjs-mjml 1.0.8 pour mj-text
const TEXT_STYLABLE = [
  'height',
  'font-style',
  'font-size',
  'font-weight',
  'font-family',
  'color',
  'line-height',
  'letter-spacing',
  'text-decoration',
  'align',
  'text-transform',
  'padding',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'container-background-color',
]

// Stylable par défaut de grapesjs-mjml 1.0.8 pour mj-image
const IMAGE_STYLABLE = [
  'width',
  'height',
  'padding',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'container-background-color',
  'align',
]

// ---------------------------------------------------------------------------
// Tests — Denylists
// ---------------------------------------------------------------------------

describe('brandStyleManagerLock — denylists', () => {
  it('(a) BRAND_LOCKED_BUTTON_STYLE_PROPS contient exactement les 8 props visées', () => {
    expect(BRAND_LOCKED_BUTTON_STYLE_PROPS).toEqual([
      'background-color',
      'border-radius',
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
      'font-family',
      'color',
    ])
  })

  it('(a) BRAND_LOCKED_TEXT_STYLE_PROPS contient exactement font-family', () => {
    expect(BRAND_LOCKED_TEXT_STYLE_PROPS).toEqual(['font-family'])
  })

  it('(a) Aucune denylist ne contient container-background-color', () => {
    expect(BRAND_LOCKED_BUTTON_STYLE_PROPS).not.toContain('container-background-color')
    expect(BRAND_LOCKED_TEXT_STYLE_PROPS).not.toContain('container-background-color')
  })
})

// ---------------------------------------------------------------------------
// Tests — applyBrandStyleManagerLock
// ---------------------------------------------------------------------------

describe('brandStyleManagerLock — applyBrandStyleManagerLock', () => {
  it('(b) mj-button : les 8 props interdites sont retirées de stylable', () => {
    const button = makeComp('mj-button', [...BUTTON_STYLABLE])
    const editor = makeEditor([button])

    applyBrandStyleManagerLock(editor)

    // Le dernier set appelé avec { stylable: [...] }
    const setCalls = button.set.mock.calls
    const lastStylableCall = [...setCalls].reverse().find((c: unknown[]) =>
      Array.isArray((c as Record<string, unknown>[])?.[0]?.['stylable']),
    )
    expect(lastStylableCall).toBeDefined()

    const trimmed = (lastStylableCall![0] as Record<string, unknown>).stylable as string[]

    for (const prop of BRAND_LOCKED_BUTTON_STYLE_PROPS) {
      expect(trimmed).not.toContain(prop)
    }

    // Les props légitimes sont conservées
    expect(trimmed).toContain('container-background-color')
    expect(trimmed).toContain('font-size')
    expect(trimmed).toContain('padding')
    expect(trimmed).toContain('border-width')
    expect(trimmed).toContain('align')
  })

  it('(b) mj-text : font-family est retiré de stylable', () => {
    const text = makeComp('mj-text', [...TEXT_STYLABLE])
    const editor = makeEditor([text])

    applyBrandStyleManagerLock(editor)

    const setCalls = text.set.mock.calls
    const lastStylableCall = [...setCalls].reverse().find((c: unknown[]) =>
      Array.isArray((c as Record<string, unknown>[])?.[0]?.['stylable']),
    )
    expect(lastStylableCall).toBeDefined()

    const trimmed = (lastStylableCall![0] as Record<string, unknown>).stylable as string[]
    expect(trimmed).not.toContain('font-family')
    expect(trimmed).toContain('container-background-color')
    expect(trimmed).toContain('font-size')
    expect(trimmed).toContain('color')
  })

  it('(b) mj-image est laissé intact — stylable non modifié', () => {
    const image = makeComp('mj-image', [...IMAGE_STYLABLE])
    const editor = makeEditor([image])

    applyBrandStyleManagerLock(editor)

    // mj-image n'est pas dans BRAND_LOCKED_BY_TYPE → aucun set appelé
    expect(image.set).not.toHaveBeenCalled()
  })

  it('(b) mj-image (dans un editor avec d\'autres composants) : intact', () => {
    const image = makeComp('mj-image', [...IMAGE_STYLABLE])
    const button = makeComp('mj-button', [...BUTTON_STYLABLE])
    const editor = makeEditor([image, button])

    applyBrandStyleManagerLock(editor)

    // image.set ne doit PAS avoir été appelé avec stylable
    const imageSetCalls = image.set.mock.calls
    const stylableCall = imageSetCalls.find((c: unknown[]) =>
      Array.isArray((c as Record<string, unknown>[])?.[0]?.['stylable']),
    )
    expect(stylableCall).toBeUndefined()
  })

  it('(b) mj-divider et mj-spacer sont laissés intacts', () => {
    const divider = makeComp('mj-divider', ['width', 'align', 'padding'])
    const spacer = makeComp('mj-spacer', ['height'])
    const button = makeComp('mj-button', [...BUTTON_STYLABLE])
    const editor = makeEditor([divider, spacer, button])

    applyBrandStyleManagerLock(editor)

    expect(divider.set).not.toHaveBeenCalled()
    expect(spacer.set).not.toHaveBeenCalled()
  })

  it('(c) idempotence — double appel ne duplique pas les retraits', () => {
    const button = makeComp('mj-button', [...BUTTON_STYLABLE])
    const editor = makeEditor([button])

    applyBrandStyleManagerLock(editor)
    applyBrandStyleManagerLock(editor)

    // Compter le nombre d'appels à set avec stylable
    const stylableCalls = button.set.mock.calls.filter((c: unknown[]) =>
      Array.isArray((c as Record<string, unknown>[])?.[0]?.['stylable']),
    )

    // Le deuxième appel ne modifie rien (déjà trimmé), donc set n'est pas
    // rappelé car trimmed.length === current.length.
    expect(stylableCalls.length).toBe(1)
  })

  it('enregistre un listener component:add pour les ajouts futurs', () => {
    const editor = makeEditor([])

    applyBrandStyleManagerLock(editor)

    expect(editor.on).toHaveBeenCalledWith('component:add', expect.any(Function))
  })

  it('le listener component:add traite un nouveau mj-button', () => {
    const editor = makeEditor([])
    applyBrandStyleManagerLock(editor)

    const handler = editor.listeners.get('component:add')!
    const newButton = makeComp('mj-button', [...BUTTON_STYLABLE])

    handler(newButton)

    const stylableCalls = newButton.set.mock.calls.filter((c: unknown[]) =>
      Array.isArray((c as Record<string, unknown>[])?.[0]?.['stylable']),
    )
    expect(stylableCalls.length).toBe(1)

    const trimmed = (stylableCalls[0][0] as Record<string, unknown>).stylable as string[]
    expect(trimmed).not.toContain('background-color')
    expect(trimmed).not.toContain('font-family')
    expect(trimmed).toContain('container-background-color')
  })

  it('uninstall détache le listener component:add', () => {
    const editor = makeEditor([])
    const handle = applyBrandStyleManagerLock(editor)
    expect(editor.listeners.has('component:add')).toBe(true)

    handle.uninstall()

    // Le listener est réellement détaché (off appelé) → plus dans la map.
    expect(editor.off).toHaveBeenCalledWith('component:add', expect.any(Function))
    expect(editor.listeners.has('component:add')).toBe(false)
  })

  it('stylable=true (tout autorisé) est laissé intact — pas de crash', () => {
    const button = makeComp('mj-button', [] as unknown as string[])
    // Simuler stylable=true (booléen, pas tableau)
    const origGet = button.get
    button.get = vi.fn((key: string) => {
      if (key === 'stylable') return true
      return origGet(key)
    })
    const editor = makeEditor([button])

    // Ne doit pas crasher
    applyBrandStyleManagerLock(editor)

    // Pas de set appelé car stylable n'est pas un tableau
    expect(button.set).not.toHaveBeenCalled()
  })

  it('wrapper null est géré sans crash', () => {
    const editor: BrandLockableEditor = {
      getWrapper: () => null,
      on: vi.fn(),
      off: vi.fn(),
    }

    // Ne doit pas crasher
    const handle = applyBrandStyleManagerLock(editor)
    expect(handle.uninstall).toBeTypeOf('function')
  })
})
