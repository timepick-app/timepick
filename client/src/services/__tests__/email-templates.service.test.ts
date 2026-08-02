import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getEmailTemplate,
  patchEmailTemplate,
  resetAllEmailTemplates,
  type InvitationTemplate,
  type SystemTemplate,
} from '../email-templates.service'

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

describe('email-templates.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getEmailTemplate', () => {
    it('GETs /admin/settings/email-templates/invitation and returns data.data', async () => {
      const dto: InvitationTemplate = {
        templateKey: 'invitation',
        bodyMjml: '<mj-section>body</mj-section>',
        defaultBodyMjml: '<mj-section>default</mj-section>',
        updatedAt: '2026-05-01T10:00:00Z',
        subject: null,
        defaultSubject: 'Inscription participation - {{event_name}}',
        subjectVariables: [],
      }
      mockGet.mockResolvedValue({ data: { data: dto } })

      const result = await getEmailTemplate('invitation')

      expect(mockGet).toHaveBeenCalledWith('/admin/settings/email-templates/invitation')
      expect(result).toEqual(dto)
    })

    it('forwards a system templateKey verbatim in the path (snake_case preserved)', async () => {
      const dto: SystemTemplate = {
        templateKey: 'magic_link_login',
        introText: 'Bonjour',
        signatureText: 'Cordialement',
        defaultIntroText: 'Bonjour par défaut',
        defaultSignatureText: 'Cordialement par défaut',
        updatedAt: '2026-05-01T10:00:00Z',
        subject: null,
        defaultSubject: 'Connexion à TimePick',
        subjectVariables: [],
      }
      mockGet.mockResolvedValue({ data: { data: dto } })

      const result = await getEmailTemplate('magic_link_login')

      expect(mockGet).toHaveBeenCalledWith(
        '/admin/settings/email-templates/magic_link_login',
      )
      expect(result).toEqual(dto)
    })

    it('rejects with the original error when the API rejects (e.g. 401)', async () => {
      const error = { response: { status: 401, data: { error: { message: 'Unauthorized' } } } }
      mockGet.mockRejectedValue(error)

      await expect(getEmailTemplate('invitation')).rejects.toBe(error)
    })
  })

  describe('patchEmailTemplate', () => {
    it('PATCHes /admin/settings/email-templates/invitation with the bodyMjml payload', async () => {
      const updated: InvitationTemplate = {
        templateKey: 'invitation',
        bodyMjml: '<mj-section>edited</mj-section>',
        defaultBodyMjml: '<mj-section>default</mj-section>',
        updatedAt: '2026-05-01T11:00:00Z',
        subject: null,
        defaultSubject: 'Inscription participation - {{event_name}}',
        subjectVariables: [],
      }
      mockPatch.mockResolvedValue({ data: { data: updated } })

      const result = await patchEmailTemplate('invitation', {
        bodyMjml: '<mj-section>edited</mj-section>',
      })

      expect(mockPatch).toHaveBeenCalledWith(
        '/admin/settings/email-templates/invitation',
        { bodyMjml: '<mj-section>edited</mj-section>' },
      )
      expect(result).toEqual(updated)
    })

    it('PATCHes a system template path with the system payload unchanged', async () => {
      const dto: SystemTemplate = {
        templateKey: 'magic_link_login',
        introText: 'Salut',
        signatureText: 'Bye',
        defaultIntroText: 'Salut',
        defaultSignatureText: 'Bye',
        updatedAt: '2026-05-01T11:00:00Z',
        subject: null,
        defaultSubject: 'Connexion à TimePick',
        subjectVariables: [],
      }
      mockPatch.mockResolvedValue({ data: { data: dto } })

      const payload = { introText: 'Salut', signatureText: 'Bye' }
      const result = await patchEmailTemplate('magic_link_login', payload)

      expect(mockPatch).toHaveBeenCalledWith(
        '/admin/settings/email-templates/magic_link_login',
        payload,
      )
      expect(result).toEqual(dto)
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
        patchEmailTemplate('invitation', { bodyMjml: 'x' }),
      ).rejects.toBe(error)
    })
  })

  describe('resetAllEmailTemplates', () => {
    it('POSTs /admin/settings/email-templates/reset-all and returns the result', async () => {
      const result = { templatesReset: 4, shellPartsDeleted: 7 }
      mockPost.mockResolvedValue({ data: { data: result } })

      const out = await resetAllEmailTemplates()

      expect(mockPost).toHaveBeenCalledWith('/admin/settings/email-templates/reset-all')
      expect(out).toEqual(result)
    })
  })
})
