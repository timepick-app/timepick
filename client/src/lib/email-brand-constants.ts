/**
 * Client-side validation constants for email brand settings.
 * Mirror of server/src/validators/email-brand-settings.validator.ts — keep in sync.
 */

export const FONT_FAMILY_ALLOWLIST = [
  'Inter, Arial, sans-serif',
  'Arial, Helvetica, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Georgia, serif',
  'Times New Roman, Times, serif',
  'Verdana, Geneva, sans-serif',
  'Tahoma, Geneva, sans-serif',
  'Trebuchet MS, sans-serif',
  'Courier New, Courier, monospace',
] as const

export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
export const MAX_BUTTON_RADIUS = 32
