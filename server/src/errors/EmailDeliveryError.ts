/**
 * EmailDeliveryError
 * Custom error class for email delivery failure scenarios
 * Used when the email service fails to deliver an email
 */
import { HttpError } from './HttpError'

export class EmailDeliveryError extends HttpError {
  public readonly name = 'EmailDeliveryError'
  public readonly code = 'EMAIL_SERVICE_UNAVAILABLE'

  constructor(message: string = 'Échec de l\'envoi d\'email') {
    super(503, message)
  }
}
