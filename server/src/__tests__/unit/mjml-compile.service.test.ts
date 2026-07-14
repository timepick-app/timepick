import { describe, it, expect } from '@jest/globals'

// NOTE: this file intentionally avoids importing from
// `../../services/mjml-compile.service` because that module pulls in
// `isomorphic-dompurify` → `jsdom` → `@exodus/bytes`, the latter being a pure
// ESM package that Jest's CJS transform can't parse without a heavier rig
// (babel-jest, ESM mode, etc.). The DOMPurify-dependent regression test for
// `KEEP_CONTENT: true` lives in `scripts/verify-mjml-sanitizer.mjs` and is run
// as a Node smoke-test, not via Jest. See that script for the actual fix
// verification (issue: empty <div>'s in sent emails).
//
// Here we only test pure functions that have no DOMPurify dependency.

// Re-implementing the regex inline to avoid the import. Kept byte-identical
// avec `substituteVariables` dans mjml-compile.service.ts — mettre à jour les
// deux ensemble si la liste des variables whitelistées change.
function substituteVariables(
  html: string,
  vars: Record<string, string | undefined>
): string {
  return html.replace(
    /\{\{(event_name|event_description|magic_link|expiration_date|slot_date|slot_time|user_first_name|user_last_name|user_full_name|cancellation_reason|login_url|changes_blocks|calendar_url)\}\}/g,
    (_match, key: string) => vars[key] ?? ''
  )
}

describe('substituteVariables', () => {
  it('replaces all four legacy variables', () => {
    const out = substituteVariables(
      '<p>{{event_name}} / {{event_description}} / {{magic_link}} / {{expiration_date}}</p>',
      {
        event_name: 'Soirée',
        event_description: 'desc',
        magic_link: 'https://x',
        expiration_date: '31/12',
      }
    )
    expect(out).toBe('<p>Soirée / desc / https://x / 31/12</p>')
  })

  it('remplace les variables de réservation (slot_date, slot_time, calendar_url)', () => {
    const out = substituteVariables(
      '<p>{{slot_date}} à {{slot_time}} — <a href="{{calendar_url}}">Gérer</a></p>',
      {
        slot_date: '2026-06-01',
        slot_time: '14:30',
        calendar_url: 'https://example.test/events/abc',
      }
    )
    expect(out).toBe('<p>2026-06-01 à 14:30 — <a href="https://example.test/events/abc">Gérer</a></p>')
  })

  it('remplace user_first_name, user_last_name et user_full_name', () => {
    const out = substituteVariables(
      '<p>{{user_first_name}} {{user_last_name}} / {{user_full_name}}</p>',
      {
        user_first_name: 'Marie',
        user_last_name: 'Curie',
        user_full_name: 'Marie Curie',
      }
    )
    expect(out).toBe('<p>Marie Curie / Marie Curie</p>')
  })

  it('replaces missing variables with empty string', () => {
    const out = substituteVariables('<p>{{event_name}}!</p>', {})
    expect(out).toBe('<p>!</p>')
  })

  it('treats values containing $1/$& literally (regression on regex backrefs)', () => {
    const out = substituteVariables('<p>{{event_name}}</p>', {
      event_name: 'Pay $50 for $& and $1',
    })
    expect(out).toBe('<p>Pay $50 for $& and $1</p>')
  })

  it('keeps regex-safety on the new variables (slot_time with $1)', () => {
    const out = substituteVariables('<p>{{slot_time}}</p>', {
      slot_time: '$1 / $& / $`',
    })
    expect(out).toBe('<p>$1 / $& / $`</p>')
  })

  it('ignores unknown {{...}} tokens', () => {
    const out = substituteVariables('<p>{{unknown}} {{event_name}}</p>', {
      event_name: 'X',
    })
    expect(out).toBe('<p>{{unknown}} X</p>')
  })

  it('laisse littérales les anciennes clés supprimées (user_name, cancel_link hors whitelist)', () => {
    // user_name et cancel_link ont été retirées de SUBSTITUTABLE_KEYS :
    // elles doivent rester littérales plutôt que d'être substituées par ''.
    const out = substituteVariables(
      '<p>{{user_name}} <a href="{{cancel_link}}">Annuler</a></p>',
      { user_name: 'Alice', cancel_link: 'https://x/cancel' }
    )
    expect(out).toBe('<p>{{user_name}} <a href="{{cancel_link}}">Annuler</a></p>')
  })
})
