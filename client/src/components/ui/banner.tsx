import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Banner — bannière contextuelle inline normalisée du design system.
 *
 * Socle repris de l'`Alert` shadcn « new-york v4 » (grille compacte, icône en
 * colonne de grille plutôt qu'en position absolue), AUGMENTÉ des variants
 * sémantiques propres à TimePick (`info`/`warning`/`success`) absents du stock
 * shadcn, et d'un axe de densité (`default` / `compact`).
 *
 * Plus compact que l'ancien `Alert` v0 (`p-4`, titre 16px) : densité `default`
 * = `py-3` + 14px, densité `compact` = `py-2` + 12px.
 *
 * Divergence assumée vs shadcn : pas de `line-clamp-1` sur le titre — certaines
 * bannières TimePick portent une phrase complète comme titre.
 *
 * Composition : `<Banner>` + `<svg>` optionnel (1er enfant) + `<BannerTitle>`
 * et/ou `<BannerDescription>`.
 */
const bannerVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-center gap-y-0.5 rounded-lg border has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950 dark:text-blue-200 [&>svg]:text-blue-600",
        warning:
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950 dark:text-amber-200 [&>svg]:text-amber-600",
        success:
          "border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-950 dark:text-green-200 [&>svg]:text-green-600",
        destructive:
          "border-destructive/50 bg-background text-destructive dark:border-destructive [&>svg]:text-destructive",
      },
      density: {
        default: "px-4 py-3 text-sm",
        compact: "px-3 py-2 text-xs has-[>svg]:gap-x-2",
      },
    },
    defaultVariants: { variant: "default", density: "default" },
  },
)

export interface BannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bannerVariants> {
  /** `alert` (assertif, défaut — erreurs) ou `status` (poli — info/feedback). */
  role?: "alert" | "status"
}

const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  ({ className, variant, density, role = "alert", ...props }, ref) => (
    <div
      ref={ref}
      role={role}
      className={cn(bannerVariants({ variant, density }), className)}
      {...props}
    />
  ),
)
Banner.displayName = "Banner"

const BannerTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("col-start-2 min-h-4 font-medium tracking-tight", className)}
    {...props}
  />
))
BannerTitle.displayName = "BannerTitle"

const BannerDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("col-start-2 [&_p]:leading-relaxed", className)} {...props} />
))
BannerDescription.displayName = "BannerDescription"

export { Banner, BannerTitle, BannerDescription, bannerVariants }
