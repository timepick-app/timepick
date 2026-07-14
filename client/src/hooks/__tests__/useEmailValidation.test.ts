import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEmailValidation } from '../useEmailValidation'
import api from '../../services/api'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockedGet = vi.mocked(api.get)

describe('useEmailValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts in idle state with no warning', () => {
    const { result } = renderHook(() => useEmailValidation(true))
    expect(result.current.status).toBe('idle')
    expect(result.current.warningCode).toBeNull()
  })

  it('does not call the API when enabled = false', () => {
    const { result } = renderHook(() => useEmailValidation(false))
    act(() => {
      result.current.validate('alice@gmail.com')
    })
    expect(mockedGet).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('does not call the API when the format check fails', () => {
    const { result } = renderHook(() => useEmailValidation(true))
    act(() => {
      result.current.validate('not-an-email')
    })
    expect(mockedGet).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('transitions idle → pending → valid on a clean response', async () => {
    let resolveCall!: (v: { data: { valid: true; warning: null } }) => void
    mockedGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCall = resolve
      })
    )

    const { result } = renderHook(() => useEmailValidation(true))

    act(() => {
      result.current.validate('alice@gmail.com')
    })
    expect(result.current.status).toBe('pending')
    expect(mockedGet).toHaveBeenCalledWith('/admin/users/validate-email', expect.objectContaining({
      params: { email: 'alice@gmail.com' },
      signal: expect.any(AbortSignal),
    }))

    await act(async () => {
      resolveCall({ data: { valid: true, warning: null } })
    })

    await waitFor(() => expect(result.current.status).toBe('valid'))
    expect(result.current.warningCode).toBeNull()
  })

  it('transitions to warning with NO_MX_RECORD when the server flags a typo', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { valid: true, warning: 'NO_MX_RECORD', domain: 'gmail.con' },
    })

    const { result } = renderHook(() => useEmailValidation(true))

    act(() => {
      result.current.validate('alice@gmail.con')
    })

    await waitFor(() => expect(result.current.status).toBe('warning'))
    expect(result.current.warningCode).toBe('NO_MX_RECORD')
  })

  it('transitions to warning with DNS_UNAVAILABLE when the server gives up', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { valid: true, warning: 'DNS_UNAVAILABLE' },
    })

    const { result } = renderHook(() => useEmailValidation(true))

    act(() => {
      result.current.validate('alice@gmail.com')
    })

    await waitFor(() => expect(result.current.status).toBe('warning'))
    expect(result.current.warningCode).toBe('DNS_UNAVAILABLE')
  })

  it('skips a duplicate validate call for the same email after success', async () => {
    mockedGet.mockResolvedValue({ data: { valid: true, warning: null } })
    const { result } = renderHook(() => useEmailValidation(true))

    act(() => {
      result.current.validate('alice@gmail.com')
    })
    await waitFor(() => expect(result.current.status).toBe('valid'))

    act(() => {
      result.current.validate('alice@gmail.com')
    })
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  it('aborts an in-flight request when validate is called again with a new email', async () => {
    let firstSignal: AbortSignal | undefined
    mockedGet.mockImplementationOnce(((_url: string, config: { signal?: AbortSignal }) => {
      firstSignal = config.signal
      return new Promise(() => {})
    }) as never)
    mockedGet.mockResolvedValueOnce({ data: { valid: true, warning: null } })

    const { result } = renderHook(() => useEmailValidation(true))

    act(() => {
      result.current.validate('alice@gmail.con')
    })
    expect(firstSignal?.aborted).toBe(false)

    act(() => {
      result.current.validate('alice@gmail.com')
    })

    expect(firstSignal?.aborted).toBe(true)
    await waitFor(() => expect(result.current.status).toBe('valid'))
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('falls back silently to valid on network errors', async () => {
    mockedGet.mockRejectedValueOnce(new Error('Network Error'))

    const { result } = renderHook(() => useEmailValidation(true))

    act(() => {
      result.current.validate('alice@gmail.com')
    })

    await waitFor(() => expect(result.current.status).toBe('valid'))
    expect(result.current.warningCode).toBeNull()
  })

  it('ignores aborted-call rejections without flipping state', async () => {
    let rejectCall!: (err: unknown) => void
    mockedGet.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectCall = reject
      })
    )

    const { result } = renderHook(() => useEmailValidation(true))

    act(() => {
      result.current.validate('alice@gmail.com')
    })
    expect(result.current.status).toBe('pending')

    act(() => {
      result.current.reset()
    })
    expect(result.current.status).toBe('idle')

    await act(async () => {
      const err = new Error('canceled')
      ;(err as Error & { name: string }).name = 'CanceledError'
      rejectCall(err)
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.warningCode).toBeNull()
  })

  it('reset() clears state and unblocks re-validation of the same email', async () => {
    mockedGet.mockResolvedValue({ data: { valid: true, warning: null } })
    const { result } = renderHook(() => useEmailValidation(true))

    act(() => {
      result.current.validate('alice@gmail.com')
    })
    await waitFor(() => expect(result.current.status).toBe('valid'))

    act(() => {
      result.current.reset()
    })
    expect(result.current.status).toBe('idle')

    act(() => {
      result.current.validate('alice@gmail.com')
    })
    await waitFor(() => expect(result.current.status).toBe('valid'))
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('aborts the in-flight request on unmount', () => {
    let captured: AbortSignal | undefined
    mockedGet.mockImplementationOnce(((_url: string, config: { signal?: AbortSignal }) => {
      captured = config.signal
      return new Promise(() => {})
    }) as never)

    const { result, unmount } = renderHook(() => useEmailValidation(true))
    act(() => {
      result.current.validate('alice@gmail.com')
    })
    expect(captured?.aborted).toBe(false)

    unmount()
    expect(captured?.aborted).toBe(true)
  })
})
