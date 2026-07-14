import { useEffect, useState } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { Menu, Type, FormInput, Layers, MousePointerClick, Activity, FlaskConical, Table, ListChecks, BarChart3 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "foundations", label: "Fondations", icon: Type },
  { to: "forms", label: "Formulaires", icon: FormInput },
  { to: "surfaces", label: "Surfaces & overlays", icon: Layers },
  { to: "navigation", label: "Navigation & actions", icon: MousePointerClick },
  { to: "feedback", label: "Affichage & feedback", icon: Activity },
  { to: "data", label: "Données & tableaux", icon: Table },
  { to: "charts", label: "Graphes & dataviz", icon: BarChart3 },
  { to: "prototypes", label: "Prototypes différés", icon: FlaskConical },
  { to: "list-directions", label: "Vue Liste (directions)", icon: ListChecks },
]

interface DesignSystemSidebarProps {
  onNavigate?: () => void
}

function DesignSystemSidebar({ onNavigate }: DesignSystemSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold">Design System</h1>
        <p className="text-sm text-muted-foreground">Documentation UI</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1" aria-label="Navigation du design system">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Footer — version discrète */}
      <div className="p-2 border-t">
        <p className="px-2 text-[10px] text-muted-foreground">Version {__APP_VERSION__}</p>
      </div>
    </div>
  )
}

export function DesignSystemLayout() {
  const { pathname } = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Scroll-to-top à chaque changement de sous-vue.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

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
            <SheetTitle className="sr-only">Navigation du design system</SheetTitle>
            <DesignSystemSidebar onNavigate={() => setMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <span className="font-semibold text-lg">Design System</span>
      </header>

      <div className="lg:grid lg:grid-cols-[240px_1fr]">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:h-screen lg:sticky lg:top-0 border-r bg-card">
          <DesignSystemSidebar onNavigate={undefined} />
        </aside>

        {/* Main Content */}
        <main className="p-4 lg:p-6 min-w-0">
          <div className="max-w-4xl space-y-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
