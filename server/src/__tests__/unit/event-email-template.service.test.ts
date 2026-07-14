import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const mockQuery = jest.fn() as jest.MockedFunction<typeof import('../../db').query>
const mockWithTransaction = jest.fn((cb: (client: { query: typeof mockQuery }) => unknown) =>
  cb({ query: mockQuery }),
)

jest.mock('../../db', () => ({
  query: mockQuery,
  withTransaction: mockWithTransaction,
}))

// Import after mock
import { getEventEmailTemplateView, resetEventEmailTemplate } from '../../services/event-email-template.service'
import { NotFoundError } from '../../errors/NotFoundError'
import { TemplateNotFoundError } from '../../services/render-email.service'

const TEST_EVENT_ID = '11111111-1111-1111-1111-111111111111'
const FROZEN_DATE = new Date('2026-05-02T12:00:00.000Z')
const DEFAULT_BODY = '<!-- BODY:START -->default<!-- BODY:END -->'
const CUSTOM_BODY = '<!-- BODY:START -->custom<!-- BODY:END -->'

describe('event-email-template.service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getEventEmailTemplateView', () => {
    it('returns isCustom=false when invitation_mjml is NULL and has_event_shell is false', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            invitation_mjml: null,
            default_body: DEFAULT_BODY,
            updated_at: FROZEN_DATE,
            has_event_shell: false,
          },
        ],
      } as never)

      const view = await getEventEmailTemplateView(TEST_EVENT_ID)

      expect(view).toEqual({
        eventId: TEST_EVENT_ID,
        templateKey: 'invitation',
        bodyMjml: DEFAULT_BODY,
        defaultBodyMjml: DEFAULT_BODY,
        isCustom: false,
        updatedAt: FROZEN_DATE.toISOString(),
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN email_templates'),
        [TEST_EVENT_ID],
      )
    })

    it('returns isCustom=true when invitation_mjml is non-NULL', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            invitation_mjml: CUSTOM_BODY,
            default_body: DEFAULT_BODY,
            updated_at: FROZEN_DATE,
            has_event_shell: false,
          },
        ],
      } as never)

      const view = await getEventEmailTemplateView(TEST_EVENT_ID)

      expect(view.isCustom).toBe(true)
      expect(view.bodyMjml).toBe(CUSTOM_BODY)
      expect(view.defaultBodyMjml).toBe(DEFAULT_BODY)
      expect(view.bodyMjml).not.toBe(view.defaultBodyMjml)
    })

    it('returns isCustom=true when invitation_mjml is NULL but has_event_shell is true', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            invitation_mjml: null,
            default_body: DEFAULT_BODY,
            updated_at: FROZEN_DATE,
            has_event_shell: true,
          },
        ],
      } as never)

      const view = await getEventEmailTemplateView(TEST_EVENT_ID)

      expect(view.isCustom).toBe(true)
      expect(view.bodyMjml).toBe(DEFAULT_BODY)
      expect(view.defaultBodyMjml).toBe(DEFAULT_BODY)
    })

    it('returns the override as bodyMjml when invitation_mjml is non-NULL and has_event_shell is absent from the row', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            invitation_mjml: CUSTOM_BODY,
            default_body: DEFAULT_BODY,
            updated_at: FROZEN_DATE,
          },
        ],
      } as never)

      const view = await getEventEmailTemplateView(TEST_EVENT_ID)

      expect(view.isCustom).toBe(true)
      expect(view.bodyMjml).toBe(CUSTOM_BODY)
      expect(view.defaultBodyMjml).toBe(DEFAULT_BODY)
      expect(view.bodyMjml).not.toBe(view.defaultBodyMjml)
    })

    it('throws NotFoundError when the event row does not exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] } as never)

      await expect(getEventEmailTemplateView(TEST_EVENT_ID)).rejects.toBeInstanceOf(
        NotFoundError,
      )
    })

    it('throws TemplateNotFoundError("invitation") when default_body is NULL', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            invitation_mjml: null,
            default_body: null,
            updated_at: FROZEN_DATE,
            has_event_shell: false,
          },
        ],
      } as never)

      let caught: unknown
      try {
        await getEventEmailTemplateView(TEST_EVENT_ID)
      } catch (err) {
        caught = err
      }

      expect(caught).toBeInstanceOf(TemplateNotFoundError)
      expect(caught).toMatchObject({ templateKey: 'invitation' })
    })
  })

  describe('resetEventEmailTemplate', () => {
    it('calls withTransaction, emits scoped DELETE, and returns isCustom=false on success', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              invitation_mjml: null,
              default_body: DEFAULT_BODY,
              updated_at: FROZEN_DATE,
              has_event_shell: false,
            },
          ],
        } as never)
        .mockResolvedValueOnce({ rows: [] } as never)

      const view = await resetEventEmailTemplate(TEST_EVENT_ID)

      // The atomic wrapper must be used
      expect(mockWithTransaction).toHaveBeenCalledTimes(1)

      // Returned view must have isCustom=false (body and shell both cleared)
      expect(view.isCustom).toBe(false)
      expect(view.bodyMjml).toBe(DEFAULT_BODY)

      // The DELETE must be scoped to owner_kind='event' and parameterised by eventId only
      const deleteSQL = mockQuery.mock.calls[1][0] as string
      const deleteParams = mockQuery.mock.calls[1][1] as string[]
      expect(deleteSQL).toContain('DELETE FROM shell_parts')
      expect(deleteSQL).toContain("owner_kind = 'event'")
      expect(deleteParams).toEqual([TEST_EVENT_ID])
    })

    it('throws NotFoundError before emitting DELETE when the event row is absent', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as never)

      await expect(resetEventEmailTemplate(TEST_EVENT_ID)).rejects.toBeInstanceOf(NotFoundError)

      // No DELETE must have been emitted — the guard fires before the destructive step
      const deleteCalls = (mockQuery.mock.calls as Array<[string, unknown]>).filter(
        ([sql]) => typeof sql === 'string' && sql.includes('DELETE'),
      )
      expect(deleteCalls).toHaveLength(0)
    })
  })
})
