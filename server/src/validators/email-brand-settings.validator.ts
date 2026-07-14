import { z } from 'zod'

/**
 * Curated list of email-safe web-fallback font stacks.
 * Order matters for S3b dropdown display (most-recommended first).
 * The factory default matches migration 006 seed.
 */
const FONT_FAMILY_ALLOWLIST = [
  'Inter, Arial, sans-serif',
  'Arial, Helvetica, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Georgia, serif',
  'Times New Roman, Times, serif',
  'Verdana, Geneva, sans-serif',
  'Tahoma, Geneva, sans-serif',
  'Trebuchet MS, sans-serif',
  'Courier New, Courier, monospace',
] as const satisfies readonly [string, ...string[]]

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
const MIN_BUTTON_RADIUS = 0
const MAX_BUTTON_RADIUS = 32
const MAX_LOGO_URL_LENGTH = 2048

export const emailBrandSettingsPatchSchema = z
  .object({
    logoUrl: z
      .string()
      .url("L'URL du logo doit être valide")
      .max(MAX_LOGO_URL_LENGTH, "L'URL du logo ne peut pas dépasser 2048 caractères")
      .nullable()
      .optional(),
    primaryColor: z
      .string()
      .regex(HEX_COLOR_REGEX, 'La couleur primaire doit être au format hexadécimal #RRGGBB')
      .optional(),
    buttonTextColor: z
      .string()
      .regex(HEX_COLOR_REGEX, 'La couleur du texte des boutons doit être au format hexadécimal #RRGGBB')
      .optional(),
    fontFamily: z
      .enum(FONT_FAMILY_ALLOWLIST, {
        error: () => "La police doit être l'une des polices supportées",
      })
      .optional(),
    buttonBorderRadius: z
      .number({ error: () => 'Le rayon doit être un nombre' })
      .int('Le rayon doit être un entier')
      .min(MIN_BUTTON_RADIUS, 'Le rayon ne peut pas être négatif')
      .max(MAX_BUTTON_RADIUS, `Le rayon ne peut pas dépasser ${MAX_BUTTON_RADIUS}`)
      .optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Au moins un champ doit être fourni',
  })
