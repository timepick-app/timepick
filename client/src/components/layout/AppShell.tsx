import { useState } from 'react'
import type { ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Typography } from '@/components/ui/typography'
import { SidebarContent } from './SidebarContent'
import type { NavEntry } from './SidebarContent'

export interface AppShellProps {
  /**
   * Items de navigation. Optionnel : si absent, `SidebarContent` utilise sa
   * nav par défaut (admin). AppShell lui-même reste neutre (aucune valeur par
   * défaut codée ici) — la neutralité exigée par AC2 porte sur AppShell, pas
   * sur les défauts de SidebarContent (D2).
   */
  items?: NavEntry[]
  /** En-tête sidebar (logo). */
  header?: ReactNode
  /** Pied sidebar (profil + version). */
  footer?: ReactNode
  /** Titre de page rendu dans `<main>` (desktop + mobile h1, exclusifs par breakpoint). */
  pageTitle?: ReactNode
  /** Contenu rendu en tête de `<main>`, au-dessus du titre (ex. bannière
   *  contextuelle de l'appelant). Reste dans la colonne de contenu paddée. */
  contentTop?: ReactNode
  /** Contenu de page. */
  children: ReactNode
  /** Rappel optionnel invoqué après une navigation mobile (en plus de la
   *  fermeture du tiroir, qui est gérée en interne par AppShell). */
  onMobileNavigate?: () => void
  /** Chemin de profil forwardé au `NavUser` du pied `SidebarContent` (D5).
   *  String opaque — AppShell reste neutre vis-à-vis du concept admin/member. */
  profilePath?: string
  /** Shell forwardé au `NavUser` du pied `SidebarContent` (D7 story 1.4).
   *  Opaque — AppShell ne fait que le passer. Défaut undefined → NavUser 'admin'. */
  shell?: 'admin' | 'member'
}

/**
 * AppShell — chrome de l'application (sidebar desktop + tiroir mobile + titre).
 *
 * Composant neutre : aucune référence à un concept admin (ni `/admin`, ni
 * libellé admin, ni `getPageTitle`). La nav, l'en-tête et le pied sont fournis
 * par l'appelant (par ex. `AdminLayout` passe les items admin). `SidebarContent`
 * est rendu deux fois : dans le tiroir mobile (avec fermeture sur navigation) et
 * dans l'aside desktop (sans rappel).
 */
export function AppShell({ items, header, footer, pageTitle, contentTop, children, onMobileNavigate, profilePath, shell }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleMobileNavigate = () => {
    setMobileMenuOpen(false)
    onMobileNavigate?.()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-50 bg-background flex items-center gap-3 p-4 border-b">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ouvrir le menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
            <SidebarContent
              items={items}
              header={header}
              footer={footer}
              onNavigate={handleMobileNavigate}
              profilePath={profilePath}
              shell={shell}
            />
          </SheetContent>
        </Sheet>
        <span className="font-semibold text-lg">TimePick</span>
      </header>

      <div className="lg:grid lg:grid-cols-[240px_1fr]">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:h-screen lg:sticky lg:top-0 border-r bg-card">
          <SidebarContent items={items} header={header} footer={footer} onNavigate={undefined} profilePath={profilePath} shell={shell} />
        </aside>

        {/* Main Content */}
        <main className="p-4 lg:p-6 min-w-0">
          {contentTop}
          {/* Desktop Header */}
          {pageTitle && (
            <header className="hidden lg:flex items-center justify-between mb-6">
              <Typography variant="h1">{pageTitle}</Typography>
            </header>
          )}

          {/* Titre mobile : <h1> réel, exclusif du <h1> desktop par breakpoint
              (lg:hidden vs hidden lg:flex) — un seul h1 visible par viewport (a11y). */}
          {pageTitle && (
            <Typography variant="h1" className="lg:hidden mb-4">{pageTitle}</Typography>
          )}

          {children}
        </main>
      </div>
    </div>
  )
}
