/**
 * EmailDeliveryError
 * Custom error class for email delivery failure scenarios
 * Used when the email service fails to deliver an email
 */
import { HttpError } from './HttpError'
import { ERROR_CODES } from '@timepick/shared'

export class EmailDeliveryError extends HttpError {
  public readonly name = 'EmailDeliveryError'

  constructor(message: string = "L'e-mail n'a pas pu être envoyé. Rien n'est parti, réessayez dans quelques minutes.") {
    super(503, message, ERROR_CODES.EMAIL_SERVICE_UNAVAILABLE)
  }
}
