import { useState } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { SlotFilters, TimeOfDay, AvailabilityFilter } from '../../hooks/useFilterParams'

/**
 * Props for SlotFiltersPanel component
 * Story 19.7: Filtres Calendrier Public
 * Story 20.1: Mes réservations toggle intégré
 */
export interface SlotFiltersPanelProps {
  /** Current filter state */
  filters: SlotFilters
  /** Callback when filters change */
  onFiltersChange: (filters: SlotFilters) => void
  /** Callback when filters are reset */
  onReset: () => void
  /** Number of slots after filtering */
  filteredCount: number
  /** Total number of slots before filtering */
  totalCount: number
  /** Whether any filters are active */
  hasActiveFilters?: boolean
  /** Number of active filter types */
  activeFilterCount?: number
  /** Additional CSS class names */
  className?: string
  /** Whether to show only user's reservations (Story 20.1) */
  showMyReservations?: boolean
  /** Callback when "my reservations" toggle changes (Story 20.1) */
  onShowMyReservationsChange?: (value: boolean) => void
  /** Number of user's reservations (Story 20.1) */
  myReservationsCount?: number
}

/**
 * Time of day options with labels
 */
const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string; description: string }[] = [
  { value: 'morning', label: 'Matin', description: '6h - 12h' },
  { value: 'afternoon', label: 'Après-midi', description: '12h - 18h' },
  { value: 'evening', label: 'Soir', description: '18h - 24h' },
]

/**
 * Availability options with labels
 */
const AVAILABILITY_OPTIONS: { value: AvailabilityFilter; label: string }[] = [
  { value: 'all', label: 'Tous les créneaux' },
  { value: 'available', label: 'Disponible uniquement' },
  { value: 'partial', label: 'Partiellement réservés' },
]

/**
 * SlotFiltersPanel - Filter panel for public calendar slots
 * Story 19.7: Filtres Calendrier Public
 *
 * Features:
 * - AC1: Accessible from calendar view via dropdown
 * - AC2: Filter by time of day (morning, afternoon, evening)
 * - AC3: Filter by availability (all, available, partial)
 * - AC6: Reset filters button
 * - AC7: Display filtered count vs total
 *
 * @example
 * ```tsx
 * <SlotFiltersPanel
 *   filters={filters}
 *   onFiltersChange={setFilters}
 *   onReset={resetFilters}
 *   filteredCount={5}
 *   totalCount={12}
 *   hasActiveFilters={true}
 *   activeFilterCount={2}
 * />
 * ```
 */
export function SlotFiltersPanel({
  filters,
  onFiltersChange,
  onReset,
  filteredCount,
  totalCount,
  hasActiveFilters = false,
  activeFilterCount = 0,
  className,
  showMyReservations,
  onShowMyReservationsChange,
  myReservationsCount = 0,
}: SlotFiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Handle time of day toggle
  const handleTimeOfDayToggle = (timeOfDay: TimeOfDay, checked: boolean) => {
    const newTimeOfDay = checked
      ? [...filters.timeOfDay, timeOfDay]
      : filters.timeOfDay.filter((t) => t !== timeOfDay)

    onFiltersChange({
      ...filters,
      timeOfDay: newTimeOfDay,
    })
  }

  // Handle availability change
  const handleAvailabilityChange = (availability: string) => {
    onFiltersChange({
      ...filters,
      availability: availability as AvailabilityFilter,
    })
  }

  // AC4: Handle duration filter change
  const handleMinDurationChange = (value: string) => {
    const minDuration = value === '' ? undefined : parseInt(value, 10)
    onFiltersChange({
      ...filters,
      minDuration: isNaN(minDuration ?? 0) ? undefined : minDuration,
    })
  }

  const handleMaxDurationChange = (value: string) => {
    const maxDuration = value === '' ? undefined : parseInt(value, 10)
    onFiltersChange({
      ...filters,
      maxDuration: isNaN(maxDuration ?? 0) ? undefined : maxDuration,
    })
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* AC7: Display filtered count vs total */}
      {hasActiveFilters && (
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="default" size="sm">
            {filteredCount} / {totalCount}
          </Badge>
          <span className="hidden sm:inline">créneaux affichés</span>
        </span>
      )}

      {/* AC1: Filter button with dropdown */}
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-[42px]">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filtres
            {/* Show badge with active filter count */}
            {activeFilterCount > 0 && (
              <Badge variant="success" size="sm" className="ml-1">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72">
          {/* AC2: Time of day filter */}
          <DropdownMenuLabel>Moment de la journée</DropdownMenuLabel>
          {TIME_OF_DAY_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={filters.timeOfDay.includes(option.value)}
              onCheckedChange={(checked) => handleTimeOfDayToggle(option.value, checked)}
              onSelect={(e) => e.preventDefault()}
            >
              <div className="flex flex-col">
                <span>{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </div>
            </DropdownMenuCheckboxItem>
          ))}

          <DropdownMenuSeparator />

          {/* AC3: Availability filter */}
          <DropdownMenuLabel>Disponibilité</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={filters.availability}
            onValueChange={handleAvailabilityChange}
          >
            {AVAILABILITY_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                onSelect={(e) => e.preventDefault()}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          {/* AC4: Duration filter (optional) */}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Durée (minutes)</DropdownMenuLabel>
          <div className="flex items-center gap-2 px-2 pb-2">
            <div className="flex-1">
              <label htmlFor="min-duration" className="sr-only">Durée minimum</label>
              <Input
                id="min-duration"
                type="number"
                placeholder="Min"
                value={filters.minDuration ?? ''}
                onChange={(e) => handleMinDurationChange(e.target.value)}
                className="h-8"
                min={0}
              />
            </div>
            <span className="text-muted-foreground">-</span>
            <div className="flex-1">
              <label htmlFor="max-duration" className="sr-only">Durée maximum</label>
              <Input
                id="max-duration"
                type="number"
                placeholder="Max"
                value={filters.maxDuration ?? ''}
                onChange={(e) => handleMaxDurationChange(e.target.value)}
                className="h-8"
                min={0}
              />
            </div>
          </div>

          {/* Story 20.1: Mes réservations toggle (AC5) */}
          {onShowMyReservationsChange !== undefined && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Mes réservations</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={showMyReservations ?? false}
                onCheckedChange={onShowMyReservationsChange}
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex flex-col">
                  <span>Voir uniquement mes réservations ({myReservationsCount})</span>
                  <span className="text-xs text-muted-foreground">
                    Afficher uniquement les créneaux que j'ai réservés
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* AC6: Reset button outside dropdown (visible when filters active) */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={onReset}
          aria-label="Réinitialiser les filtres"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Effacer les filtres</span>
        </Button>
      )}
    </div>
  )
}
