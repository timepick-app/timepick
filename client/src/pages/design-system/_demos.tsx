import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useCompactMode } from "@/hooks/useCompactMode"
import { Typography } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DatePicker } from "@/components/ui/date-picker"
import { TimePicker } from "@/components/ui/time-picker"
import { DateTimePicker } from "@/components/ui/date-time-picker"
import { Slider } from "@/components/ui/slider"
import { ChevronDown, Download, Plus, Search, Pencil, Eye, Trash2, Calendar, GripVertical, Info, Clock, List, Settings, User, Mail, BarChart3, ChevronsUpDown, Check, MoreHorizontal, HelpCircle, Circle, Timer, CheckCircle2, CircleOff, ArrowDown, ArrowRight, ArrowUp } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, DataTableColumnHeader, DataTableBulkActions } from "@/components/ui/data-table"

const MEMBERS_MOCK = [
  { email: "baptiste.david@example.com", name: "Baptiste David", date: "12/06/2026" },
  { email: "ariel.adam@example.com", name: "Ariel Adam", date: "12/06/2026" },
  { email: "adeline.aubert@example.com", name: "Adeline Aubert", date: "12/06/2026" },
] as const

// Champ <select> natif stylé — pattern DISTINCT du Select Radix (cf. select.meta,
// documenté en anti-pattern nuancé). Bouton outline + appearance-none + chevron.
export function NativeSelectDemo() {
  return (
    <div className="relative w-max">
      <select
        defaultValue="inter"
        aria-label="Police"
        className="h-9 w-[200px] appearance-none rounded-md border border-input bg-background px-4 py-2 text-field font-normal capitalize shadow-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-offset-0"
      >
        <option value="inter">Inter</option>
        <option value="manrope">Manrope</option>
        <option value="system">System</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-2.5 size-4 opacity-50" />
    </div>
  )
}

// Densité « en situation » : actions primaires en en-tête de page (h-9, hors
// table) + toolbar de data-table compacte (h-8) + table dense (px-3 py-2,
// en-têtes text-xs). Illustre le contraste des deux tiers de la charte sizing.
export function MembersMockDemo() {
  const [role, setRole] = useState("all")
  const headers = ["Email", "Nom", "Rôle", "Réservations", "Inscrit le", "Actions"]
  return (
    <div className="space-y-4">
      {/* En-tête de page : actions primaires hors de la data-table (h-9). */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">20 membre(s) sur 43</p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline">
            <Download />
            Export CSV
          </Button>
          <Button>
            <Plus />
            Nouveau membre
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {/* Toolbar de data-table : utilitaires compacts (h-8) uniquement. */}
        <div className="border-b p-3">
          <div className="flex gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input size="sm" className="pl-9" placeholder="Rechercher par email ou nom..." />
            </div>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger size="sm" className="w-44" aria-label="Filtrer par rôle">
                <SelectValue placeholder="Tous les rôles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                <SelectItem value="member">Membre</SelectItem>
                <SelectItem value="admin">Administrateur</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            {headers.map((h) => (
              <th
                key={h}
                className={cn(
                  "px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                  h === "Actions" && "text-right"
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MEMBERS_MOCK.map((m) => (
            <tr key={m.email} className="border-b last:border-0">
              <td className="px-3 py-2 text-sm">{m.email}</td>
              <td className="px-3 py-2 text-sm">{m.name}</td>
              <td className="px-3 py-2">
                <Badge variant="success" size="sm">Membre</Badge>
              </td>
              <td className="px-3 py-2 text-sm">0</td>
              <td className="px-3 py-2 text-sm">{m.date}</td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Modifier">
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Voir">
                    <Eye />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label="Supprimer"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  )
}

export function PopoverDemo() {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">Ouvrir le popover</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-2">
        <Typography variant="h6">Filtres rapides</Typography>
        <Typography variant="body-sm" color="muted">
          Surface flottante non-modale, ancrée au déclencheur — menus contextuels, combobox, sélecteurs.
        </Typography>
      </PopoverContent>
    </Popover>
  )
}

export function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Ouvrir le panneau</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Détails du créneau</SheetTitle>
          <SheetDescription>
            Panneau coulissant modal ancré à un bord — navigation mobile, drawers, formulaires secondaires.
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}

export function TooltipDemo() {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-8 flex-wrap">
        {/* Info-tooltip : icône à côté d'un label */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">Fréquence de mise à jour</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Plus d'informations"
                className="inline-flex text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Les modifications prennent effet immédiatement pour tous les membres connectés au calendrier public.
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Overflow-tooltip : texte tronqué */}
        <div className="w-32">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block truncate text-sm cursor-default">
                Nom d'événement très long qui déborde
              </span>
            </TooltipTrigger>
            <TooltipContent>Nom d'événement très long qui déborde</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}

// Slider : désormais la primitive réelle @/components/ui/slider (ex-prototype inline).
export function SliderDemo({ defaultValue = 60 }: { defaultValue?: number }) {
  const [v, setV] = useState(defaultValue)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Capacité maximale</Label>
        <span className="text-sm tabular-nums text-muted-foreground">{v}</span>
      </div>
      <Slider value={v} onValueChange={setV} min={0} max={100} aria-label="Capacité maximale" />
    </div>
  )
}

// DatePicker / TimePicker / DateTimePicker — vraies primitives ui/ (react-day-picker).
// L'état reste des valeurs natives (Date | null, "HH:mm") ; la conversion ISO se fait
// à la frontière API via @/lib/datetime dans les vraies features.
export function DatePickerDemo() {
  const [date, setDate] = useState<Date | null>(null)
  const [time, setTime] = useState("")
  const [dateTime, setDateTime] = useState<Date | null>(null)
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="ds-date-picker">Date d'ouverture</Label>
        <DatePicker
          id="ds-date-picker"
          aria-label="Date d'ouverture"
          value={date}
          onChange={setDate}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ds-time-picker">Heure de début</Label>
        <TimePicker
          id="ds-time-picker"
          aria-label="Heure de début"
          value={time}
          onChange={setTime}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="ds-datetime-picker">Date et heure du créneau</Label>
        <DateTimePicker
          id="ds-datetime-picker"
          aria-label="Date et heure du créneau"
          value={dateTime}
          onChange={setDateTime}
        />
      </div>
    </div>
  )
}

const responsiveToggleModes = [
  { value: 'calendar', label: 'Mois', Icon: Calendar },
  { value: 'week', label: 'Semaine', Icon: Clock },
  { value: 'list', label: 'Liste', Icon: List },
] as const

export function ResponsiveToggleGroupDemo() {
  const [value, setValue] = useState('calendar')
  const { ref, compact } = useCompactMode<HTMLDivElement>({
    contentSelector: '[data-measure]',
  })

  return (
    <div className="relative border border-dashed border-gray-300 rounded-lg p-4 overflow-hidden resize-x min-w-[180px] max-w-full" style={{ width: '100%' }}>
      <div className="absolute top-2 right-2 text-gray-400">
        <GripVertical className="h-4 w-4" />
      </div>
      <div ref={ref} className="overflow-hidden [contain:inline-size]">
        <ToggleGroup
          type="single"
          value={value}
          onValueChange={(v) => { if (v) setValue(v) }}
          size="sm"
          className="inline-flex rounded-md border border-gray-200 p-1 flex-nowrap"
          aria-label="Mode d'affichage"
          data-measure
        >
          {responsiveToggleModes.map(({ value: v, label, Icon }) => (
            <ToggleGroupItem
              key={v}
              value={v}
              aria-label={`Vue ${label}`}
              className={
                compact
                  ? 'flex-col gap-0.5 px-2 py-1'
                  : 'gap-1.5 px-3 shrink-0'
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={compact ? 'text-[10px] leading-tight' : 'text-sm'}>
                {label}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}

const responsiveTabs = [
  { value: 'details', label: 'Détails', Icon: Settings },
  { value: 'slots', label: 'Créneaux', Icon: Calendar },
  { value: 'users', label: 'Membres', Icon: User },
  { value: 'emails', label: 'Emails', Icon: Mail },
  { value: 'stats', label: 'Statistiques', Icon: BarChart3 },
] as const

export function ResponsiveTabsDemo() {
  const [activeTab, setActiveTab] = useState('details')
  const { ref, compact } = useCompactMode<HTMLDivElement>({
    contentSelector: '[data-measure]',
  })

  return (
    <div className="relative border border-dashed border-gray-300 rounded-lg p-4 overflow-hidden resize-x min-w-[180px] max-w-full" style={{ width: '100%' }}>
      <div className="absolute top-2 right-2 text-gray-400">
        <GripVertical className="h-4 w-4" />
      </div>
      <div ref={ref} className="overflow-hidden [contain:inline-size]">
        {compact && (
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {responsiveTabs.map(({ value, label, Icon }) => (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className={compact ? 'hidden' : ''}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList data-measure className="flex-nowrap">
              {responsiveTabs.map(({ value, label, Icon }) => (
                <TabsTrigger key={value} value={value} className="gap-1.5 shrink-0">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

const COMBO_OPTIONS = [
  { value: "fete-ecole", label: "Fête de l'école 2026" },
  { value: "kermesse", label: "Kermesse de printemps" },
  { value: "spectacle", label: "Spectacle de fin d'année" },
  { value: "reunion", label: "Réunion parents-profs" },
  { value: "sortie", label: "Sortie pédagogique" },
]

// Combobox shadcn-admin : trigger type Select + Popover avec recherche + liste.
export function DeferredComboboxDemo() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [query, setQuery] = useState("")
  const selected = COMBO_OPTIONS.find((o) => o.value === value)
  const filtered = COMBO_OPTIONS.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div className="space-y-1.5">
      <Label>Événement</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm outline-none",
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-offset-0",
              !selected && "text-muted-foreground"
            )}
          >
            {selected ? selected.label : "Sélectionner un événement…"}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="h-8 w-full rounded-sm bg-transparent pl-8 text-field outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-auto p-1">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { setValue(o.value); setQuery(""); setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Check className={cn("h-4 w-4 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                {o.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ── DataTable (#68) ─────────────────────────────────────────────────────────
// Démo de référence (modèle shadcn-admin « Tasks ») : sélection multiple,
// filtres à facettes (Statut / Priorité), tri, visibilité des colonnes,
// pagination et barre d'actions groupées. Données locales pour rendre la
// suppression visible. Consts non exportées (react-refresh).
type DemoTask = {
  id: string
  code: string
  title: string
  label: string
  status: string
  priority: string
}

const DEMO_STATUSES = [
  { value: "backlog", label: "Backlog", icon: HelpCircle },
  { value: "todo", label: "À faire", icon: Circle },
  { value: "in_progress", label: "En cours", icon: Timer },
  { value: "done", label: "Terminé", icon: CheckCircle2 },
  { value: "canceled", label: "Annulé", icon: CircleOff },
] as const

const DEMO_PRIORITIES = [
  { value: "low", label: "Basse", icon: ArrowDown },
  { value: "medium", label: "Moyenne", icon: ArrowRight },
  { value: "high", label: "Haute", icon: ArrowUp },
] as const

const TASKS_MOCK: DemoTask[] = [
  { id: "1", code: "TASK-8782", title: "Corriger la file d'attente SMTP intermittente", label: "Bug", status: "in_progress", priority: "high" },
  { id: "2", code: "TASK-7878", title: "Documenter le flux d'invitation par email", label: "Documentation", status: "backlog", priority: "medium" },
  { id: "3", code: "TASK-7839", title: "Compresser les captures du design system", label: "Feature", status: "todo", priority: "low" },
  { id: "4", code: "TASK-5562", title: "Migrer le tableau Membres vers DataTable", label: "Feature", status: "in_progress", priority: "high" },
  { id: "5", code: "TASK-8686", title: "Auditer les contrastes des badges", label: "Bug", status: "done", priority: "medium" },
  { id: "6", code: "TASK-1280", title: "Ajouter la sélection multiple aux listes admin", label: "Feature", status: "todo", priority: "high" },
  { id: "7", code: "TASK-7262", title: "Nettoyer les modèles d'emails système", label: "Documentation", status: "canceled", priority: "low" },
  { id: "8", code: "TASK-1138", title: "Stabiliser le calendrier multi-jours", label: "Bug", status: "in_progress", priority: "medium" },
  { id: "9", code: "TASK-7184", title: "Densifier les barres d'outils de tableaux", label: "Feature", status: "done", priority: "low" },
  { id: "10", code: "TASK-5160", title: "Revoir la pagination côté serveur", label: "Documentation", status: "backlog", priority: "medium" },
  { id: "11", code: "TASK-3938", title: "Brancher l'export CSV filtré", label: "Feature", status: "todo", priority: "high" },
  { id: "12", code: "TASK-4314", title: "Corriger l'indicateur d'heure responsive", label: "Bug", status: "in_progress", priority: "medium" },
]

export function DataTableDemo() {
  const [data, setData] = useState<DemoTask[]>(TASKS_MOCK)

  const columns = useMemo<ColumnDef<DemoTask>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Tout sélectionner"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Sélectionner la ligne"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "code",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tâche" />,
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
        meta: { label: "Tâche" },
        enableHiding: false,
      },
      {
        accessorKey: "title",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Titre" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant="info" size="sm">{row.original.label}</Badge>
            <span className="max-w-[320px] truncate">{row.original.title}</span>
          </div>
        ),
        meta: { label: "Titre", className: "max-w-[420px]" },
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Statut" />,
        cell: ({ row }) => {
          const status = DEMO_STATUSES.find((s) => s.value === row.original.status)
          if (!status) return null
          return (
            <div className="flex items-center gap-2">
              <status.icon className="h-4 w-4 text-muted-foreground" />
              <span>{status.label}</span>
            </div>
          )
        },
        filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
        meta: { label: "Statut" },
      },
      {
        accessorKey: "priority",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Priorité" />,
        cell: ({ row }) => {
          const priority = DEMO_PRIORITIES.find((p) => p.value === row.original.priority)
          if (!priority) return null
          return (
            <div className="flex items-center gap-2">
              <priority.icon className="h-4 w-4 text-muted-foreground" />
              <span>{priority.label}</span>
            </div>
          )
        },
        filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
        meta: { label: "Priorité" },
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toast.message(`Édition de ${row.original.code}`)}>
                  Modifier
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setData((prev) => prev.filter((t) => t.id !== row.original.id))
                    toast.success(`${row.original.code} supprimée`)
                  }}
                >
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        meta: { className: "w-12 text-right" },
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(task) => task.id}
      searchColumnId="title"
      searchPlaceholder="Filtrer par titre…"
      facetedFilters={[
        { columnId: "status", title: "Statut", options: [...DEMO_STATUSES] },
        { columnId: "priority", title: "Priorité", options: [...DEMO_PRIORITIES] },
      ]}
      initialState={{ pagination: { pageSize: 5 } }}
      emptyMessage="Aucune tâche."
      pageSizeOptions={[5, 10, 20]}
      renderBulkActions={(table) => (
        <DataTableBulkActions table={table} entityName="tâche(s)">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              const ids = new Set(
                table.getFilteredSelectedRowModel().rows.map((r) => r.original.id)
              )
              setData((prev) => prev.filter((t) => !ids.has(t.id)))
              table.resetRowSelection()
              toast.success(`${ids.size} tâche(s) supprimée(s)`)
            }}
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </Button>
        </DataTableBulkActions>
      )}
    />
  )
}
