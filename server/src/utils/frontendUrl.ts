/**
 * Base URL absolue de l'app frontend (source unique pour magic links + CTA emails).
 *
 * Lis `process.env.APP_URL` côté serveur. En dev, repli sur le default Vite
 * (localhost:5173). NE PAS confondre avec `import.meta.env.VITE_API_URL` côté
 * client (= base API backend) — qui n'est jamais lue côté serveur.
 */
export function frontendBaseUrl(): string {
  return process.env.APP_URL || 'http://localhost:5173'
}

/**
 * URL absolue de la vue événement côté espace membre (route `/me/events/:uuid`).
 *
 * Les CTA d'événement des emails pointent vers l'espace membre connecté plutôt
 * que l'ancienne route publique `/events/:uuid`.
 */
export function memberEventUrl(eventId: string): string {
  return `${frontendBaseUrl()}/me/events/${eventId}`
}
