export type EmailSubtabId =
  | 'template-invitation'
  | 'emails-systeme-magic-link-login'
  | 'emails-systeme-confirmation'
  | 'emails-systeme-account-created'
  | 'emails-systeme-annulation'
  | 'emails-systeme-desinscription'
  | 'emails-systeme-role-promu'
  | 'emails-systeme-role-retrograde'

export const VALID_EMAIL_SUBTABS: EmailSubtabId[] = [
  'template-invitation',
  'emails-systeme-magic-link-login',
  'emails-systeme-confirmation',
  'emails-systeme-account-created',
  'emails-systeme-annulation',
  'emails-systeme-desinscription',
  'emails-systeme-role-promu',
  'emails-systeme-role-retrograde',
]

export const DEFAULT_EMAIL_SUBTAB: EmailSubtabId = 'template-invitation'

// Plan 2 (2026-05-23) — la subtab `identite-visuelle` a été dissoute dans
// le menu Popover de l'éditeur d'email, redirigée vers le default.
// L2 (2026-06-06) — « Magic links » scindé en deux sous-onglets (login /
// recovery) ; l'ancien id groupé redirige vers le sous-onglet login.
// Les URL legacy sont préservées (cf. Settings.tsx).
export const LEGACY_EMAIL_SUBTAB_REDIRECTS: Record<string, EmailSubtabId> = {
  'identite-visuelle': DEFAULT_EMAIL_SUBTAB,
  'emails-systeme-magic-links': 'emails-systeme-magic-link-login',
}
