import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown, LogOut, UserRound, CalendarClock, LayoutDashboard, BookOpen, ExternalLink } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useNavigationBlocker } from '@/contexts/NavigationBlockerContext'
import { clearSessionData } from '@/hooks/useSessionTimeout'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatFullName } from '@/lib/formatFullName'
import { getInitials } from '@/lib/getInitials'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** URL publique de la documentation TimePick (D8). */
const DOCS_URL = 'https://timepick.docs.jensen-siu.net/'

interface NavUserProps {
  /** Appelé après une navigation (ferme le tiroir mobile). */
  onNavigate?: () => void
  /** Chemin du profil. Defaut '/admin/profile' (préserve NavUser.test.tsx qui
   *  code ce chemin en dur). MemberLayout passe '/me/profile' (D4). */
  profilePath?: string
  /** Shell courant : détermine l'item de bascule (D7 story 1.4).
   *  'admin' → lien « Espace membre » (ssi hasMemberAccess) ; 'member' → lien
   *  « Console admin » (ssi role admin). Défaut 'admin' (préserve NavUser.test.tsx). */
  shell?: 'admin' | 'member'
}

/**
 * NavUser — carte profil en bas de la sidebar admin (pattern shadcn-admin).
 *
 * Remplace l'ancien `UserMenu` du header : affiche avatar + nom + email et
 * ouvre un menu (Profil / Déconnexion). La source de vérité est `useAuth()`
 * (réactif), de sorte qu'une modification du nom dans la vue Profil se reflète
 * immédiatement ici.
 */
export function NavUser({ onNavigate, profilePath = '/admin/profile', shell = 'admin' }: NavUserProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isBlocked, requestNavigation } = useNavigationBlocker()

  const firstName = user?.firstName ?? ''
  const lastName = user?.lastName ?? null
  const name = formatFullName(firstName, lastName) || user?.email?.split('@')[0] || 'Admin'
  const email = user?.email ?? ''
  const initials = getInitials(firstName || name, lastName)

  const handleProfile = () => {
    if (isBlocked) {
      requestNavigation(profilePath)
    } else {
      navigate(profilePath)
    }
    onNavigate?.()
  }

  const handleDocs = () => {
    window.open(DOCS_URL, '_blank', 'noopener,noreferrer')
    onNavigate?.()
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    clearSessionData()
    window.location.href = '/login'
  }

  // Bascule admin↔membre (D7 story 1.4). Un seul slot : selon le shell courant,
  // on propose l'accès à l'autre espace — conditionnel à hasMemberAccess (shell
  // admin) ou au rôle admin (shell member). hasMemberAccess undefined (localStorage
  // antérieur à 1.4) → traité comme false (lien absent jusqu'au prochain login, D6).
  const switchTarget =
    shell === 'admin' && user?.hasMemberAccess === true
      ? { label: 'Espace membre', icon: CalendarClock, path: '/me' }
      : shell === 'member' && user?.role === 'admin'
        ? { label: 'Console admin', icon: LayoutDashboard, path: '/admin' }
        : null

  const handleSwitch = (path: string) => {
    if (isBlocked) {
      requestNavigation(path)
    } else {
      navigate(path)
    }
    onNavigate?.()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Menu utilisateur"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 leading-tight">
            <span className="truncate font-medium">{name}</span>
            {email && (
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{name}</p>
            {email && (
              <p className="text-xs leading-none text-muted-foreground">{email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {switchTarget && (
          <DropdownMenuItem onClick={() => handleSwitch(switchTarget.path)}>
            <switchTarget.icon className="mr-2 h-4 w-4" />
            <span>{switchTarget.label}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleProfile}>
          <UserRound className="mr-2 h-4 w-4" />
          <span>Profil</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDocs}>
          <BookOpen className="mr-2 h-4 w-4" />
          <span className="flex-1">Documentation</span>
          <ExternalLink className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Déconnexion</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
