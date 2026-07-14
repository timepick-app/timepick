/**
 * Integration tests for shell-parts.service.ts (CRUD + cleanup helper).
 *
 * Pattern: mirrors email-brand-settings.test.ts / email-templates.test.ts —
 * uses the centralized `query()` helper against the timepick_test DB
 * provisioned by Jest globalSetup. Each test cleans up rows it inserted.
 *
 * Story 26.1 / T2.6.
 */

import { query, withTransaction } from '../../db'
import {
  deleteShellPart,
  deleteShellPartsForOwner,
  getShellParts,
  isInvitationShellCustomized,
  seedShellPart,
  upsertShellPart,
  INVITATION_FACTORY_HEADER_MJML,
  INVITATION_FACTORY_CONTENT_WRAPPER_MJML,
  INVITATION_FACTORY_MJBODY_MJML,
} from '../../services/shell-parts.service'

const TEST_EVENT_ID = '11111111-1111-1111-1111-111111111111'

describe('shell-parts.service', () => {
  // Wipe avant chaque test : la migration 012 (plan-5b-defer-A L3-data,
  // 2026-05-26) sème une row brand factory content-wrapper au boot DB ;
  // les tests de ce fichier attendent un shell_parts strictement vide.
  beforeEach(async () => {
    await query('DELETE FROM shell_parts')
  })

  afterEach(async () => {
    await query('DELETE FROM shell_parts')
  })

  describe('getShellParts', () => {
    it('returns an empty array when no row exists for the owner', async () => {
      const rows = await getShellParts('brand', '1')
      expect(rows).toEqual([])
    })

    it('returns all rows for the owner, ordered by part_kind', async () => {
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'footer', contentMjml: '<mj-section>F</mj-section>' })
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: '<mj-section>H</mj-section>' })
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'body', contentMjml: '<mj-section>B</mj-section>' })

      const rows = await getShellParts('brand', '1')
      expect(rows.map((r) => r.partKind)).toEqual(['body', 'footer', 'header'])
      expect(rows[0]).toMatchObject({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'body',
        contentMjml: '<mj-section>B</mj-section>',
      })
    })

    it('isolates rows by owner_kind / owner_id', async () => {
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: '<mj-section>BRAND</mj-section>' })
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'header', contentMjml: '<mj-section>TPL</mj-section>' })
      await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'header', contentMjml: '<mj-section>EVT</mj-section>' })

      const brandRows = await getShellParts('brand', '1')
      const tplRows = await getShellParts('template', 'invitation')
      const evtRows = await getShellParts('event', TEST_EVENT_ID)

      expect(brandRows).toHaveLength(1)
      expect(tplRows).toHaveLength(1)
      expect(evtRows).toHaveLength(1)
      expect(brandRows[0].contentMjml).toBe('<mj-section>BRAND</mj-section>')
      expect(tplRows[0].contentMjml).toBe('<mj-section>TPL</mj-section>')
      expect(evtRows[0].contentMjml).toBe('<mj-section>EVT</mj-section>')
    })
  })

  describe('upsertShellPart', () => {
    it('inserts a new row on first call', async () => {
      const row = await upsertShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
        contentMjml: '<mj-section>v1</mj-section>',
      })

      expect(row.contentMjml).toBe('<mj-section>v1</mj-section>')
      expect(row.id).toBeTruthy()
      expect(row.createdAt).toBeInstanceOf(Date)
      expect(row.updatedAt).toBeInstanceOf(Date)
    })

    it('updates content_mjml on conflict (same owner+part_kind)', async () => {
      const first = await upsertShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
        contentMjml: '<mj-section>v1</mj-section>',
      })

      const second = await upsertShellPart({
        ownerKind: 'brand',
        ownerId: '1',
        partKind: 'header',
        contentMjml: '<mj-section>v2</mj-section>',
      })

      // Idempotency contract: same row identity, but with updated content.
      expect(second.id).toBe(first.id)
      expect(second.contentMjml).toBe('<mj-section>v2</mj-section>')
      // Note: we do NOT assert `updatedAt > first.updatedAt`. The integration
      // tests share a single transaction via `setTransactionClient` (cf.
      // db/query.ts withTransaction short-circuit), and Postgres `NOW()`
      // returns the *transaction-start* time — so two UPSERTs in the same
      // transaction always produce identical timestamps regardless of any
      // setTimeout. The trigger firing is validated separately by the
      // schema-level migration test.
      expect(second.updatedAt).toBeInstanceOf(Date)
    })

    it('rejects an invalid owner_kind via the CHECK constraint', async () => {
      await expect(
        upsertShellPart({
          // @ts-expect-error — testing CHECK constraint rejection at the DB boundary
          ownerKind: 'invalid',
          ownerId: '1',
          partKind: 'header',
          contentMjml: '<mj-section/>',
        }),
      ).rejects.toThrow(/shell_parts_owner_kind_check/)
    })

    it('rejects an invalid part_kind via the CHECK constraint', async () => {
      await expect(
        upsertShellPart({
          ownerKind: 'brand',
          ownerId: '1',
          // @ts-expect-error — testing CHECK constraint rejection at the DB boundary
          partKind: 'banner',
          contentMjml: '<mj-section/>',
        }),
      ).rejects.toThrow(/shell_parts_part_kind_check/)
    })
  })

  describe('deleteShellPartsForOwner', () => {
    it('deletes every row for the owner and returns the row count', async () => {
      await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'header', contentMjml: 'H' })
      await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'body', contentMjml: 'B' })
      await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'footer', contentMjml: 'F' })

      const count = await deleteShellPartsForOwner('event', TEST_EVENT_ID)
      expect(count).toBe(3)
      expect(await getShellParts('event', TEST_EVENT_ID)).toEqual([])
    })

    it('is idempotent — returns 0 when no row exists for the owner', async () => {
      const count = await deleteShellPartsForOwner('event', TEST_EVENT_ID)
      expect(count).toBe(0)
    })

    it('does not touch other owners', async () => {
      await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'header', contentMjml: 'E' })
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: 'B' })

      await deleteShellPartsForOwner('event', TEST_EVENT_ID)

      expect(await getShellParts('event', TEST_EVENT_ID)).toEqual([])
      const brand = await getShellParts('brand', '1')
      expect(brand).toHaveLength(1)
    })

    it('participates in an externally-managed transaction via the optional client', async () => {
      await seedShellPart({ ownerKind: 'event', ownerId: TEST_EVENT_ID, partKind: 'header', contentMjml: 'H' })

      // Run the cleanup inside withTransaction — proves the helper accepts the
      // injected client and shares the same BEGIN/COMMIT lifecycle as its caller.
      await withTransaction(async (client) => {
        const count = await deleteShellPartsForOwner('event', TEST_EVENT_ID, client)
        expect(count).toBe(1)
      })

      expect(await getShellParts('event', TEST_EVENT_ID)).toEqual([])
    })
  })

  describe('deleteShellPart (single tuple)', () => {
    it('returns true and removes the row when the tuple exists', async () => {
      await seedShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'header',
        contentMjml: '<mj-section>H</mj-section>',
      })

      const existed = await deleteShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'header',
      })

      expect(existed).toBe(true)
      expect(await getShellParts('event', TEST_EVENT_ID)).toEqual([])
    })

    it('returns false when no row matches (idempotent at the row level)', async () => {
      const existed = await deleteShellPart({
        ownerKind: 'event',
        ownerId: TEST_EVENT_ID,
        partKind: 'header',
      })
      expect(existed).toBe(false)
    })

    it('targets only the requested partKind (leaves siblings intact)', async () => {
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header', contentMjml: 'H' })
      await seedShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'footer', contentMjml: 'F' })

      await deleteShellPart({ ownerKind: 'brand', ownerId: '1', partKind: 'header' })

      const remaining = await getShellParts('brand', '1')
      expect(remaining).toHaveLength(1)
      expect(remaining[0].partKind).toBe('footer')
    })
  })

  describe('seedShellPart', () => {
    it('is functionally equivalent to upsertShellPart (alias for tests)', async () => {
      const row = await seedShellPart({
        ownerKind: 'template',
        ownerId: 'invitation',
        partKind: 'header',
        contentMjml: '<mj-section>seed</mj-section>',
      })

      const fetched = await getShellParts('template', 'invitation')
      expect(fetched).toHaveLength(1)
      expect(fetched[0].id).toBe(row.id)
    })
  })
  // ===================================================
  // isInvitationShellCustomized — flag de coque invitation (lot 3b)
  // ===================================================
  describe('isInvitationShellCustomized', () => {
    // Reconstruit l'état d'usine : les 3 parts γ @ template[invitation] aux
    // constantes migration-018 (le beforeEach a wiped tout shell_parts).
    async function seedFactoryShell() {
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'header', contentMjml: INVITATION_FACTORY_HEADER_MJML })
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'content-wrapper', contentMjml: INVITATION_FACTORY_CONTENT_WRAPPER_MJML })
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'mj-body', contentMjml: INVITATION_FACTORY_MJBODY_MJML })
    }

    it('returns false at the factory state (3 γ parts, no footer)', async () => {
      await seedFactoryShell()
      await expect(isInvitationShellCustomized()).resolves.toBe(false)
    })

    it('returns true when a footer exists', async () => {
      await seedFactoryShell()
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'footer', contentMjml: '<mj-section><mj-column><mj-text>PIED</mj-text></mj-column></mj-section>' })
      await expect(isInvitationShellCustomized()).resolves.toBe(true)
    })

    it('returns true when the header is overridden (content ≠ factory)', async () => {
      await seedFactoryShell()
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'header', contentMjml: '<mj-section><mj-column><mj-text>OVERRIDE</mj-text></mj-column></mj-section>' })
      await expect(isInvitationShellCustomized()).resolves.toBe(true)
    })

    it('returns true when a γ part is absent', async () => {
      // Seulement 2 des 3 parts usine présentes → mj-body manquante = déviation.
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'header', contentMjml: INVITATION_FACTORY_HEADER_MJML })
      await seedShellPart({ ownerKind: 'template', ownerId: 'invitation', partKind: 'content-wrapper', contentMjml: INVITATION_FACTORY_CONTENT_WRAPPER_MJML })
      await expect(isInvitationShellCustomized()).resolves.toBe(true)
    })

    it('ignores overrides on OTHER template keys (scoped to invitation)', async () => {
      await seedFactoryShell()
      await seedShellPart({ ownerKind: 'template', ownerId: 'reservation_confirmation', partKind: 'footer', contentMjml: '<mj-section><mj-column><mj-text>AUTRE MODÈLE</mj-text></mj-column></mj-section>' })
      await expect(isInvitationShellCustomized()).resolves.toBe(false)
    })
  })
})
