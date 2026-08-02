import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractBodyFragment,
  wrapBodyForEditing,
  isBodyMarkerIntact,
  addLockedShellClass,
  addLockedLabel,
  addPartKindAttr,
  addInheritedAttr,
  stripBodyMarkers,
  extractCardAttrsBlob,
  tagSectionWithPartKind,
  extractMjBodyAttrs,
  mjBodyAttrsEqual,
  isShellMarkersIntact,
  extractShellSections,
  normalizeShellFragment,
  isShellDirty,
  extractContentWrapperFromCanvas,
  type BrandShellTokens,
  type ResolvedShellForCanvas,
} from '../bodyExtraction'
import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'

const brand: BrandShellTokens = {
  logoUrl: null,
  primaryColor: '#18181b',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
}

const seedBody = `<mj-section background-color="#f9f9f9" padding="20px">
  <mj-column>
    <mj-text padding-bottom="8px">Bonjour {{event_name}},</mj-text>
    <mj-image src="https://example.com/img.png" alt="Illustration"></mj-image>
    <mj-button href="{{magic_link}}">Réserver mon créneau</mj-button>
  </mj-column>
</mj-section>`

describe('extractBodyFragment', () => {
  it('returns the fragment between markers on a valid wrapped document', () => {
    const wrapped = wrapBodyForEditing(seedBody, brand)
    expect(extractBodyFragment(wrapped)).toBe(seedBody)
  })

  it('throws when BODY:START marker is missing', () => {
    const broken = '<mjml>...<!-- BODY:END -->...</mjml>'
    expect(() => extractBodyFragment(broken)).toThrow('Body markers missing')
  })

  it('throws when BODY:END marker is missing', () => {
    const broken = '<mjml>...<!-- BODY:START -->...</mjml>'
    expect(() => extractBodyFragment(broken)).toThrow('Body markers missing')
  })

  it('throws when both markers are missing', () => {
    expect(() => extractBodyFragment('<mjml></mjml>')).toThrow('Body markers missing')
  })

  it('returns empty string when body between markers is empty', () => {
    const empty = '<!-- BODY:START -->\n  \n<!-- BODY:END -->'
    expect(extractBodyFragment(empty)).toBe('')
  })

  it('preserves internal whitespace and indentation', () => {
    const fragment = '<mj-section>\n      <mj-column>X</mj-column>\n    </mj-section>'
    const wrapped = `<!-- BODY:START -->\n${fragment}\n<!-- BODY:END -->`
    expect(extractBodyFragment(wrapped)).toBe(fragment)
  })

  it('survives round-trip with self-closing-forbidden body containing explicit-close mj-image', () => {
    const body = '<mj-section><mj-column><mj-image src="x.png"></mj-image></mj-column></mj-section>'
    const wrapped = wrapBodyForEditing(body, brand)
    expect(extractBodyFragment(wrapped)).toBe(body)
  })

  it('strips brand button attrs from extracted body so saved fragment stays brand-agnostic (D-ext5)', () => {
    const wrapped = wrapBodyForEditing(seedBody, brand)
    const extracted = extractBodyFragment(wrapped)
    // Extracted fragment must not carry brand attrs back into the DB.
    expect(extracted).not.toMatch(/<mj-button [^>]*background-color=/)
    expect(extracted).not.toMatch(/<mj-button [^>]*border-radius=/)
    // Non-brand attrs (href) preserved.
    expect(extracted).toContain('href="{{magic_link}}"')
  })

  it('strips brand attrs even when the saved canvas had them baked in (defensive)', () => {
    const baked = '<!-- BODY:START --><mj-button href="x" background-color="#123456" color="#fff" border-radius="8px">X</mj-button><!-- BODY:END -->'
    expect(extractBodyFragment(baked)).toBe('<mj-button href="x">X</mj-button>')
  })
})

describe('isBodyMarkerIntact', () => {
  it('returns true when both markers are present', () => {
    expect(isBodyMarkerIntact(wrapBodyForEditing(seedBody, brand))).toBe(true)
  })

  it('returns false when BODY:START is missing', () => {
    expect(isBodyMarkerIntact('<!-- BODY:END -->')).toBe(false)
  })

  it('returns false when BODY:END is missing', () => {
    expect(isBodyMarkerIntact('<!-- BODY:START -->')).toBe(false)
  })

  it('returns false on empty string', () => {
    expect(isBodyMarkerIntact('')).toBe(false)
  })
})

describe('wrapBodyForEditing', () => {
  it('contains both BODY markers', () => {
    const out = wrapBodyForEditing(seedBody, brand)
    expect(out).toContain('<!-- BODY:START -->')
    expect(out).toContain('<!-- BODY:END -->')
  })

  it('contains two locked-shell sections (header + footer)', () => {
    const out = wrapBodyForEditing(seedBody, brand)
    const matches = out.match(/css-class="locked-shell"/g)
    expect(matches?.length).toBe(2)
  })

  it('does not emit an <mj-head> block (the server owns the authoritative head)', () => {
    const out = wrapBodyForEditing(seedBody, brand)
    expect(out).not.toContain('<mj-head>')
  })

  it('applies the brand primary color directly on body mj-buttons', () => {
    const out = wrapBodyForEditing(seedBody, { ...brand, primaryColor: '#ff0000' })
    expect(out).toContain('background-color="#ff0000"')
    expect(out).toMatch(/<mj-button [^>]*background-color="#ff0000"/)
  })

  it('emits the hardcoded mj-body background (MJ_BODY_BACKGROUND_COLOR) when no resolvedShell (parity 2-args)', () => {
    const out = wrapBodyForEditing(seedBody, brand)
    expect(out).toContain(`<mj-body background-color="${MJ_BODY_BACKGROUND_COLOR}"`)
    // No cascade → no padding-top/padding-bottom attrs on the <mj-body> TAG
    // (the footer fallback legitimately carries padding-top="0", so scope the
    // assertion to the mj-body open tag, not the whole document).
    expect(out).not.toMatch(/<mj-body[^>]*padding-top/)
  })

  it('cascades resolvedShell.mjBody attrs onto mj-body (background + paddings)', () => {
    const resolvedShell: ResolvedShellForCanvas = {
      header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'template' },
      footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'brand' },
      mjBody: { backgroundColor: MJ_BODY_BACKGROUND_COLOR, paddingTop: '10px', paddingBottom: '20px' },
    }
    const out = wrapBodyForEditing(seedBody, brand, resolvedShell)
    expect(out).toContain(`<mj-body background-color="${MJ_BODY_BACKGROUND_COLOR}" padding-top="10px" padding-bottom="20px"`)
  })

  it('applies the brand button border radius directly on body mj-buttons', () => {
    const out = wrapBodyForEditing(seedBody, { ...brand, buttonBorderRadius: 12 })
    expect(out).toMatch(/<mj-button [^>]*border-radius="12px"/)
  })

  it('overrides any pre-existing brand attrs on body buttons (brand always wins)', () => {
    const customized = '<mj-section><mj-column><mj-button background-color="#abcdef" color="#000000" border-radius="99px" href="x">X</mj-button></mj-column></mj-section>'
    const out = wrapBodyForEditing(customized, { ...brand, primaryColor: '#123456', buttonBorderRadius: 6 })
    expect(out).toContain('background-color="#123456"')
    expect(out).toContain('border-radius="6px"')
    expect(out).not.toContain('#abcdef')
    expect(out).not.toContain('99px')
    // Non-brand attrs (href, label) preserved.
    expect(out).toContain('href="x"')
    expect(out).toContain('>X<')
  })

  it('injects an <img> when logoUrl is provided', () => {
    const out = wrapBodyForEditing(seedBody, { ...brand, logoUrl: '/uploads/logo.png' })
    expect(out).toContain('<img src="/uploads/logo.png"')
  })

  it('falls back to TimePick text when logoUrl is null', () => {
    const out = wrapBodyForEditing(seedBody, { ...brand, logoUrl: null })
    expect(out).toContain('>TimePick<')
    expect(out).not.toContain('<img')
  })

  it('escapes attribute values to prevent injection', () => {
    const out = wrapBodyForEditing(seedBody, {
      ...brand,
      logoUrl: '"><script>alert(1)</script>',
    })
    expect(out).not.toContain('<script>')
    expect(out).toContain('&quot;')
  })

  it('still produces two locked-shell sections when no resolvedShell is passed (backward compat)', () => {
    const out = wrapBodyForEditing(seedBody, brand)
    const matches = out.match(/css-class="locked-shell"/g)
    expect(matches?.length).toBe(2)
    expect(out).toContain('data-locked-label="En-tête"')
    expect(out).toContain('data-locked-label="Pied"')
  })

  it('substitutes header and footer with the resolved shell fragments and injects css-class="locked-shell" + data-locked-label', () => {
    const resolvedShell: ResolvedShellForCanvas = {
      header: {
        contentMjml:
          '<mj-section background-color="#0066ff" padding="20px"><mj-column><mj-text>Custom header</mj-text></mj-column></mj-section>',
        origin: 'template',
      },
      footer: {
        contentMjml:
          '<mj-section padding="10px"><mj-column><mj-text>Custom footer</mj-text></mj-column></mj-section>',
        origin: 'brand',
      },
      mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    }
    const out = wrapBodyForEditing(seedBody, brand, resolvedShell)

    expect(out).toContain('background-color="#0066ff"')
    expect(out).toContain('Custom header')
    expect(out).toContain('Custom footer')
    // Both resolved sections must carry the lock class so GrapesJS find('.locked-shell') matches them.
    const matches = out.match(/css-class="locked-shell"/g)
    expect(matches?.length).toBe(2)
    // Permanent labels for AC6.
    expect(out).toContain('data-locked-label="En-tête"')
    expect(out).toContain('data-locked-label="Pied"')
    // Hardcoded TimePick header text must NOT appear when a resolvedShell is supplied.
    expect(out).not.toContain('>TimePick<')
  })
})

describe('addLockedShellClass', () => {
  it('appends css-class="locked-shell" on a fragment without any existing css-class', () => {
    const fragment =
      '<mj-section background-color="#000" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addLockedShellClass(fragment)
    expect(out).toContain('css-class="locked-shell"')
    expect(out).toContain('background-color="#000"')
  })

  it('prepends "locked-shell " to an existing css-class value (Q7 — preserves admin intent)', () => {
    const fragment =
      '<mj-section css-class="custom-style" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addLockedShellClass(fragment)
    expect(out).toContain('css-class="locked-shell custom-style"')
  })

  it('is idempotent — re-applying does not duplicate the class', () => {
    const fragment =
      '<mj-section css-class="locked-shell custom" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addLockedShellClass(fragment)
    expect(out).toBe(fragment)
  })

  it('only mutates the first <mj-section> in the fragment (leaves nested ones untouched)', () => {
    const fragment =
      '<mj-section padding="10px"><mj-column><mj-section padding="20px"></mj-section></mj-column></mj-section>'
    const out = addLockedShellClass(fragment)
    const matches = out.match(/css-class="locked-shell"/g)
    expect(matches?.length).toBe(1)
  })
})

describe('addLockedLabel', () => {
  it('appends data-locked-label on the first <mj-section>', () => {
    const fragment =
      '<mj-section padding="20px"><mj-column></mj-column></mj-section>'
    const out = addLockedLabel(fragment, 'En-tête')
    expect(out).toContain('data-locked-label="En-tête"')
  })

  it('replaces a pre-existing data-locked-label (idempotent across re-wraps)', () => {
    const fragment =
      '<mj-section data-locked-label="Old" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addLockedLabel(fragment, 'Pied')
    expect(out).toContain('data-locked-label="Pied"')
    expect(out).not.toContain('data-locked-label="Old"')
  })

  it('escapes double-quotes in the label value (P7)', () => {
    const fragment =
      '<mj-section padding="20px"><mj-column></mj-column></mj-section>'
    const out = addLockedLabel(fragment, 'Risky "label"')
    expect(out).toContain('data-locked-label="Risky &quot;label&quot;"')
    expect(out).not.toContain('"Risky "label""')
  })
})

describe('addLockedShellClass — robustness (P7)', () => {
  it('produces "locked-shell" (no trailing space) when css-class is empty string', () => {
    const fragment =
      '<mj-section css-class="" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addLockedShellClass(fragment)
    expect(out).toContain('css-class="locked-shell"')
    expect(out).not.toContain('css-class="locked-shell "')
  })

  it('treats "locked-shell" in any position of an existing css-class as already-applied', () => {
    const fragment =
      '<mj-section css-class="custom locked-shell other" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addLockedShellClass(fragment)
    // Should not duplicate the class — output preserves the original ordering.
    const matches = out.match(/\blocked-shell\b/g)
    expect(matches?.length).toBe(1)
  })
})

describe('addLockedShellClass / addLockedLabel / addPartKindAttr — fragment without mj-section (P6)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('addLockedShellClass returns the fragment unchanged + warns in dev when no <mj-section> is present', () => {
    const fragment = '<mj-wrapper><mj-column></mj-column></mj-wrapper>'
    const out = addLockedShellClass(fragment)
    expect(out).toBe(fragment)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('addLockedLabel returns the fragment unchanged + warns in dev when no <mj-section> is present', () => {
    const out = addLockedLabel('', 'En-tête')
    expect(out).toBe('')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('addPartKindAttr returns the fragment unchanged + warns in dev when no <mj-section> is present', () => {
    const out = addPartKindAttr('   ', 'header')
    expect(out).toBe('   ')
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('addPartKindAttr (P13)', () => {
  it('appends data-part-kind on the first <mj-section>', () => {
    const fragment =
      '<mj-section padding="20px"><mj-column></mj-column></mj-section>'
    const out = addPartKindAttr(fragment, 'header')
    expect(out).toContain('data-part-kind="header"')
  })

  it('replaces a pre-existing data-part-kind (idempotent)', () => {
    const fragment =
      '<mj-section data-part-kind="footer" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addPartKindAttr(fragment, 'header')
    expect(out).toContain('data-part-kind="header"')
    expect(out).not.toContain('data-part-kind="footer"')
  })

  it('only mutates the first <mj-section> in the fragment', () => {
    const fragment =
      '<mj-section padding="10px"><mj-column><mj-section padding="20px"></mj-section></mj-column></mj-section>'
    const out = addPartKindAttr(fragment, 'header')
    const matches = out.match(/data-part-kind="header"/g)
    expect(matches?.length).toBe(1)
  })
})

describe('wrapBodyForEditing — partKind tagging in MJML (P13)', () => {
  it('tags the hardcoded header and footer with data-part-kind when no resolvedShell is provided', () => {
    const out = wrapBodyForEditing(seedBody, brand)
    expect(out).toContain('data-part-kind="header"')
    expect(out).toContain('data-part-kind="footer"')
  })

  it('tags resolved header and footer with the right data-part-kind values', () => {
    const resolvedShell: ResolvedShellForCanvas = {
      header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'template' },
      footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'brand' },
      mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    }
    const out = wrapBodyForEditing(seedBody, brand, resolvedShell)
    expect(out).toContain('data-part-kind="header"')
    expect(out).toContain('data-part-kind="footer"')
  })
})

describe('addInheritedAttr (Story 26-2 fix)', () => {
  it('appends data-inherited="true" on the first <mj-section> when isInherited=true', () => {
    const fragment = '<mj-section padding="20px"><mj-column></mj-column></mj-section>'
    const out = addInheritedAttr(fragment, true)
    expect(out).toContain('data-inherited="true"')
  })

  it('strips any pre-existing data-inherited attribute when isInherited=false', () => {
    const fragment =
      '<mj-section data-inherited="true" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addInheritedAttr(fragment, false)
    expect(out).not.toContain('data-inherited')
  })

  it('replaces a pre-existing data-inherited="false" with data-inherited="true" idempotently', () => {
    const fragment =
      '<mj-section data-inherited="false" padding="20px"><mj-column></mj-column></mj-section>'
    const out = addInheritedAttr(fragment, true)
    expect(out).toContain('data-inherited="true"')
    expect(out.match(/data-inherited=/g)?.length).toBe(1)
  })

  it('only mutates the first <mj-section> in the fragment', () => {
    const fragment =
      '<mj-section padding="10px"><mj-column><mj-section padding="20px"></mj-section></mj-column></mj-section>'
    const out = addInheritedAttr(fragment, true)
    expect(out.match(/data-inherited="true"/g)?.length).toBe(1)
  })
})

describe('wrapBodyForEditing — inherited marking (shellLock condition — Lot 2)', () => {
  const resolvedShell: ResolvedShellForCanvas = {
    header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'template' },
    footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'brand' },
    mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
  }

  function extractHeaderSection(mjml: string): string {
    // The header section comes BEFORE the BODY:START marker.
    const idx = mjml.indexOf('<!-- BODY:START -->')
    return mjml.slice(0, idx)
  }

  function extractFooterSection(mjml: string): string {
    const idx = mjml.indexOf('<!-- BODY:END -->')
    return mjml.slice(idx)
  }

  // Lot 2 T4 — la coque (header/footer) n'est éditable QUE dans l'éditeur
  // Invitation (ownerKind==='template' && !isSystem). Éditeurs système → coque
  // verrouillée (header/footer inherited → deep-lock). Niveau événement → un
  // bloc est hérité ssi son origin !== 'event'. Sans shellLock (call-sites non
  // migrés), tout reste verrouillé (fallback inherited=true).

  it('locks BOTH blocks (inherited=true) when no shellLock is supplied (fallback for unmigrated call-sites)', () => {
    const out = wrapBodyForEditing(seedBody, brand, resolvedShell)
    expect(extractHeaderSection(out)).toContain('data-inherited="true"')
    expect(extractFooterSection(out)).toContain('data-inherited="true"')
  })

  it('marks BOTH blocks EDITABLE (no data-inherited) when shellLock = Invitation editor (ownerKind=template, isSystem=false)', () => {
    const out = wrapBodyForEditing(seedBody, brand, resolvedShell, {
      ownerKind: 'template',
      isSystem: false,
    })
    expect(extractHeaderSection(out)).not.toContain('data-inherited')
    expect(extractFooterSection(out)).not.toContain('data-inherited')
  })

  it('locks BOTH blocks (inherited=true) when shellLock = system editor (ownerKind=template, isSystem=true)', () => {
    const out = wrapBodyForEditing(seedBody, brand, resolvedShell, {
      ownerKind: 'template',
      isSystem: true,
    })
    expect(extractHeaderSection(out)).toContain('data-inherited="true"')
    expect(extractFooterSection(out)).toContain('data-inherited="true"')
  })

  it('at event level, marks a block inherited when its origin !== "event" (template/brand inherited)', () => {
    const out = wrapBodyForEditing(seedBody, brand, resolvedShell, { ownerKind: 'event' })
    // header.origin = 'template' (≠ event) → inherited
    expect(extractHeaderSection(out)).toContain('data-inherited="true"')
    // footer.origin = 'brand' (≠ event) → inherited
    expect(extractFooterSection(out)).toContain('data-inherited="true"')
  })

  it('at event level, marks a block EDITABLE (no data-inherited) when its origin === "event"', () => {
    const eventOwnedShell: ResolvedShellForCanvas = {
      header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'event' },
      footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'event' },
      mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    }
    const out = wrapBodyForEditing(seedBody, brand, eventOwnedShell, { ownerKind: 'event' })
    expect(extractHeaderSection(out)).not.toContain('data-inherited')
    expect(extractFooterSection(out)).not.toContain('data-inherited')
  })

  it('hardcoded fallback (no resolvedShell) follows the same condition: editable under Invitation, locked otherwise', () => {
    const editable = wrapBodyForEditing(seedBody, brand, undefined, {
      ownerKind: 'template',
      isSystem: false,
    })
    expect(extractHeaderSection(editable)).not.toContain('data-inherited')
    expect(extractFooterSection(editable)).not.toContain('data-inherited')

    const locked = wrapBodyForEditing(seedBody, brand, undefined, {
      ownerKind: 'template',
      isSystem: true,
    })
    expect(extractHeaderSection(locked)).toContain('data-inherited="true"')
    expect(extractFooterSection(locked)).toContain('data-inherited="true"')
  })
})

describe("wrapBodyForEditing — libellé d'origine de la pastille d'héritage", () => {
  // La policy exige la mention « Hérité du modèle » ou « Hérité de la marque »
  // SELON L'ORIGINE ; la pastille du canvas lit ce libellé dans
  // `data-inherited-label`. Sans ces cas, une pastille pourrait afficher la
  // mauvaise provenance sans que rien ne le signale.
  function headerOf(mjml: string): string {
    return mjml.slice(0, mjml.indexOf('<!-- BODY:START -->'))
  }
  function footerOf(mjml: string): string {
    return mjml.slice(mjml.indexOf('<!-- BODY:END -->'))
  }

  it('nomme la provenance de chaque bloc hérité au niveau événement', () => {
    const shell: ResolvedShellForCanvas = {
      header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'template' },
      footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'brand' },
      mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    }
    const out = wrapBodyForEditing(seedBody, brand, shell, { ownerKind: 'event' })
    expect(headerOf(out)).toContain('data-inherited-label="Hérité du modèle"')
    expect(footerOf(out)).toContain('data-inherited-label="Hérité de la marque"')
  })

  it("ne dit pas « hérité » d'un contenu d'origine — le filet de sécurité n'est pas un niveau de cascade", () => {
    // Politique de personnalisation de la coque email : un bloc dont l'origine
    // résolue est le filet livré avec l'application « n'est jamais considéré
    // comme hérité au sens utilisateur ».
    const shell: ResolvedShellForCanvas = {
      header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'hardcoded' },
      footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'hardcoded' },
      mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    }
    const out = wrapBodyForEditing(seedBody, brand, shell, { ownerKind: 'event' })
    expect(headerOf(out)).toContain('data-inherited-label="Contenu d\'origine"')
    expect(headerOf(out)).not.toContain('Hérité')
  })

  it("n'émet aucun libellé sur un bloc surchargé au niveau courant", () => {
    const shell: ResolvedShellForCanvas = {
      header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'event' },
      footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'event' },
      mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    }
    const out = wrapBodyForEditing(seedBody, brand, shell, { ownerKind: 'event' })
    expect(out).not.toContain('data-inherited-label')
  })

  it('étiquette le CORPS « Corps » quand la carte content-wrapper existe', () => {
    // La policy énumère TROIS étiquettes permanentes — « En-tête », « Corps »,
    // « Pied ». Celle du corps n'a jamais existé jusqu'au 2026-07-30.
    const shell: ResolvedShellForCanvas = {
      header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'event' },
      footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'event' },
      mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
      contentWrapper: {
        contentMjml: '<mj-section background-color="#ffffff"></mj-section>',
        origin: 'template',
      },
    }
    const out = wrapBodyForEditing(seedBody, brand, shell, { ownerKind: 'event' })
    expect(out).toContain('css-class="locked-card" data-locked-label="Corps"')
  })
})

describe('wrapBodyForEditing — content-wrapper card (Plan carte-éditable)', () => {
  const baseShell = (overrides?: {
    contentWrapper?: { contentMjml: string; origin: 'template' | 'brand' | 'event' | 'hardcoded' } | null
  }): ResolvedShellForCanvas => ({
    header: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'template' },
    footer: { contentMjml: '<mj-section><mj-column></mj-column></mj-section>', origin: 'brand' },
    mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    contentWrapper: overrides?.contentWrapper,
  })

  it('wraps the body in a <mj-wrapper locked-card> when contentWrapper is non-null', () => {
    const shell = baseShell({
      contentWrapper: {
        contentMjml: '<mj-section background-color="#f0f0f0" padding="10px"></mj-section>',
        origin: 'template',
      },
    })
    const out = wrapBodyForEditing(seedBody, brand, shell)
    expect(out).toContain('<mj-wrapper')
    expect(out).toContain('css-class="locked-card"')
    expect(out).toContain('data-part-kind="content-wrapper"')
    // Card attrs extracted from the storage form <mj-section attrs/>.
    expect(out).toContain('background-color="#f0f0f0"')
    // BODY markers stay INSIDE the card.
    const wrapperOpen = out.indexOf('<mj-wrapper')
    const wrapperClose = out.indexOf('</mj-wrapper>')
    const startIdx = out.indexOf('<!-- BODY:START -->')
    const endIdx = out.indexOf('<!-- BODY:END -->')
    expect(wrapperOpen).toBeLessThan(startIdx)
    expect(endIdx).toBeLessThan(wrapperClose)
  })

  it('falls back to a transparent card (no bg attr) when contentWrapper has empty attrs', () => {
    const shell = baseShell({
      contentWrapper: { contentMjml: '<mj-section></mj-section>', origin: 'template' },
    })
    const out = wrapBodyForEditing(seedBody, brand, shell)
    // Empty blob → default white card.
    expect(out).toContain('<mj-wrapper')
    expect(out).toContain('background-color="#ffffff"')
  })

  it('does NOT emit a <mj-wrapper> when contentWrapper is null (parity 2-args path)', () => {
    const shell = baseShell({ contentWrapper: null })
    const out = wrapBodyForEditing(seedBody, brand, shell)
    expect(out).not.toContain('<mj-wrapper')
    expect(out).not.toContain('locked-card')
  })

  it('does NOT emit a <mj-wrapper> when no resolvedShell is supplied (2-args)', () => {
    const out = wrapBodyForEditing(seedBody, brand)
    expect(out).not.toContain('<mj-wrapper')
    expect(out).not.toContain('locked-card')
  })

  it('extractCardAttrsBlob returns the attrs blob of the root <mj-section>, empty string if absent', () => {
    expect(extractCardAttrsBlob('<mj-section background-color="#abc" padding="5px"></mj-section>')).toBe(
      'background-color="#abc" padding="5px"',
    )
    expect(extractCardAttrsBlob('<mj-section></mj-section>')).toBe('')
    expect(extractCardAttrsBlob(undefined)).toBe('')
    expect(extractCardAttrsBlob(null)).toBe('')
  })
})

describe('stripBodyMarkers', () => {
  it('removes both BODY:START and BODY:END markers', () => {
    const fragment = '<!-- BODY:START --><mj-section>X</mj-section><!-- BODY:END -->'
    expect(stripBodyMarkers(fragment)).toBe('<mj-section>X</mj-section>')
  })

  it('is idempotent (no-op when markers absent)', () => {
    const fragment = '<mj-section>X</mj-section>'
    expect(stripBodyMarkers(fragment)).toBe('<mj-section>X</mj-section>')
  })

  it('tolerates whitespace inside the marker comments', () => {
    const fragment = '<!--  BODY:START  --><mj-section>X</mj-section><!--  BODY:END  -->'
    expect(stripBodyMarkers(fragment)).toBe('<mj-section>X</mj-section>')
  })
})

// ============================================================================
// Plan `2026-05-17-shell-parts-persistance-save` + Lot 2 — helpers structurels
// shell-parts restaurés. ADAPTÉS à l'implémentation simplifiée courante : le
// wrap 2-args n'émet PAS de <mj-wrapper> (carte), donc isShellMarkersIntact /
// extractShellSections exigent un resolvedShell avec contentWrapper non-null.
// ============================================================================

describe('tagSectionWithPartKind', () => {
  it('injects data-part-kind on the first <mj-section> of a fragment', () => {
    const fragment = '<mj-section background-color="#000"><mj-column>X</mj-column></mj-section>'
    const out = tagSectionWithPartKind(fragment, 'header')
    expect(out).toContain('data-part-kind="header"')
    expect(out).toMatch(/<mj-section[^>]+data-part-kind="header"[^>]*>/)
  })

  it('accepts "body" (content-wrapper routing), unlike addPartKindAttr (header|footer only with warn guard)', () => {
    const fragment = '<mj-section padding="20px"><mj-column></mj-column></mj-section>'
    const out = tagSectionWithPartKind(fragment, 'body')
    expect(out).toContain('data-part-kind="body"')
  })

  it('is idempotent — a second call does not duplicate the attribute', () => {
    const fragment = '<mj-section padding="20px"><mj-column></mj-column></mj-section>'
    const once = tagSectionWithPartKind(fragment, 'footer')
    const twice = tagSectionWithPartKind(once, 'footer')
    expect(twice).toBe(once)
    expect(twice.match(/data-part-kind=/g)?.length).toBe(1)
  })

  it('replaces a pre-existing data-part-kind with the new value', () => {
    const fragment =
      '<mj-section data-part-kind="footer" padding="20px"><mj-column></mj-column></mj-section>'
    const out = tagSectionWithPartKind(fragment, 'header')
    expect(out).toContain('data-part-kind="header"')
    expect(out).not.toContain('data-part-kind="footer"')
    expect(out.match(/data-part-kind=/g)?.length).toBe(1)
  })

  it('only tags the first <mj-section> on a multi-section fragment', () => {
    const fragment =
      '<mj-section padding="20px"><mj-column></mj-column></mj-section><mj-section background-color="#fff"><mj-column></mj-column></mj-section>'
    const out = tagSectionWithPartKind(fragment, 'body')
    expect(out.match(/data-part-kind="body"/g)?.length).toBe(1)
  })
})

describe('extractMjBodyAttrs', () => {
  it('extracts background-color, padding-top and padding-bottom from the <mj-body> tag', () => {
    const mjml =
      `<mjml><mj-body background-color="${MJ_BODY_BACKGROUND_COLOR}" padding-top="10px" padding-bottom="20px"><mj-section></mj-section></mj-body></mjml>`
    expect(extractMjBodyAttrs(mjml)).toEqual({
      backgroundColor: MJ_BODY_BACKGROUND_COLOR,
      paddingTop: '10px',
      paddingBottom: '20px',
    })
  })

  it('falls back to the hardcoded defaults (MJ_BODY_BACKGROUND_COLOR, 0, 0) when the attrs are absent', () => {
    const mjml = '<mjml><mj-body width="600px"><mj-section></mj-section></mj-body></mjml>'
    expect(extractMjBodyAttrs(mjml)).toEqual({
      backgroundColor: MJ_BODY_BACKGROUND_COLOR,
      paddingTop: '0',
      paddingBottom: '0',
    })
  })

  it('throws when the <mj-body> opening tag is missing', () => {
    expect(() => extractMjBodyAttrs('<mjml><mj-head></mj-head></mjml>')).toThrow(
      '<mj-body> opening tag missing',
    )
  })
})

describe('mjBodyAttrsEqual', () => {
  const a = { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' }

  it('returns true when all three attrs match', () => {
    expect(mjBodyAttrsEqual(a, { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' })).toBe(true)
  })

  it('returns false when background-color differs', () => {
    // Couleur délibérément ≠ '#ffffff' (test d'inégalité mécanique). Placeholder
    // non-sensible : NE PAS importer MJ_BODY_BACKGROUND_COLOR ici — si la constante
    // devenait '#ffffff', ce test casserait (fragilité inverse).
    expect(mjBodyAttrsEqual(a, { backgroundColor: '#000000', paddingTop: '0', paddingBottom: '0' })).toBe(false)
  })

  it('returns false when padding-top differs', () => {
    expect(mjBodyAttrsEqual(a, { backgroundColor: '#ffffff', paddingTop: '10px', paddingBottom: '0' })).toBe(false)
  })

  it('returns false when padding-bottom differs', () => {
    expect(mjBodyAttrsEqual(a, { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '20px' })).toBe(false)
  })
})

describe('isShellMarkersIntact', () => {
  const fullCardShell = (): ResolvedShellForCanvas => ({
    header: { contentMjml: '<mj-section><mj-column><mj-text>H</mj-text></mj-column></mj-section>', origin: 'template' },
    footer: { contentMjml: '<mj-section><mj-column><mj-text>F</mj-text></mj-column></mj-section>', origin: 'brand' },
    mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    contentWrapper: { contentMjml: '<mj-section background-color="#ffffff"></mj-section>', origin: 'template' },
  })

  it('returns true when mj-body, mj-wrapper, BODY markers are all present, unique and ordered', () => {
    const wrapped = wrapBodyForEditing(
      '<mj-section><mj-column>X</mj-column></mj-section>',
      brand,
      fullCardShell(),
    )
    expect(isShellMarkersIntact(wrapped)).toBe(true)
  })

  it('returns false when the canvas has NO content-wrapper card (2-args parity path emits no <mj-wrapper>)', () => {
    const wrapped = wrapBodyForEditing('<mj-section><mj-column>X</mj-column></mj-section>', brand)
    expect(isShellMarkersIntact(wrapped)).toBe(false)
  })

  it('returns false when BODY:END is missing', () => {
    const broken =
      '<mjml><mj-body><mj-section></mj-section><mj-wrapper><!-- BODY:START --><mj-section></mj-section></mj-wrapper><mj-section></mj-section></mj-body></mjml>'
    expect(isShellMarkersIntact(broken)).toBe(false)
  })

  it('returns false when the order is inverted (BODY:END before BODY:START)', () => {
    const inverted =
      '<mjml><mj-body><mj-section></mj-section><mj-wrapper><!-- BODY:END --><!-- BODY:START --></mj-wrapper><mj-section></mj-section></mj-body></mjml>'
    expect(isShellMarkersIntact(inverted)).toBe(false)
  })

  it('returns false when <mj-body> open tag appears twice', () => {
    const dupBody =
      '<mjml><mj-body><mj-body><mj-section></mj-section><mj-wrapper><!-- BODY:START --><mj-section></mj-section><!-- BODY:END --></mj-wrapper><mj-section></mj-section></mj-body></mj-body></mjml>'
    expect(isShellMarkersIntact(dupBody)).toBe(false)
  })

  it('returns false when <mj-wrapper> appears twice', () => {
    const dupCard =
      '<mjml><mj-body><mj-section></mj-section><mj-wrapper><!-- BODY:START --><mj-section></mj-section><!-- BODY:END --></mj-wrapper><mj-wrapper></mj-wrapper><mj-section></mj-section></mj-body></mjml>'
    expect(isShellMarkersIntact(dupCard)).toBe(false)
  })

  it('returns false when BODY:START appears twice', () => {
    const dupStart =
      '<mjml><mj-body><mj-section></mj-section><mj-wrapper><!-- BODY:START --><mj-section><!-- BODY:START --></mj-section><!-- BODY:END --></mj-wrapper><mj-section></mj-section></mj-body></mjml>'
    expect(isShellMarkersIntact(dupStart)).toBe(false)
  })

  it('tolerates whitespace inside BODY comments', () => {
    const tolerant =
      '<mjml><mj-body background-color="#ffffff"><mj-section></mj-section><mj-wrapper><!--  BODY:START  --><mj-section></mj-section><!--  BODY:END  --></mj-wrapper><mj-section></mj-section></mj-body></mjml>'
    expect(isShellMarkersIntact(tolerant)).toBe(true)
  })
})

describe('extractShellSections', () => {
  const headerFragment =
    '<mj-section background-color="#0066ff" padding="20px"><mj-column><mj-text>Custom header</mj-text></mj-column></mj-section>'
  const footerFragment =
    '<mj-section padding="10px"><mj-column><mj-text>Custom footer</mj-text></mj-column></mj-section>'

  const cardShell = (): ResolvedShellForCanvas => ({
    header: { contentMjml: headerFragment, origin: 'template' },
    footer: { contentMjml: footerFragment, origin: 'brand' },
    mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    contentWrapper: { contentMjml: '<mj-section background-color="#ffffff"></mj-section>', origin: 'template' },
  })

  it('returns header (1st locked-shell, before the card) and footer (last, after the card), normalized byte-exact', () => {
    const wrapped = wrapBodyForEditing(
      '<mj-section><mj-column>X</mj-column></mj-section>',
      brand,
      cardShell(),
    )
    const { header, footer } = extractShellSections(wrapped)
    expect(header).toBe(headerFragment)
    expect(footer).toBe(footerFragment)
  })

  it('throws when shell markers are corrupted (precondition violated)', () => {
    expect(() => extractShellSections('<mjml></mjml>')).toThrow('Shell markers corrupted')
  })

  it('excludes the content-wrapper <mj-wrapper> open/close tags from header and footer', () => {
    const wrapped = wrapBodyForEditing(
      '<mj-section><mj-column>X</mj-column></mj-section>',
      brand,
      cardShell(),
    )
    const { header, footer } = extractShellSections(wrapped)
    expect(header).not.toContain('mj-wrapper')
    expect(footer).not.toContain('mj-wrapper')
  })

  it('is deterministic — re-extracting the same canvas yields identical fragments', () => {
    const wrapped = wrapBodyForEditing(
      '<mj-section><mj-column>X</mj-column></mj-section>',
      brand,
      cardShell(),
    )
    expect(extractShellSections(wrapped)).toEqual(extractShellSections(wrapped))
  })
})

describe('normalizeShellFragment', () => {
  it('strips css-class=locked-shell, data-locked-label, data-part-kind, data-inherited AND data-inherited-label', () => {
    const fragment =
      '<mj-section css-class="locked-shell" data-locked-label="En-tête" data-part-kind="header" data-inherited="true" data-inherited-label="Hérité du modèle" padding="20px"><mj-column></mj-column></mj-section>'
    const out = normalizeShellFragment(fragment)
    expect(out).not.toContain('locked-shell')
    expect(out).not.toContain('data-locked-label')
    expect(out).not.toContain('data-part-kind')
    expect(out).not.toContain('data-inherited')
    // Sans ce strip, le dirty tracker verrait une diff structurelle là où il n'y
    // a qu'une décoration d'éditeur : « Enregistrer » s'activerait tout seul.
    expect(out).toBe('<mj-section padding="20px"><mj-column></mj-column></mj-section>')
  })

  it('is idempotent — normalize(normalize(x)) === normalize(x)', () => {
    const fragment =
      '<mj-section css-class="locked-shell other" data-locked-label="En-tête" data-part-kind="header" data-inherited="true" data-inherited-label="Hérité de la marque" padding="20px"><mj-column><mj-text>X</mj-text></mj-column></mj-section>'
    const once = normalizeShellFragment(fragment)
    const twice = normalizeShellFragment(once)
    expect(twice).toBe(once)
  })

  it('preserves non-locked-shell classes when stripping (Q7 — preserves admin intent)', () => {
    const fragment =
      '<mj-section css-class="locked-shell brand-emphasis" padding="20px"><mj-column></mj-column></mj-section>'
    const out = normalizeShellFragment(fragment)
    expect(out).toContain('css-class="brand-emphasis"')
    expect(out).not.toContain('locked-shell')
  })

  it('collapses whitespace inter-balises so canvas and server fragments compare equal', () => {
    const canvas =
      '<mj-section padding="20px">\n  <mj-column>\n    <mj-text>X</mj-text>\n  </mj-column>\n</mj-section>'
    const server =
      '<mj-section padding="20px"><mj-column><mj-text>X</mj-text></mj-column></mj-section>'
    expect(normalizeShellFragment(canvas)).toBe(normalizeShellFragment(server))
  })
})

describe('isShellDirty', () => {
  function makeMjml(
    header: string,
    body: string,
    footer: string,
    mjBodyAttrs?: { backgroundColor: string; paddingTop: string; paddingBottom: string },
  ): string {
    const bodyAttrsBlob = mjBodyAttrs
      ? `background-color="${mjBodyAttrs.backgroundColor}" padding-top="${mjBodyAttrs.paddingTop}" padding-bottom="${mjBodyAttrs.paddingBottom}"`
      : 'background-color="#ffffff"'
    return `<mjml><mj-body ${bodyAttrsBlob}>${header}<mj-wrapper><!-- BODY:START -->${body}<!-- BODY:END --></mj-wrapper>${footer}</mj-body></mjml>`
  }

  const section = (text: string) =>
    `<mj-section padding="20px"><mj-column><mj-text>${text}</mj-text></mj-column></mj-section>`

  it('reports all three sections clean when the canvas matches the anchors', () => {
    const h = section('H')
    const b = section('B')
    const f = section('F')
    const result = isShellDirty(makeMjml(h, b, f), {
      initialHeaderMjml: normalizeShellFragment(h),
      initialBodyMjml: b,
      initialFooterMjml: normalizeShellFragment(f),
    })
    expect(result).toEqual({ header: false, body: false, footer: false, mjBody: false })
  })

  it('reports body=true when only the body changes (asymmetric body / shell anchors)', () => {
    const h = section('H')
    const f = section('F')
    const result = isShellDirty(makeMjml(h, section('B-NEW'), f), {
      initialHeaderMjml: normalizeShellFragment(h),
      initialBodyMjml: section('B-OLD'),
      initialFooterMjml: normalizeShellFragment(f),
    })
    expect(result).toEqual({ header: false, body: true, footer: false, mjBody: false })
  })

  it('reports header=true when only the header changes', () => {
    const b = section('B')
    const f = section('F')
    const result = isShellDirty(makeMjml(section('H-NEW'), b, f), {
      initialHeaderMjml: normalizeShellFragment(section('H-OLD')),
      initialBodyMjml: b,
      initialFooterMjml: normalizeShellFragment(f),
    })
    expect(result).toEqual({ header: true, body: false, footer: false, mjBody: false })
  })

  it('reports footer=true when only the footer changes', () => {
    const h = section('H')
    const b = section('B')
    const result = isShellDirty(makeMjml(h, b, section('F-NEW')), {
      initialHeaderMjml: normalizeShellFragment(h),
      initialBodyMjml: b,
      initialFooterMjml: normalizeShellFragment(section('F-OLD')),
    })
    expect(result.footer).toBe(true)
    expect(result.header).toBe(false)
    expect(result.body).toBe(false)
  })

  it('reports all three dirty when each section diverges from its anchor', () => {
    const result = isShellDirty(
      makeMjml(section('H-NEW'), section('B-NEW'), section('F-NEW')),
      {
        initialHeaderMjml: normalizeShellFragment(section('H-OLD')),
        initialBodyMjml: section('B-OLD'),
        initialFooterMjml: normalizeShellFragment(section('F-OLD')),
      },
    )
    expect(result).toEqual({ header: true, body: true, footer: true, mjBody: false })
  })

  describe('mjBody flag (Plan 1 du 2026-05-22)', () => {
    it('reports mjBody=false when initialMjBodyAttrs is not provided (legacy callers)', () => {
      const h = section('H')
      const b = section('B')
      const f = section('F')
      const result = isShellDirty(
        makeMjml(h, b, f, { backgroundColor: '#ff0000', paddingTop: '20px', paddingBottom: '20px' }),
        {
          initialHeaderMjml: normalizeShellFragment(h),
          initialBodyMjml: b,
          initialFooterMjml: normalizeShellFragment(f),
        },
      )
      expect(result.mjBody).toBe(false)
    })

    it('reports mjBody=true when canvas attrs diverge from initialMjBodyAttrs', () => {
      const h = section('H')
      const b = section('B')
      const f = section('F')
      const result = isShellDirty(
        makeMjml(h, b, f, { backgroundColor: '#ff0000', paddingTop: '20px', paddingBottom: '20px' }),
        {
          initialHeaderMjml: normalizeShellFragment(h),
          initialBodyMjml: b,
          initialFooterMjml: normalizeShellFragment(f),
          initialMjBodyAttrs: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
        },
      )
      expect(result.mjBody).toBe(true)
    })

    it('reports mjBody=false when canvas attrs match initialMjBodyAttrs exactly', () => {
      const h = section('H')
      const b = section('B')
      const f = section('F')
      const attrs = { backgroundColor: '#abcdef', paddingTop: '40px', paddingBottom: '10px' }
      const result = isShellDirty(makeMjml(h, b, f, attrs), {
        initialHeaderMjml: normalizeShellFragment(h),
        initialBodyMjml: b,
        initialFooterMjml: normalizeShellFragment(f),
        initialMjBodyAttrs: attrs,
      })
      expect(result.mjBody).toBe(false)
    })
  })
})

describe('extractContentWrapperFromCanvas', () => {
  const cardBody = '<mj-section><mj-column><mj-text>hi</mj-text></mj-column></mj-section>'
  const cardShell = (cardMjml: string): ResolvedShellForCanvas => ({
    header: { contentMjml: '<mj-section data-part-kind="header"><mj-column></mj-column></mj-section>', origin: 'template' },
    footer: { contentMjml: '<mj-section data-part-kind="footer"><mj-column></mj-column></mj-section>', origin: 'brand' },
    mjBody: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    contentWrapper: { contentMjml: cardMjml, origin: 'template' },
  })

  it('returns the storage form <mj-section attrs> with whitelisted attrs only', () => {
    const full = wrapBodyForEditing(
      cardBody,
      brand,
      cardShell('<mj-section background-color="#f0f0f0" border-bottom="1px solid #18181b"></mj-section>'),
    )
    const stored = extractContentWrapperFromCanvas(full)
    expect(stored).toMatch(/^<mj-section /)
    expect(stored).toContain('background-color="#f0f0f0"')
    expect(stored).toContain('border-bottom="1px solid #18181b"')
    expect(stored).not.toContain('locked-card')
    expect(stored).not.toContain('data-part-kind')
  })

  it('round-trip: wrap with a card then extract conserves the whitelisted attrs', () => {
    const stored = '<mj-section background-color="#ffffff" border-radius="0px 0px 8px 8px"></mj-section>'
    const full = wrapBodyForEditing(cardBody, brand, cardShell(stored))
    const out = extractContentWrapperFromCanvas(full)
    expect(out).toContain('background-color="#ffffff"')
    expect(out).toContain('border-radius="0px 0px 8px 8px"')
  })

  it('throws when the content-wrapper <mj-wrapper> is absent from the canvas', () => {
    expect(() => extractContentWrapperFromCanvas('<mjml><mj-body></mj-body></mjml>')).toThrow(
      'content-wrapper <mj-wrapper> introuvable',
    )
  })
})
