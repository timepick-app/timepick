/**
 * HttpError
 * Base class for all custom HTTP errors.
 * Subclasses set their statusCode via super(...) and their own `name` field.
 */
export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message)
    // Maintains proper stack trace (V8 only); new.target = concrete subclass
    Error.captureStackTrace?.(this, new.target)
  }
}
