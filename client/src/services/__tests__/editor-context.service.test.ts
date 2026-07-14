import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getEditorContext, type ResolvedShell } from '../editor-context.service'

const mockGet = vi.fn()

vi.mock('../api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

const resolvedShellFixture: ResolvedShell = {
  header: { contentMjml: '<mj-section>H</mj-section>', origin: 'hardcoded' },
  body: { contentMjml: '<mj-section>B</mj-section>', origin: 'template' },
  footer: { contentMjml: '<mj-section>F</mj-section>', origin: 'hardcoded' },
  mjBody: {
    attrs: { backgroundColor: '#ffffff', paddingTop: '0', paddingBottom: '0' },
    origin: 'hardcoded',
  },
  contentWrapper: null,
}

describe('editor-context.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GETs /admin/editor-context with ownerKind/ownerId/templateKey as query params and unwraps data.data', async () => {
    mockGet.mockResolvedValue({ data: { data: resolvedShellFixture } })

    const result = await getEditorContext({
      ownerKind: 'event',
      ownerId: 'evt-1',
      templateKey: 'invitation',
    })

    expect(mockGet).toHaveBeenCalledWith('/admin/editor-context', {
      params: { ownerKind: 'event', ownerId: 'evt-1', templateKey: 'invitation' },
    })
    expect(result).toEqual(resolvedShellFixture)
  })

  it('forwards a brand-level call with ownerKind="brand"', async () => {
    mockGet.mockResolvedValue({ data: { data: resolvedShellFixture } })

    await getEditorContext({
      ownerKind: 'brand',
      ownerId: 'brand',
      templateKey: 'invitation',
    })

    expect(mockGet).toHaveBeenCalledWith('/admin/editor-context', {
      params: { ownerKind: 'brand', ownerId: 'brand', templateKey: 'invitation' },
    })
  })

  it('rejects with the original error when the API rejects (e.g. 401)', async () => {
    const error = { response: { status: 401, data: { error: { message: 'Unauthorized' } } } }
    mockGet.mockRejectedValue(error)

    await expect(
      getEditorContext({ ownerKind: 'event', ownerId: 'x', templateKey: 'invitation' }),
    ).rejects.toBe(error)
  })
})
