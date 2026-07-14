import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'draft' | 'info' | 'destructive'
export type BadgeSize = 'sm' | 'md'
export type BadgeAppearance = 'solid' | 'soft'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  appearance?: BadgeAppearance
  icon?: ReactNode
  children: ReactNode
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  draft: 'bg-orange-100 text-orange-800',
  info: 'bg-blue-100 text-blue-800',
  destructive: 'bg-red-50 text-red-700 border border-red-200'
}

/**
 * Ton « soft » : fond clair + bordure. Palette alignée sur le composant Banner
 * (amber pour warning, et non yellow), pour les chips de statut peu intrusifs
 * (ex. StatusBanner : ouverture des inscriptions, créneaux complets…).
 */
const softVariantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-50 text-gray-700 border border-gray-200',
  success: 'bg-green-50 text-green-700 border border-green-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  error: 'bg-red-50 text-red-700 border border-red-200',
  draft: 'bg-orange-50 text-orange-700 border border-orange-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
  destructive: 'bg-red-50 text-red-700 border border-red-200'
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-sm'
}

export const __badgeVariantKeys = Object.keys(variantStyles) as BadgeVariant[]
export const __badgeSizeKeys = Object.keys(sizeStyles) as BadgeSize[]
export const __badgeAppearanceKeys: BadgeAppearance[] = ['solid', 'soft']

/**
 * Badge component for status indicators
 * Used for slot availability status in calendar
 */
export const Badge = ({
  variant = 'default',
  size = 'sm',
  appearance = 'solid',
  icon,
  children,
  className,
  ...rest
}: BadgeProps) => {
  const styles = appearance === 'soft' ? softVariantStyles : variantStyles
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        icon && 'gap-1.5',
        styles[variant],
        sizeStyles[size],
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  )
}
