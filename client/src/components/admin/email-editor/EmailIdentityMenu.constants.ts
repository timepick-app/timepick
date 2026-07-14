/**
 * User-facing strings for the EmailIdentityMenu (Plan 2 — 2026-05-23).
 *
 * Plan 2 post-smoke V2 (2026-05-23) — la limite « ≤ 8 px » (compat VML
 * Outlook stricte) a été renégociée. Le radius accepte désormais
 * 0–32 px, en parité avec `MAX_BUTTON_RADIUS` historique du singleton.
 * Outlook < 2016 affichera des coins carrés au-delà de 8 px ; Gmail,
 * Apple Mail et Outlook.com (border-radius natif) restent corrects.
 */
export { MAX_BUTTON_RADIUS } from '@/lib/email-brand-constants'

export const IDENTITY_MENU_BUTTON_LABEL = "Identité visuelle"

export const IDENTITY_MENU_TITLE = "Identité visuelle des emails"

export const FIELD_LABEL_LOGO = "Logo"
export const FIELD_LABEL_PRIMARY_COLOR = "Couleur primaire (boutons)"
export const FIELD_LABEL_BUTTON_TEXT_COLOR = "Couleur du texte des boutons"
export const FIELD_LABEL_FONT_FAMILY = "Police"
export const FIELD_LABEL_BORDER_RADIUS = "Bordure arrondie (boutons)"

export const LOGO_UPLOAD_BUTTON_LABEL = "Téléverser un logo"
export const LOGO_UPLOADING_LABEL = "Téléversement..."
export const LOGO_REMOVE_BUTTON_LABEL = "Supprimer"
export const LOGO_EMPTY_PLACEHOLDER = "Aucun logo configuré"

export const LOGO_UPLOAD_ERROR_TOO_LARGE = "Fichier trop volumineux (max 5 MB)"
export const LOGO_UPLOAD_ERROR_GENERIC = "Erreur lors du téléversement de l'image"

export const HEX_COLOR_INVALID_LABEL = "Format invalide (ex: #ff0000)"

export const RADIUS_CLAMPED_TOOLTIP =
  "Au-delà de 8 px, Outlook < 2016 affiche des coins carrés (compatibilité dégradée acceptée)."

/**
 * Valeurs d'usine du brand, miroir des champs **exposés par ce menu** (logo,
 * couleur primaire, couleur texte bouton, police, arrondi).
 *
 * Gardé en synchro avec `server/src/config/emailBrandDefaults.ts` — source de
 * vérité serveur ; ici uniquement pour calculer l'état désactivé du bouton
 * « Réinitialiser l'identité visuelle » (brand déjà == usine ⇒ rien à faire).
 */
export const EMAIL_BRAND_FACTORY_DEFAULTS = {
  logoUrl: null as string | null,
  primaryColor: '#18181b',
  buttonTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  buttonBorderRadius: 4,
} as const

export const RESET_IDENTITY_BUTTON_LABEL = "Réinitialiser l'identité visuelle"
export const RESET_IDENTITY_DIALOG_TITLE = "Réinitialiser l'identité visuelle ?"
export const RESET_IDENTITY_DIALOG_DESCRIPTION =
  "Le logo, les couleurs, la police et l'arrondi des boutons reviendront aux valeurs d'usine. Cette action est immédiate et s'applique à tous les emails."
export const RESET_IDENTITY_CONFIRM_LABEL = "Réinitialiser"
export const RESET_IDENTITY_DISABLED_TOOLTIP =
  "L'identité visuelle est déjà à sa valeur d'usine."
