import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePublicOrganization } from '@/hooks/usePublicOrganization'
import { PublicUserMenu } from './PublicUserMenu'

/** Repli de marque quand l'organisation n'a pas (encore) de nom configuré. */
const FALLBACK_BRAND_NAME = 'TimePick'

/**
 * Props pour PublicNavHeader
 */
export interface PublicNavHeaderProps {
  /** Nom de l'événement (affiché dans le header à la place du branding) */
  eventName?: string
  /** Période formatée de l'événement (ex: "2 avril 2026") */
  periodFormatted?: string | null
  /** Cible du lien « Se connecter » (défaut `/login` ; propage `?next=`). */
  loginHref?: string
}

/**
 * Navigation header for public-facing pages
 *
 * When eventName is provided, displays event context (title + period)
 * instead of app branding. This maximizes viewport space for the calendar.
 *
 * Le bloc branding par défaut porte le nom de l'organisation hébergée par
 * l'instance (chantier A1) ; il retombe sur « TimePick » tant que le nom est
 * vide, en chargement ou en erreur — l'en-tête ne doit jamais afficher de
 * trou. Le mode `eventName` n'utilise pas cette identité.
 *
 * @see Story 20-5 - Navigation Ajoutée
 * @see docs/2026-07-26-note-page-racine-identite-organisation.md §4.3
 */
export function PublicNavHeader({ eventName, periodFormatted, loginHref = '/login' }: PublicNavHeaderProps) {
  const { data: organization } = usePublicOrganization()
  const brandName = organization?.name.trim() || FALLBACK_BRAND_NAME

  const isAuthenticated = () => {
    const token = localStorage.getItem('auth_token')
    const user = localStorage.getItem('auth_user')
    return !!token && !!user
  }

  const authBlock = isAuthenticated() ? (
    <PublicUserMenu />
  ) : (
    <Button variant="outline" size="sm" asChild>
      <Link to={loginHref}>Se connecter</Link>
    </Button>
  )

  // Event context mode: show event title + period instead of branding
  if (eventName) {
    return (
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-2">
        <div className="flex items-center justify-between max-w-7xl mx-auto gap-3">
          {/* Left block: event title + period */}
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
            <h1 className="text-sm sm:text-base font-semibold text-foreground truncate max-w-[200px] sm:max-w-[320px] lg:max-w-[500px]">
              {eventName}
            </h1>
            <div className="flex items-baseline gap-2">
              {periodFormatted && (
                <>
                  <span className="hidden sm:inline text-muted-foreground" aria-hidden="true">·</span>
                  <span
                    data-testid="event-period"
                    className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap"
                  >
                    {periodFormatted}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right block: auth */}
          <div className="flex-shrink-0">
            {authBlock}
          </div>
        </div>
      </header>
    )
  }

  // Default mode: organization branding (for non-event pages)
  return (
    <header className="sticky top-0 z-50 bg-background border-b px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto gap-3">
        <Link to="/" className="hover:opacity-80 transition-opacity min-w-0">
          {/* Bornes de largeur alignées sur le titre d'événement ci-dessus : le
              nom d'organisation est saisi par l'admin (jusqu'à 200 caractères)
              et ne doit pas pousser le bloc d'auth hors de l'en-tête. */}
          <span className="text-lg font-semibold text-primary truncate max-w-[150px] sm:max-w-[320px] lg:max-w-[500px] inline-block align-bottom">
            {brandName}
          </span>
        </Link>
        <div className="flex-shrink-0">{authBlock}</div>
      </div>
    </header>
  )
}
