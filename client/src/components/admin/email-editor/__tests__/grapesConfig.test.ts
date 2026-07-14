import { describe, it, expect, vi } from 'vitest'
import {
  applyShellRootLock,
  applyDeepLockForInheritedShell,
} from '../grapesConfig'

interface FakeComponent {
  set: ReturnType<typeof vi.fn>
  children: FakeComponent[]
  components: () => { forEach: (cb: (child: FakeComponent) => void) => void }
}

function makeComponent(children: FakeComponent[] = []): FakeComponent {
  return {
    set: vi.fn(),
    children,
    components: () => ({
      forEach: (cb: (child: FakeComponent) => void) => children.forEach(cb),
    }),
  }
}

// Story 26-2 / régression toolbar : la racine reçoit les 3 flags structurels
// + un toolbar vide (masque move/clone/delete/↑ sur la section verrouillée).
const EXPECTED_ROOT_FLAGS = {
  removable: false,
  copyable: false,
  draggable: false,
  toolbar: [],
}

// Inherited blocks get the full 6 flags on root AND descendants (Principe 2
// of the policy — no edit may be entered on content that will not be saved).
const EXPECTED_DEEP_FLAGS = {
  selectable: false,
  editable: false,
  removable: false,
  copyable: false,
  draggable: false,
  hoverable: false,
}

describe('applyShellRootLock — structural-only flags on root, NO recursion', () => {
  it('sets the 3 structural flags on the root component', () => {
    const root = makeComponent()
    applyShellRootLock(root)
    expect(root.set).toHaveBeenCalledTimes(1)
    expect(root.set).toHaveBeenCalledWith(EXPECTED_ROOT_FLAGS)
  })

  it('vide le toolbar avec une fresh array par appel (pas une constante partagée)', () => {
    const a = makeComponent()
    const b = makeComponent()
    applyShellRootLock(a)
    applyShellRootLock(b)
    const toolbarA = (a.set.mock.calls[0][0] as { toolbar: unknown[] }).toolbar
    const toolbarB = (b.set.mock.calls[0][0] as { toolbar: unknown[] }).toolbar
    expect(toolbarA).toEqual([])
    expect(toolbarA).not.toBe(toolbarB)
  })

  it('does NOT touch descendants — children keep their default editable behaviour', () => {
    const grandchild = makeComponent()
    const child = makeComponent([grandchild])
    const root = makeComponent([child])
    applyShellRootLock(root)
    expect(child.set).not.toHaveBeenCalled()
    expect(grandchild.set).not.toHaveBeenCalled()
  })

  it('does NOT include selectable/editable/hoverable in the flag set (root remains styleable)', () => {
    const root = makeComponent()
    applyShellRootLock(root)
    const flagsArg = root.set.mock.calls[0][0]
    expect(flagsArg.selectable).toBeUndefined()
    expect(flagsArg.editable).toBeUndefined()
    expect(flagsArg.hoverable).toBeUndefined()
  })

  it('no-ops on a leaf without throwing', () => {
    const leaf = makeComponent([])
    expect(() => applyShellRootLock(leaf)).not.toThrow()
    expect(leaf.set).toHaveBeenCalledOnce()
  })
})

describe('applyDeepLockForInheritedShell — full lock on root + descendants', () => {
  it('sets the 6 deep lock flags on the root component', () => {
    const root = makeComponent()
    applyDeepLockForInheritedShell(root)
    expect(root.set).toHaveBeenCalledTimes(1)
    expect(root.set).toHaveBeenCalledWith(EXPECTED_DEEP_FLAGS)
  })

  it('recurses to direct children (mj-column under inherited .locked-shell)', () => {
    const child = makeComponent()
    const root = makeComponent([child])
    applyDeepLockForInheritedShell(root)
    expect(child.set).toHaveBeenCalledWith(EXPECTED_DEEP_FLAGS)
  })

  it('recurses to grandchildren (mj-text under mj-column under inherited shell — closes silent edit)', () => {
    const grandchild = makeComponent()
    const child = makeComponent([grandchild])
    const root = makeComponent([child])
    applyDeepLockForInheritedShell(root)
    expect(grandchild.set).toHaveBeenCalledWith(EXPECTED_DEEP_FLAGS)
  })

  it('locks each branch of a multi-child subtree', () => {
    const leaf1 = makeComponent()
    const leaf2 = makeComponent()
    const leaf3 = makeComponent()
    const root = makeComponent([leaf1, leaf2, leaf3])
    applyDeepLockForInheritedShell(root)
    expect(leaf1.set).toHaveBeenCalledWith(EXPECTED_DEEP_FLAGS)
    expect(leaf2.set).toHaveBeenCalledWith(EXPECTED_DEEP_FLAGS)
    expect(leaf3.set).toHaveBeenCalledWith(EXPECTED_DEEP_FLAGS)
  })

  it('no-ops on a leaf (no children) without throwing', () => {
    const leaf = makeComponent([])
    expect(() => applyDeepLockForInheritedShell(leaf)).not.toThrow()
    expect(leaf.set).toHaveBeenCalledOnce()
  })
})

// Plan A3 — bordures par côté dans le secteur Decorations : le prédicat
// `isVisible` doit exclure mj-body (fond de page, bordures sans effet) et
// laisser passer tous les autres types (mj-section, mj-wrapper, etc.).
describe('Plan A3 — border composite isVisible predicate', () => {
  function makeComp(type: string): { is: (t: string) => boolean } {
    return { is: (t: string) => t === type }
  }

  const isVisible = ({ component }: { component?: { is?: (t: string) => boolean } | null }) =>
    component != null && !component.is?.('mj-body')

  it('retourne false pour mj-body (Frame)', () => {
    expect(isVisible({ component: makeComp('mj-body') })).toBe(false)
  })

  it('retourne true pour mj-section (en-tête/pied)', () => {
    expect(isVisible({ component: makeComp('mj-section') })).toBe(true)
  })

  it('retourne true pour mj-wrapper (carte content)', () => {
    expect(isVisible({ component: makeComp('mj-wrapper') })).toBe(true)
  })

  it('retourne false si component est null', () => {
    expect(isVisible({ component: null })).toBe(false)
  })
})
