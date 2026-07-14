import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getEventEmailTemplate,
  patchEventEmailTemplate,
  resetEventEmailTemplate,
  previewEventEmailTemplate,
  type EventEmailTemplate,
  type EventEmailTemplatePreview,
} from '../event-email-templates.service'

const mockGet = vi.fn()
const mockPatch = vi.fn()
const mockPost = vi.fn()

vi.mock('../api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

const EVENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const SAMPLE_TEMPLATE: EventEmailTemplate = {
  eventId: EVENT_ID,
  templateKey: 'invitation',
  bodyMjml: '<!-- BODY:START --><mj-section>custom</mj-section><!-- BODY:END -->',
  defaultBodyMjml: '<!-- BODY:START --><mj-section>default</mj-section><!-- BODY:END -->',
  isCustom: true,
  updatedAt: '2026-05-02T12:00:00Z',
}

describe('event-email-templates.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getEventEmailTemplate', () => {
    it('GETs /admin/events/:id/email-template and unwraps data.data', async () => {
      mockGet.mockResolvedValue({ data: { data: SAMPLE_TEMPLATE } })

      const result = await getEventEmailTemplate(EVENT_ID)

      expect(mockGet).toHaveBeenCalledWith(`/admin/events/${EVENT_ID}/email-template`)
      expect(result).toEqual(SAMPLE_TEMPLATE)
    })

    it('rejects with the original error when the API rejects (e.g. 404)', async () => {
      const error = { response: { status: 404, data: { error: { code: 'EVENT_NOT_FOUND' } } } }
      mockGet.mockRejectedValue(error)

      await expect(getEventEmailTemplate(EVENT_ID)).rejects.toBe(error)
    })
  })

  describe('patchEventEmailTemplate', () => {
    it('PATCHes /admin/events/:id/email-template with the bodyMjml payload', async () => {
      const updated = { ...SAMPLE_TEMPLATE, bodyMjml: '<!-- BODY:START --><mj-section>edited</mj-section><!-- BODY:END -->' }
      mockPatch.mockResolvedValue({ data: { data: updated } })

      const result = await patchEventEmailTemplate(EVENT_ID, {
        bodyMjml: '<!-- BODY:START --><mj-section>edited</mj-section><!-- BODY:END -->',
      })

      expect(mockPatch).toHaveBeenCalledWith(
        `/admin/events/${EVENT_ID}/email-template`,
        { bodyMjml: '<!-- BODY:START --><mj-section>edited</mj-section><!-- BODY:END -->' },
      )
      expect(result).toEqual(updated)
    })

    it('rejects with the original validation error (400) without transformation', async () => {
      const error = {
        response: {
          status: 400,
          data: { error: { code: 'VALIDATION_ERROR', message: 'bodyMjml too long' } },
        },
      }
      mockPatch.mockRejectedValue(error)

      await expect(
        patchEventEmailTemplate(EVENT_ID, { bodyMjml: 'x' }),
      ).rejects.toBe(error)
    })
  })

  describe('resetEventEmailTemplate', () => {
    it('POSTs /admin/events/:id/email-template/reset and returns the post-reset DTO', async () => {
      const dto = { ...SAMPLE_TEMPLATE, isCustom: false, bodyMjml: SAMPLE_TEMPLATE.defaultBodyMjml }
      mockPost.mockResolvedValue({ data: { data: dto } })

      const result = await resetEventEmailTemplate(EVENT_ID)

      expect(mockPost).toHaveBeenCalledWith(
        `/admin/events/${EVENT_ID}/email-template/reset`,
      )
      expect(result).toEqual(dto)
    })

    it('rejects with the original error when the API rejects (e.g. 404)', async () => {
      const error = { response: { status: 404, data: { error: { code: 'EVENT_NOT_FOUND' } } } }
      mockPost.mockRejectedValue(error)

      await expect(resetEventEmailTemplate(EVENT_ID)).rejects.toBe(error)
    })
  })

  describe('previewEventEmailTemplate', () => {
    it('POSTs /admin/events/:id/email-template/preview and returns { html, text, templateKey, eventId }', async () => {
      const preview: EventEmailTemplatePreview = {
        html: '<html>preview</html>',
        text: 'preview',
        templateKey: 'invitation',
        eventId: EVENT_ID,
      }
      mockPost.mockResolvedValue({ data: { data: preview } })

      const result = await previewEventEmailTemplate(EVENT_ID)

      expect(mockPost).toHaveBeenCalledWith(
        `/admin/events/${EVENT_ID}/email-template/preview`,
      )
      expect(result).toEqual(preview)
    })

    it('rejects with the original error when the API rejects (e.g. 500)', async () => {
      const error = { response: { status: 500, data: { error: { code: 'INTERNAL_ERROR' } } } }
      mockPost.mockRejectedValue(error)

      await expect(previewEventEmailTemplate(EVENT_ID)).rejects.toBe(error)
    })
  })
})
