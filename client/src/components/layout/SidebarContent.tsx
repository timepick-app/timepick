import { useState } from 'react'
import type { ReactNode } from 'react'
import { LayoutDashboard, CalendarDays, Users, Settings, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useNavigationBlocker } from '@/contexts/NavigationBlockerContext'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { NavUser } from './NavUser'

// --- Types partagés (D5 : le renderer possède la forme des items) -------------

interface NavSubItem {
  id: string
  label: string
  /** href COMPLET, ex: '/admin/settings?tab=email'. */
  href: string
}

export interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** Sous-menu repliable (rendu générique). */
  children?: NavSubItem[]
  /** true = match exact pathname (ex. racines /me, /admin). */
  exact?: boolean
}

/** Lien feuille d'une section membre (pas d'icône, match exact pathname). */
export interface NavLinkItem {
  id: string
  label: string
  href: string
}

/**
 * Section de navigation membre (branche de rendu séparée des `NavItem`, D2).
 * - `collapsible: false` → en-tête statique non-cliquable, liens toujours
 *   visibles (ex. « À venir »).
 * - `collapsible: true`  → en-tête-bouton repliable (ex. « Passés »).
 *
 * Contournement propre de la trouvaille DEFERRED de la story 1-1 (généraliser
 * `isOnSettings`) : member et admin n'empruntent pas la même branche de rendu,
 * donc la logique admin `children`/`isOnSettings` reste intacte.
 */
export interface NavSection {
  id: string
  label: string
  collapsible: boolean
  defaultOpen?: boolean
  links: NavLinkItem[]
}

/** Entrée acceptée par `items` : item (admin/member plat) ou section membre. */
export type NavEntry = NavItem | NavSection

// --- Items admin par défaut (D2 : SidebarContent shippe la nav admin) ---------

const adminSettingsSubItems: NavSubItem[] = [
  { id: 'nav-settings-email', label: "Serveur d'email", href: '/admin/settings?tab=email' },
  { id: 'nav-settings-template', label: "Modèle d'email", href: '/admin/settings?tab=email-template' },
  { id: 'nav-settings-calendar', label: 'Calendrier', href: '/admin/settings?tab=calendar' },
  { id: 'nav-settings-auth', label: 'Authentification', href: '/admin/settings?tab=auth' },
]

const adminItems: NavItem[] = [
  { id: 'nav-dashboard', icon: LayoutDashboard, label: 'Tableau de bord', href: '/admin', exact: true },
  { id: 'nav-events', icon: CalendarDays, label: 'Événements', href: '/admin/events' },
  { id: 'nav-users', icon: Users, label: 'Membres', href: '/admin/users' },
  {
    id: 'nav-settings',
    icon: Settings,
    label: 'Paramètres',
    href: '/admin/settings',
    children: adminSettingsSubItems,
  },
]

interface SidebarContentProps {
  /** Appelé après une navigation (ferme le tiroir mobile). */
  onNavigate?: () => void
  /** Items de navigation (défaut = nav admin actuelle, D2). Accepte les
   *  sections membre `NavSection` en plus des `NavItem` (D2). */
  items?: NavEntry[]
  /** En-tête sidebar (défaut = logo TimePick + sous-titre « Administration »). */
  header?: ReactNode
  /** Pied sidebar (défaut = NavUser + version). */
  footer?: ReactNode
  /** Chemin de profil passé au `NavUser` du pied par défaut (D5). Defaut admin
   *  '/admin/profile' — préserve NavUser.test.tsx. MemberLayout passe '/me/profile'. */
  profilePath?: string
  /** Shell forwardé au `NavUser` du pied (D7 story 1.4). Défaut undefined. */
  shell?: 'admin' | 'member'
}

export function SidebarContent({ onNavigate, items = adminItems, header, footer, profilePath, shell }: SidebarContentProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    isBlocked,
    showConfirmDialog,
    pendingPath,
    confirmAndLeave,
    cancelAndStay,
    requestNavigation,
  } = useNavigationBlocker()

  const isOnSettings = location.pathname.startsWith('/admin/settings')
  const [openItems, setOpenItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    if (isOnSettings) initial['nav-settings'] = true
    return initial
  })
  const [prevIsOnSettings, setPrevIsOnSettings] = useState(isOnSettings)

  // Ouvrir le sous-menu Paramètres à l'entrée dans la section, calculé pendant le
  // rendu pour poser la valeur du premier coup (évite le double-rendu d'un effet).
  // Le repli manuel persiste tant qu'on ne ré-entre pas dans la section.
  if (isOnSettings !== prevIsOnSettings) {
    setPrevIsOnSettings(isOnSettings)
    if (isOnSettings) setOpenItems((o) => ({ ...o, 'nav-settings': true }))
  }

  const isSubActive = (childHref: string) => {
    if (!isOnSettings) return false
    const childTab = new URLSearchParams(childHref.split('?')[1] ?? '').get('tab')
    if (!childTab) return true
    const currentTab = new URLSearchParams(location.search).get('tab') ?? 'email'
    return currentTab === childTab
  }

  const handleNavClick = (href: string, e: React.MouseEvent) => {
    if (isBlocked) {
      e.preventDefault()
      requestNavigation(href)
      return
    }
    onNavigate?.()
  }

  const handleConfirmLeave = async () => {
    const path = pendingPath
    await confirmAndLeave()
    if (path) {
      navigate(path)
    }
    onNavigate?.()
  }

  // Match actif générique (D6) : exact → pathname === href, sinon startsWith.
  // Supprime le special-case codé dur `/admin` (désormais porté par `exact` sur
  // l'item dashboard). Behavior-preserving pour la nav admin.
  const isActive = (item: NavItem) =>
    item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href)

  // Liens feuille d'une section membre (match exact pathname, D8). Indentation
  // miroir des sous-items admin (border-l) pour cohérence visuelle.
  const renderSectionLinks = (links: NavLinkItem[], regionId?: string) => (
    <div id={regionId} className="mt-1 ml-2 pl-4 border-l border-border space-y-1">
      {links.map((link) => {
        const linkActive = location.pathname === link.href
        return (
          <NavLink
            key={link.id}
            to={link.href}
            onClick={(e) => handleNavClick(link.href, e)}
            className={cn(
              'flex items-center h-8 px-2 rounded-md text-sm transition-colors',
              linkActive
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-foreground/70 hover:bg-accent hover:text-accent-foreground',
            )}
            aria-current={linkActive ? 'page' : undefined}
          >
            {link.label}
          </NavLink>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* En-tête (logo) */}
      {header ?? (
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold">TimePick</h1>
          <p className="text-sm text-muted-foreground">Administration</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1" aria-label="Navigation principale">
        {items.map((entry) => {
          // --- Branche NavSection (sections membre, D2) ----------------------
          // Type guard : NavSection possède `links`, NavItem non (NavItem.children
          // est un champ distinct). Indépendante de la logique admin ci-dessous.
          if ('links' in entry) {
            // Non-repliable (ex. « À venir ») : en-tête statique non-cliquable,
            // liens toujours visibles (UX-DR1).
            if (!entry.collapsible) {
              return (
                <div key={entry.id}>
                  <p className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase">
                    {entry.label}
                  </p>
                  {renderSectionLinks(entry.links)}
                </div>
              )
            }
            // Repliable (ex. « Passés ») : en-tête-bouton + ChevronDown rotate,
            // repli via l'idiome openItems existant (D3 — pas de shadcn Collapsible).
            const open = openItems[entry.id] ?? entry.defaultOpen ?? false
            return (
              <div key={entry.id}>
                <button
                  onClick={() => setOpenItems((o) => ({ ...o, [entry.id]: !(o[entry.id] ?? entry.defaultOpen ?? false) }))}
                  className="w-full flex items-center gap-1 px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase transition-colors hover:text-foreground"
                  aria-expanded={open}
                  aria-controls={`${entry.id}-region`}
                >
                  <span className="flex-1 text-left">{entry.label}</span>
                  <ChevronDown
                    className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
                  />
                </button>
                {open && renderSectionLinks(entry.links, `${entry.id}-region`)}
              </div>
            )
          }

          // --- Branche NavItem (admin flat + children) — INTACTE (D2) ---------
          const item = entry
          const active = isActive(item)
          const Icon = item.icon
          if (item.children) {
            const open = openItems[item.id] ?? false
            return (
              <div key={item.id}>
                <button
                  onClick={() => setOpenItems((o) => ({ ...o, [item.id]: !o[item.id] }))}
                  className={cn(
                    'w-full flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors',
                    'text-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                  aria-expanded={open}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
                  />
                </button>
                {open && (
                  <div className="mt-1 ml-2 pl-4 border-l border-border space-y-1">
                    {item.children.map((sub) => {
                      const subActive = isSubActive(sub.href)
                      return (
                        <NavLink
                          key={sub.id}
                          to={sub.href}
                          onClick={(e) => handleNavClick(sub.href, e)}
                          className={cn(
                            'flex items-center h-8 px-2 rounded-md text-sm transition-colors',
                            subActive
                              ? 'bg-accent text-accent-foreground font-medium'
                              : 'text-foreground/70 hover:bg-accent hover:text-accent-foreground',
                          )}
                          aria-current={subActive ? 'page' : undefined}
                        >
                          {sub.label}
                        </NavLink>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }
          return (
            <NavLink
              key={item.id}
              to={item.href}
              onClick={(e) => handleNavClick(item.href, e)}
              className={cn(
                'flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Pied — carte profil (NavUser) + version discrète */}
      {footer ?? (
        <div className="p-2 border-t space-y-1">
          <NavUser onNavigate={onNavigate} profilePath={profilePath} shell={shell} />
          <p className="px-2 text-[10px] text-muted-foreground">Version {__APP_VERSION__}</p>
        </div>
      )}

      {/* Navigation Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={(open) => !open && cancelAndStay()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifications non sauvegardées</DialogTitle>
            <DialogDescription>
              Vous avez des modifications non sauvegardées. Voulez-vous vraiment quitter sans sauvegarder ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelAndStay}>
              Rester
            </Button>
            <Button variant="outline-destructive" onClick={handleConfirmLeave}>
              Annuler et quitter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
