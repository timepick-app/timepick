import { describe, it, expect } from 'vitest'
import { extractErrorMessage } from '../extractErrorMessage'

describe('extractErrorMessage', () => {
  it('returns the axios-shaped error.response.data.error.message when present', () => {
    const err = {
      response: { data: { error: { message: 'Bad request from server' } } },
      message: 'Request failed with status code 400',
    }
    expect(extractErrorMessage(err, 'fallback')).toBe('Bad request from server')
  })

  it('falls back to error.message when no response shape is present', () => {
    const err = new Error('Network down')
    expect(extractErrorMessage(err, 'fallback')).toBe('Network down')
  })

  it('returns the fallback when both response and message are absent', () => {
    expect(extractErrorMessage({}, 'fallback message')).toBe('fallback message')
  })

  it('returns the fallback when err is null', () => {
    expect(extractErrorMessage(null, 'fallback')).toBe('fallback')
  })

  it('returns the fallback when err is undefined', () => {
    expect(extractErrorMessage(undefined, 'fallback')).toBe('fallback')
  })

  it('handles a partial response shape (no message property) by falling back', () => {
    const err = { response: { data: {} }, message: 'Generic error' }
    expect(extractErrorMessage(err, 'fallback')).toBe('Generic error')
  })

  it('returns the fallback when err is a string (no message, no response)', () => {
    expect(extractErrorMessage('plain string error', 'fallback')).toBe(
      'fallback',
    )
  })

  it('returns the flat-string API error when data.error is a string', () => {
    const err = { response: { data: { error: 'Slot is full' } } }
    expect(extractErrorMessage(err, 'fb')).toBe('Slot is full')
  })

  it('falls through an empty flat-string API error to error.message', () => {
    const err = { response: { data: { error: '' } }, message: 'Generic' }
    expect(extractErrorMessage(err, 'fb')).toBe('Generic')
  })
})
