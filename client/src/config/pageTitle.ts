/**
 * Centralized page title configuration for TimePick
 *
 * This configuration maps routes to their French display titles.
 * Used by useDocumentTitle hook to automatically set document.title
 * based on the current route.
 */

const APP_NAME = 'TimePick';
const TITLE_SEPARATOR = ' - ';

/**
 * Static page titles mapped by route path
 */
const PAGE_TITLES: Record<string, string> = {
  // Auth pages
  '/login': 'Connexion',
  '/verify': 'Vérification',
  '/setup': 'Installation',

  // Public pages
  '/': 'Calendrier',
  '/booking': 'Calendrier',

  // Admin pages
  '/admin': 'Tableau de bord',
  '/admin/dashboard': 'Tableau de bord',
  '/admin/events': 'Événements',
  '/admin/users': 'Membres',
  '/admin/settings': 'Paramètres',
  '/admin/profile': 'Profil',
  // Espace membre (Story 1.3)
  '/me': 'Mon agenda',
  '/me/profile': 'Profil',
};

/**
 * Format a title with the app name suffix
 *
 * @param title - The page title
 * @param includeAppName - Whether to append " - TimePick" (default: true)
 * @returns Formatted title string
 *
 * @example
 * formatTitle('Connexion') // 'Connexion - TimePick'
 * formatTitle('Connexion', false) // 'Connexion'
 */
export function formatTitle(title: string, includeAppName = true): string {
  if (!includeAppName) {
    return title;
  }
  return `${title}${TITLE_SEPARATOR}${APP_NAME}`;
}

/**
 * Détecte la route de détail d'un événement membre (`/me/events/:uuid`).
 *
 * Sur cette route, `MemberEventStickyHeader` rend le nom de l'événement en
 * `<h1>` : `MemberLayout` passe alors `pageTitle={null}` à `AppShell` (plus
 * de `<h1>` générique « Événement ») pour éviter le double titre.
 */
export function isMemberEventRoute(pathname: string): boolean {
  return /^\/me\/events\/[\w-]+$/.test(pathname)
}

/**
 * Détecte la route d'édition d'un événement admin (`/admin/events/:id/edit`).
 *
 * Sert à supprimer le H1 générique du shell sur cette page : le nom réel de
 * l'événement devient le H1 (rendu par EventEditHeader), et passer `pageTitle`
 * à `null` évite un double `<h1>`. `getStaticTitle` conserve son cas
 * `edit → 'Éditer l'événement'` (utilisé pour `document.title` + fallback).
 */
export function isAdminEventEditRoute(pathname: string): boolean {
  return /^\/admin\/events\/[^/]+\/edit$/.test(pathname)
}

/**
 * Get the static title for a given pathname
 *
 * @param pathname - The current route pathname
 * @returns The static title or null if not found
 *
 * @example
 * getStaticTitle('/login') // 'Connexion'
 * getStaticTitle('/unknown') // null
 */
export function getStaticTitle(pathname: string): string | null {
  // Direct match first
  if (PAGE_TITLES[pathname]) {
    return PAGE_TITLES[pathname];
  }

  // Handle dynamic admin event edit route
  if (pathname.match(/^\/admin\/events\/[^/]+\/edit$/)) {
    return "Éditer l'événement";
  }

  // Handle dynamic admin event detail route (/admin/events/:id — vue détail)
  if (pathname.match(/^\/admin\/events\/[\w-]+$/)) {
    return 'Détail événement';
  }

  // Handle member event route (/me/events/:uuid — Story 1.3)
  if (isMemberEventRoute(pathname)) {
    return 'Événement';
  }

  // Handle public event route (UUID-based)
  if (pathname.match(/^\/events\/[a-f0-9-]{36}$/i)) {
    return 'Événement';
  }

  return null;
}
