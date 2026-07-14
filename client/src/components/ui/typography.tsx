/**
 * Typography Component
 * =====================
 *
 * Provides consistent text styling across the application using Tailwind CSS
 * custom font size classes (text-h1, text-body, etc.).
 *
 * ARCHITECTURE OVERVIEW:
 * ----------------------
 * This component uses class-variance-authority (CVA) to generate CSS classes based on
 * three variant props: variant, color, and weight. The classes are applied using the
 * cn() utility which properly handles class merging via tailwind-merge.
 *
 * HOW IT WORKS:
 * 1. `variant` maps to font-size classes (text-h1, text-body, etc.)
 *    - These classes are defined in tailwind.config.js and reference CSS variables
 *    - CSS variables are defined in index.css with clamp() for fluid scaling
 *
 * 2. `color` maps to text-color classes (text-foreground, text-muted-foreground, etc.)
 *    - These use the shadcn/ui color system defined in index.css
 *
 * 3. `weight` maps to font-weight classes (font-normal, font-medium, etc.)
 *    - If not specified, defaults are looked up in defaultWeightMap based on variant
 *
 * CSS VARIABLE USAGE:
 * -------------------
 * The font-size classes reference CSS variables from index.css:
 *   - text-h1 → var(--font-size-h1) → clamp(1.875rem, 1.0714rem + 2.0089vw, 3rem)
 *   - text-body → var(--font-size-body) → 1rem
 *
 * This allows the typography to be:
 *   - Fluid: scales between viewport sizes using clamp()
 *   - Consistent: same values used across Tailwind and the Typography component
 *   - Maintainable: change once in index.css, updates everywhere
 *
 * COMMON PITFALLS TO AVOID:
 * -------------------------
 * 1. DON'T use inline styles for font sizes - use the variant prop
 *    BAD:  <p style={{ fontSize: '24px' }}>Title</p>
 *    GOOD: <Typography variant="h2">Title</Typography>
 *
 * 2. DON'T apply text-* classes directly - they may conflict with text-color
 *    BAD:  <p className="text-h1 text-foreground">Title</p>
 *    GOOD: <Typography variant="h1" color="default">Title</Typography>
 *
 * 3. DON'T forget to update all 5 files when adding new font sizes:
 *    - index.css (CSS variable definition)
 *    - tailwind.config.js (fontSize mapping)
 *    - typography.tsx (typographyVariants, elementMap, defaultWeightMap)
 *    - utils.ts (customTwMerge classGroups.font-size)
 *    - DesignSystem.tsx (documentation - optional)
 *
 * 4. DON'T use wrong clamp() formulas - see index.css for correct calculations
 *    The vw multiplier should typically be between 0.1 and 3 for our viewport range.
 *
 * USAGE EXAMPLES:
 * ---------------
 * // Basic usage
 * <Typography variant="h1">Main Title</Typography>
 * <Typography variant="body">Regular paragraph text</Typography>
 *
 * // With color variant
 * <Typography variant="body" color="muted">Secondary text</Typography>
 * <Typography variant="h3" color="destructive">Error!</Typography>
 *
 * // Override default weight
 * <Typography variant="h1" weight="normal">Lighter heading</Typography>
 *
 * // Render as different HTML element (SEO/accessibility)
 * <Typography variant="h1" as="h2">Looks like h1, semantically h2</Typography>
 *
 * // Combine with custom classes
 * <Typography variant="body" className="mt-4">With margin</Typography>
 *
 * When adding new font sizes, update these files:
 * - index.css (CSS variables)
 * - tailwind.config.js (theme.fontSize)
 * - typography.tsx (this file: typographyVariants, elementMap, defaultWeightMap)
 * - utils.ts (customTwMerge classGroups.font-size)
 * - DesignSystem.tsx (documentation - optional)
 */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import type { JSX } from "react"

import { cn } from "@/lib/utils"

/**
 * Default weight mapping per variant
 * -----------------------------------
 * When a weight prop is not explicitly provided, the component looks up
 * the appropriate default weight based on the variant.
 *
 * Design rationale:
 * - Headings (h1-h2) use bold for strong visual hierarchy
 * - Subheadings (h3-h4) use semibold for slightly less emphasis
 * - Small headings (h5-h6) use medium to avoid overwhelming nearby content
 * - Body text uses normal for optimal readability
 */
const defaultWeightMap: Record<string, "normal" | "medium" | "semibold" | "bold" | "extrabold"> = {
  h1: "bold",
  h2: "semibold",
  h3: "semibold",
  h4: "semibold",
  h5: "medium",
  h6: "medium",
  "body-lg": "normal",
  body: "normal",
  "body-sm": "normal",
  "body-xs": "normal",
}

export const __typographyVariantKeys = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'body-lg', 'body', 'body-sm', 'body-xs',
] as const

export const __typographyColorKeys = ['default', 'muted', 'destructive'] as const

export const __typographyWeightKeys = ['normal', 'medium', 'semibold', 'bold', 'extrabold'] as const

type TypographyVariantKey = typeof __typographyVariantKeys[number]
type TypographyColorKey = typeof __typographyColorKeys[number]
type TypographyWeightKey = typeof __typographyWeightKeys[number]

/**
 * typographyVariants - CVA configuration for the Typography component
 * --------------------------------------------------------------------
 *
 * This uses class-variance-authority (CVA) to generate className strings
 * based on the variant, color, and weight props.
 *
 * IMPORTANT: The variant classes (text-h1, text-body, etc.) are custom
 * font-size classes defined in tailwind.config.js. They reference CSS
 * variables from index.css.
 *
 * When adding a new font size:
 * 1. Add the CSS variable to index.css
 * 2. Add the fontSize mapping to tailwind.config.js
 * 3. Add the variant here (e.g., "new-size": "text-new-size")
 * 4. Add the element mapping to elementMap below
 * 5. Add the default weight to defaultWeightMap above
 * 6. Add the class to customTwMerge in utils.ts
 */
const typographyVariants = cva("", {
  variants: {
    variant: {
      h1: "text-h1",
      h2: "text-h2",
      h3: "text-h3",
      h4: "text-h4",
      h5: "text-h5",
      h6: "text-h6",
      "body-lg": "text-body-lg",
      body: "text-body",
      "body-sm": "text-body-sm",
      "body-xs": "text-body-xs",
    } satisfies Record<TypographyVariantKey, string>,
    color: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      destructive: "text-destructive",
    } satisfies Record<TypographyColorKey, string>,
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
      extrabold: "font-extrabold",
    } satisfies Record<TypographyWeightKey, string>,
  },
  defaultVariants: {
    variant: "body",
    color: "default",
  },
})

/**
 * elementMap - Maps variants to their default HTML elements
 * ----------------------------------------------------------
 *
 * When a variant is used without an explicit `as` prop, this map
 * determines which HTML element to render.
 *
 * Accessibility note: Use the `as` prop when you need to change
 * the semantic element while keeping the visual styling.
 *
 * Example: <Typography variant="h1" as="h2">
 * Renders an <h2> element styled like an h1 (for proper heading hierarchy)
 *
 * When adding a new variant, add its default element here.
 */
const elementMap: Record<string, keyof JSX.IntrinsicElements> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  "body-lg": "p",
  body: "p",
  "body-sm": "p",
  "body-xs": "p",
}

export interface TypographyProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'color'>,
    VariantProps<typeof typographyVariants> {
  as?: keyof JSX.IntrinsicElements
}

const Typography = React.forwardRef<HTMLElement, TypographyProps>(
  ({ className, variant, color, weight, as, ...props }, ref) => {
    const Component = (as || (variant ? elementMap[variant] : "p")) as React.ElementType
    // Use explicit weight prop, or fall back to default for the variant
    const resolvedWeight = weight ?? (variant ? defaultWeightMap[variant] : "normal")
    return (
      <Component
        className={cn(typographyVariants({ variant, color, weight: resolvedWeight, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Typography.displayName = "Typography"

export { Typography, typographyVariants }
