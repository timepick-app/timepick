/**
 * Integration tests for the cleanup applicatif on DELETE event:
 * `event.service.ts:deleteEvent` must atomically purge every `shell_parts`
 * row keyed to the deleted event in the same transaction as the event
 * DELETE (story 26.1 / AC2).
 *
 * T7.3 covers the event happy/edge paths. T7.4 + T7.5 (template + brand
 * cleanup unit tests) are already covered by the shell-parts service
 * test suite (`shell-parts.service.test.ts`).
 */

import { query } from '../../db'
import { eventService } from '../../services/event.service'
import { seedShellPart } from '../../services/shell-parts.service'

const EVENT_A = '33333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const EVENT_B = '33333333-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

async function seedEvent(id: string, label: string): Promise<void> {
  await query(
    `INSERT INTO events (id, name, description)
     VALUES ($1, $2, 'cleanup test event')
     ON CONFLICT (id) DO NOTHING`,
    [id, `cleanup-test-${label}-${id}`],
  )
}

async function countShellParts(ownerKind: string, ownerId: string): Promise<number> {
  const { rows } = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM shell_parts WHERE owner_kind = $1 AND owner_id = $2`,
    [ownerKind, ownerId],
  )
  return parseInt(rows[0].c, 10)
}

describe('event cleanup — shell_parts', () => {
  beforeEach(async () => {
    // Wipe pré-test : la migration 012 (plan-5b-defer-A L3-data, 2026-05-26)
    // sème une row brand factory content-wrapper qui interfère avec les
    // assertions de comptage rows brand/template (cf. test « does NOT touch
    // template or brand rows during event delete »).
    await query('DELETE FROM shell_parts')
    await seedEvent(EVENT_A, 'A')
    await seedEvent(EVENT_B, 'B')
  })

  afterEach(async () => {
    await query('DELETE FROM shell_parts')
    await query(`DELETE FROM events WHERE id IN ($1, $2)`, [EVENT_A, EVENT_B])
  })

  it('deletes the 3 shell_parts rows attached to the event in the same transaction', async () => {
    await seedShellPart({ ownerKind: 'event', ownerId: EVENT_A, partKind: 'header', contentMjml: 'H' })
    await seedShellPart({ ownerKind: 'event', ownerId: EVENT_A, partKind: 'body', contentMjml: 'B' })
    await seedShellPart({ ownerKind: 'event', ownerId: EVENT_A, partKind: 'footer', contentMjml: 'F' })
    expect(await countShellParts('event', EVENT_A)).toBe(3)

    const deleted = await eventService.deleteEvent(EVENT_A)
    expect(deleted).toBe(true)

    expect(await countShellParts('event', EVENT_A)).toBe(0)
  })

  it('returns false (no-op) and leaves shell_parts untouched when the event id does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    await seedShellPart({ ownerKind: 'event', ownerId: EVENT_A, partKind: 'header', contentMjml: 'H' })

    const deleted = await eventService.deleteEvent(fakeId)
    expect(deleted).toBe(false)

    // Event A is untouched
    expect(await countShellParts('event', EVENT_A)).toBe(1)
  })

  it('isolates cleanup to the target event — other events keep their rows', async () => {
    await seedShellPart({ ownerKind: 'event', ownerId: EVENT_A, partKind: 'header', contentMjml: 'A-H' })
    await seedShellPart({ ownerKind: 'event', ownerId: EVENT_B, partKind: 'header', contentMjml: 'B-H' })

    await eventService.deleteEvent(EVENT_A)

    expect(await countShellParts('event', EVENT_A)).toBe(0)
    expect(await countShellParts('event', EVENT_B)).toBe(1)
  })

  it('does NOT touch template or brand rows during event delete', async () => {
    await seedShellPart({ ownerKind: 'event', ownerId: EVENT_A, partKind: 'header', contentMjml: 'EVT' })
    await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'header', contentMjml: 'TPL' })
    await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: 'BRAND' })

    await eventService.deleteEvent(EVENT_A)

    expect(await countShellParts('event', EVENT_A)).toBe(0)
    expect(await countShellParts('template', 'invitation')).toBe(1)
    expect(await countShellParts('brand', '1')).toBe(1)
  })
})
