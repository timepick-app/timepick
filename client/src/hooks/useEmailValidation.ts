import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

type EmailValidationStatus = 'idle' | 'pending' | 'valid' | 'warning'
type EmailValidationWarning = 'NO_MX_RECORD' | 'DNS_UNAVAILABLE'

export interface UseEmailValidationResult {
  status: EmailValidationStatus
  warningCode: EmailValidationWarning | null
  validate: (email: string) => void
  reset: () => void
}

/**
 * Mirror of the server's STRICT_EMAIL_REGEX. Kept locally rather than shared
 * via a package boundary to avoid coupling client/server modules. Update both
 * places together if the spec changes.
 */
const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

interface ValidateEmailResponse {
  valid: true
  warning: EmailValidationWarning | null
  domain?: string
}

/**
 * Triggers a non-blocking pre-flight email validation against the admin
 * `/users/validate-email` endpoint.
 *
 * Behaviour:
 * - `enabled === false` or format-failing input → no network call, status stays idle.
 * - Same email already validated since last reset → skipped (lastValidatedRef).
 * - Concurrent calls → previous request aborted via AbortController so a stale
 *   reply can't overwrite the latest state.
 * - Network errors are swallowed silently (status reverts to 'valid', no warning),
 *   matching the server's own DNS_UNAVAILABLE soft-failure contract.
 */
export function useEmailValidation(enabled: boolean): UseEmailValidationResult {
  const [status, setStatus] = useState<EmailValidationStatus>('idle')
  const [warningCode, setWarningCode] = useState<EmailValidationWarning | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const lastValidatedRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    lastValidatedRef.current = null
    setStatus('idle')
    setWarningCode(null)
  }, [])

  const validate = useCallback(
    (rawEmail: string) => {
      if (!enabled) return
      const email = rawEmail.trim()
      if (!STRICT_EMAIL_REGEX.test(email)) {
        // Format check is the client's responsibility; bail without resetting
        // so a previously emitted warning isn't clobbered by a typo mid-edit.
        return
      }
      if (email === lastValidatedRef.current) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setStatus('pending')

      api
        .get<ValidateEmailResponse>('/admin/users/validate-email', {
          params: { email },
          signal: controller.signal,
        })
        .then((res) => {
          if (controller.signal.aborted || !mountedRef.current) return
          lastValidatedRef.current = email
          if (res.data.warning) {
            setStatus('warning')
            setWarningCode(res.data.warning)
          } else {
            setStatus('valid')
            setWarningCode(null)
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || !mountedRef.current) return
          const name = (err as { name?: string })?.name
          const code = (err as { code?: string })?.code
          if (name === 'CanceledError' || name === 'AbortError' || code === 'ERR_CANCELED') {
            return
          }
          // Network or unexpected error → degrade silently. Don't block the UX,
          // don't surface noise the admin can't act on.
          setStatus('valid')
          setWarningCode(null)
        })
    },
    [enabled]
  )

  return { status, warningCode, validate, reset }
}
