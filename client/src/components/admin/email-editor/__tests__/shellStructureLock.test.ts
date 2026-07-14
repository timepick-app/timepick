import { describe, expect, it, vi, type Mock } from 'vitest'
import {
  applyCardLock,
  applyMjBodyLock,
  applyShellDescendantLockFrozen,
  reEnableEditableZones,
  CARD_LOCK_PROPS,
  CARD_STYLABLE,
  DESCENDANT_LOCK_PROPS_FROZEN,
  SYSTEM_EDITABLE_ZONE_CLASSES,
  type LockableComponent,
  type MjBodyLockable,
  type ShellWrapperLike,
} from '../shellStructureLock'

function makeComp(
  attrs: Record<string, string> = {},
  children: LockableComponent[] = [],
): LockableComponent & {
  set: Mock
  addAttributes: Mock
} {
  const comp = {
    set: vi.fn(),
    get: vi.fn((key: string) => (key === 'attributes' ? attrs : undefined)),
    addAttributes: vi.fn((next: Record<string, string>) => {
      Object.assign(attrs, next)
    }),
    components: () => ({ models: children }),
  }
  return comp
}

describe('shellStructureLock — verrou contraint L3a (mode système)', () => {
  // Faux wrapper avec `find('[css-class~="X"]')` : parse le sélecteur attribut
  // et walk l'arbre en matchant la token-list `css-class` du modèle (jamais
  // `.classe` — mémoire `feedback_grapesjs_find_css_class`). Calque le contrat
  // que GrapesJS expose à `reEnableEditableZones`.
  function makeWrapper(roots: LockableComponent[]): ShellWrapperLike {
    function collect(node: LockableComponent, acc: LockableComponent[]): void {
      acc.push(node)
      for (const child of node.components?.()?.models ?? []) collect(child, acc)
    }
    const all: LockableComponent[] = []
    for (const r of roots) collect(r, all)
    return {
      find(sel: string) {
        const m = /\[css-class~="([^"]+)"\]/.exec(sel)
        if (!m) return []
        const cls = m[1]
        return all.filter((c) => {
          const attrs = (c.get('attributes') as Record<string, string> | undefined) ?? {}
          return (attrs['css-class'] ?? '').split(/\s+/).includes(cls)
        })
      },
    }
  }

  it('L3a-1 — applyShellDescendantLockFrozen pose editable:false (récursif)', () => {
    const text1 = makeComp({ 'css-class': 'tp-edit-intro' })
    const button = makeComp()
    const text2 = makeComp({ 'css-class': 'tp-edit-sig' })
    const column = makeComp({}, [text1, button, text2])
    const section = makeComp({ 'css-class': 'locked-shell' }, [column])

    applyShellDescendantLockFrozen(section)

    ;[section, column, text1, button, text2].forEach((c) => {
      expect(c.set).toHaveBeenCalledTimes(1)
      expect(c.set).toHaveBeenCalledWith({
        selectable: true,
        editable: false,
        draggable: false,
        removable: false,
        copyable: false,
        droppable: false,
        toolbar: [],
      })
    })
  })

  it('L3a-2 — reEnableEditableZones ré-ouvre les 2 zones et retourne 2 ; CTA reste figé', () => {
    const intro = makeComp({ 'css-class': 'tp-edit-intro' })
    const button = makeComp()
    const sig = makeComp({ 'css-class': 'tp-edit-sig' })
    const column = makeComp({}, [intro, button, sig])
    const section = makeComp({ 'css-class': 'locked-shell' }, [column])

    // 1) gel contraint de toute la section.
    applyShellDescendantLockFrozen(section)
    // 2) ré-activation ciblée des 2 zones par css-class.
    const wrapper = makeWrapper([section])
    const count = reEnableEditableZones(wrapper, SYSTEM_EDITABLE_ZONE_CLASSES)

    expect(count).toBe(2)

    // Les 2 zones texte : dernier set = editable:true, non supprimable.
    ;[intro, sig].forEach((zone) => {
      const lastCall = zone.set.mock.calls.at(-1)?.[0] as Record<string, unknown>
      expect(lastCall).toMatchObject({
        editable: true,
        removable: false,
        selectable: true,
        draggable: false,
        copyable: false,
      })
      expect(lastCall['toolbar']).toEqual([])
    })

    // Le CTA (mj-button) n'a JAMAIS été ré-activé : non éditable ET non supprimable.
    expect(button.set).toHaveBeenCalledTimes(1)
    expect(button.set).toHaveBeenCalledWith(
      expect.objectContaining({ editable: false, removable: false }),
    )
  })

  it('L3a-3 — reEnableEditableZones retourne 0 si aucune zone (canvas dégénéré)', () => {
    const section = makeComp({ 'css-class': 'locked-shell' }, [makeComp()])
    applyShellDescendantLockFrozen(section)
    const wrapper = makeWrapper([section])
    expect(reEnableEditableZones(wrapper, SYSTEM_EDITABLE_ZONE_CLASSES)).toBe(0)
  })

  it('L3a-4 (drift guard) — DESCENDANT_LOCK_PROPS_FROZEN figé + classes de zone', () => {
    expect(DESCENDANT_LOCK_PROPS_FROZEN).toEqual({
      selectable: true,
      editable: false,
      draggable: false,
      removable: false,
      copyable: false,
      droppable: false,
      toolbar: [],
    })
    expect(SYSTEM_EDITABLE_ZONE_CLASSES).toEqual(['tp-edit-intro', 'tp-edit-sig'])
  })
})

describe('shellStructureLock — applyCardLock (carte content-wrapper, Plan 2026-06-08)', () => {
  it('verrouille la carte : sélectionnable + figée + stylable (fond/bordures/arrondi)', () => {
    const card = makeComp()
    applyCardLock(card)
    expect(card.set).toHaveBeenCalledTimes(1)
    const arg = card.set.mock.calls[0][0] as {
      selectable: boolean
      draggable: boolean
      removable: boolean
      copyable: boolean
      toolbar: unknown[]
      stylable: string[]
    }
    expect(arg.selectable).toBe(true)
    expect(arg.draggable).toBe(false)
    expect(arg.removable).toBe(false)
    expect(arg.copyable).toBe(false)
    expect(arg.toolbar).toEqual([])
    // Style Manager : fond + arrondi + 4 bordures par côté.
    expect(arg.stylable).toEqual([...CARD_STYLABLE])
    expect(arg.stylable).toContain('background-color')
    expect(arg.stylable).toContain('border-radius')
    expect(arg.stylable).toContain('border-top')
    expect(arg.stylable).toContain('border-right')
    expect(arg.stylable).toContain('border-bottom')
    expect(arg.stylable).toContain('border-left')
  })

  it('toolbar est une fresh array par appel (pas la constante partagée)', () => {
    const a = makeComp()
    const b = makeComp()
    applyCardLock(a)
    applyCardLock(b)
    const callDataA = a.set.mock.calls[0][0] as { toolbar: unknown[] }
    const toolbarA = callDataA.toolbar
    const callDataB = b.set.mock.calls[0][0] as { toolbar: unknown[] }
    const toolbarB = callDataB.toolbar
    expect(toolbarA).not.toBe(CARD_LOCK_PROPS.toolbar)
    expect(toolbarA).not.toBe(toolbarB)
  })

  it('mode système (editable:false) : carte NON sélectionnable + NON stylable (miroir Frame verrouillé)', () => {
    const card = makeComp()
    applyCardLock(card, { editable: false })
    expect(card.set).toHaveBeenCalledTimes(1)
    const arg = card.set.mock.calls[0][0] as {
      selectable: boolean
      toolbar: unknown[]
      stylable: string[]
      name: string
    }
    // Miroir du Frame mj-body verrouillé : selectable:false + stylable:[]
    // empêche toute édition fond/bordure qui ne serait pas persistée par la
    // branche système de handleSave (cf. la politique de personnalisation de la coque email — LOCK⟺SAVE).
    expect(arg.selectable).toBe(false)
    expect(arg.stylable).toEqual([])
    expect(arg.name).toBe('Body')
    expect(arg.toolbar).toEqual([])
  })
})

describe('shellStructureLock — applyMjBodyLock (Frame, Plan 1.5)', () => {
  it('pose name=Frame + locks structurels (draggable/removable/selectable) sur l’instance mj-body', () => {
    // Mock minimal d'une instance mj-body : set + get + on (listener
    // change:attributes / change:style) + view.el nul (ensureFrameSignalClass
    // et syncMjBodyPaddingToView sont défensifs sur `view?.el`).
    const mjBody: MjBodyLockable & { set: Mock; on: Mock } = {
      set: vi.fn(),
      get: vi.fn((key: string) => (key === 'attributes' ? {} : undefined)),
      on: vi.fn(),
      view: { el: null },
    }

    applyMjBodyLock(mjBody)

    // Verrouille les invariants qui retomberaient en silence si `set({...})`
    // perdait l'une de ces props : `name:'Frame'` (sinon le Layer panel
    // réaffiche « Body » du plugin grapesjs-mjml), `draggable:false`
    // (poignée drag masquée), `removable:false` (pas de suppression),
    // `selectable:true` (affordance clic préservée).
    expect(mjBody.set).toHaveBeenCalledTimes(1)
    expect(mjBody.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Frame',
        draggable: false,
        removable: false,
        selectable: true,
      }),
    )
  })
})
