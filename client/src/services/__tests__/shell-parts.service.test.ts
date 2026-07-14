import { describe, it, expect, vi, beforeEach } from 'vitest'
import { upsertShellPart, deleteShellPart, type ShellPart } from '../shell-parts.service'

const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('../api', () => ({
  default: {
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

const shellPartFixture: ShellPart = {
  id: '11111111-1111-1111-1111-111111111111',
  ownerKind: 'event',
  ownerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  partKind: 'header',
  contentMjml: '<mj-section data-part-kind="header"><mj-column><mj-text>H</mj-text></mj-column></mj-section>',
  createdAt: '2026-05-16T10:00:00.000Z',
  updatedAt: '2026-05-16T10:00:00.000Z',
}

describe('shell-parts.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PUTs /admin/shell-parts/:ownerKind/:ownerId/:partKind with contentMjml and unwraps data.data', async () => {
    mockPut.mockResolvedValue({ data: { data: shellPartFixture } })

    const result = await upsertShellPart({
      ownerKind: 'event',
      ownerId: shellPartFixture.ownerId,
      partKind: 'header',
      contentMjml: shellPartFixture.contentMjml,
    })

    expect(mockPut).toHaveBeenCalledWith(
      `/admin/shell-parts/event/${shellPartFixture.ownerId}/header`,
      { contentMjml: shellPartFixture.contentMjml },
    )
    expect(result).toEqual(shellPartFixture)
  })

  it('builds the URL path with ownerKind/ownerId/partKind in order (template/invitation/body)', async () => {
    mockPut.mockResolvedValue({ data: { data: { ...shellPartFixture, ownerKind: 'template', ownerId: 'invitation', partKind: 'body' } } })

    await upsertShellPart({
      ownerKind: 'template',
      ownerId: 'invitation',
      partKind: 'body',
      contentMjml: '<mj-section data-part-kind="body"><mj-column></mj-column></mj-section>',
    })

    expect(mockPut).toHaveBeenCalledWith(
      '/admin/shell-parts/template/invitation/body',
      expect.objectContaining({ contentMjml: expect.any(String) }),
    )
  })

  it('encodeURIComponent on ownerId — a hypothetical "foo/bar" templateKey is percent-encoded so Express routing stays intact', async () => {
    mockPut.mockResolvedValue({ data: { data: shellPartFixture } })

    await upsertShellPart({
      ownerKind: 'template',
      ownerId: 'foo/bar',
      partKind: 'footer',
      contentMjml: '<mj-section data-part-kind="footer"><mj-column></mj-column></mj-section>',
    })

    expect(mockPut).toHaveBeenCalledWith(
      '/admin/shell-parts/template/foo%2Fbar/footer',
      expect.any(Object),
    )
  })

  it('rejects with the original 400 error when the server rejects the payload', async () => {
    const error = {
      response: {
        status: 400,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'data-part-kind mismatch: expected "header", got "footer"',
          },
        },
      },
    }
    mockPut.mockRejectedValue(error)

    await expect(
      upsertShellPart({
        ownerKind: 'event',
        ownerId: shellPartFixture.ownerId,
        partKind: 'header',
        contentMjml: '<mj-section data-part-kind="footer"><mj-column></mj-column></mj-section>',
      }),
    ).rejects.toBe(error)
  })

  it('rejects with the original 404 error when the event row is missing', async () => {
    const error = {
      response: {
        status: 404,
        data: { error: { code: 'NOT_FOUND', message: 'Événement non trouvé' } },
      },
    }
    mockPut.mockRejectedValue(error)

    await expect(
      upsertShellPart({
        ownerKind: 'event',
        ownerId: '00000000-0000-0000-0000-000000000000',
        partKind: 'header',
        contentMjml: shellPartFixture.contentMjml,
      }),
    ).rejects.toBe(error)
  })
  // ---- deleteShellPart (Lot 2) — mirror of upsertShellPart ----

  it('DELETEs /admin/shell-parts/:ownerKind/:ownerId/:partKind and resolves void on 204', async () => {
    mockDelete.mockResolvedValue({ status: 204 })

    const result = await deleteShellPart({
      ownerKind: 'event',
      ownerId: shellPartFixture.ownerId,
      partKind: 'header',
    })

    expect(mockDelete).toHaveBeenCalledWith(
      `/admin/shell-parts/event/${shellPartFixture.ownerId}/header`,
    )
    expect(result).toBeUndefined()
  })

  it('encodeURIComponent on ownerId for DELETE — a hypothetical "foo/bar" templateKey is percent-encoded', async () => {
    mockDelete.mockResolvedValue({ status: 204 })

    await deleteShellPart({
      ownerKind: 'template',
      ownerId: 'foo/bar',
      partKind: 'footer',
    })

    expect(mockDelete).toHaveBeenCalledWith('/admin/shell-parts/template/foo%2Fbar/footer')
  })

  it('rejects with the original 404 error when DELETE targets a missing owner row (the orchestrator treats 404 as idempotent)', async () => {
    const error = {
      response: {
        status: 404,
        data: { error: { code: 'NOT_FOUND', message: 'Événement non trouvé' } },
      },
    }
    mockDelete.mockRejectedValue(error)

    await expect(
      deleteShellPart({
        ownerKind: 'event',
        ownerId: '00000000-0000-0000-0000-000000000000',
        partKind: 'header',
      }),
    ).rejects.toBe(error)
  })
})
