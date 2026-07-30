/**
 * Miroir client du contrat d'upload d'image : plafond multer et allowlist MIME
 * de `email-upload.service.ts` / `organization-logo.service.ts` (`ALLOWED_MIME`).
 * Sert à refuser un fichier hors contrat AVANT la requête, pas après un 413/415.
 */
export const IMAGE_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp'
export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
export const IMAGE_UPLOAD_HINT = 'PNG, JPEG ou WebP — 5 Mo max'
