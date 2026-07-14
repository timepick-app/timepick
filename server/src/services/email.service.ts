// Barrel — re-exports everything callers import from 'email.service'.
// Logic lives in:
//   email-transport.service.ts  — SMTP transport layer (cache, health, sendMailWithFallback, getFromAddress)
//   email-send.service.ts       — send* functions and email data interfaces
export * from './email-transport.service'
export * from './email-send.service'
