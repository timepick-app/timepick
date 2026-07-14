import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { clearSessionData } from '@/hooks/useSessionTimeout'
import { getInitials } from '@/lib/getInitials'
import { formatFullName } from '@/lib/formatFullName'

interface StoredUser {
  firstName: string
  lastName: string | null
  email: string
}

/** Lit l'utilisateur courant depuis localStorage (valeurs par défaut si absent/invalide). */
function readStoredUser(): StoredUser {
  const stored = localStorage.getItem('auth_user')
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<StoredUser>
      return {
        firstName: parsed.firstName ?? '',
        lastName: parsed.lastName ?? null,
        email: parsed.email ?? '',
      }
    } catch {
      // Valeurs par défaut conservées en cas de JSON invalide
    }
  }
  return { firstName: '', lastName: null, email: '' }
}

/**
 * User menu dropdown for public-facing pages
 *
 * Simplified version of UserMenu.tsx without admin navigation.
 * Displays user avatar with initials and a dropdown with logout option.
 *
 * Features:
 * - Avatar with user initials (max 2 characters)
 * - Dropdown showing full name and email
 * - Logout action that clears session and redirects to /login
 *
 * @returns {JSX.Element} The user menu dropdown component
 *
 * @see Story 20-5 - Navigation Ajoutée
 * @see UserMenu - Admin version with same pattern
 */
export function PublicUserMenu() {
  // Lecture unique au montage (init paresseux) : valeur posée dès le premier rendu,
  // sans setState dans un effet (évite le double-rendu, react-hooks/set-state-in-effect).
  const [{ firstName, lastName, email }] = useState(() => readStoredUser())

  const handleLogout = () => {
    // Clear storage keys (consistent with AdminLayout)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    clearSessionData()
    // Redirect to login page
    window.location.href = '/login'
  }

  const displayName =
    formatFullName(firstName, lastName) || email.split('@')[0] || 'Utilisateur'
  const initials = getInitials(firstName || displayName, lastName)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="Menu utilisateur">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            {email && (
              <p className="text-xs leading-none text-muted-foreground">
                {email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Déconnexion</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
