import { cn } from "@/lib/utils"

export interface FilterPillOption<T extends string> {
  value: T
  label: string
  count?: number
  disabled?: boolean
}

interface FilterPillsProps<T extends string> {
  options: FilterPillOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  className,
}: FilterPillsProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            disabled={option.disabled}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full transition-colors",
              isActive
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
              option.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {option.count !== undefined
              ? `${option.label} (${option.count})`
              : option.label}
          </button>
        )
      })}
    </div>
  )
}
