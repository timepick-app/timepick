import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

export const __buttonVariantKeys = [
  'default',
  'destructive',
  'outline',
  'outline-destructive',
  'outline-info',
  'outline-warning',
  'outline-success',
  'secondary',
  'ghost',
  'link',
] as const

export const __buttonSizeKeys = [
  'default',
  'sm',
  'lg',
  'icon',
  'icon-sm',
] as const

type ButtonVariantKey = typeof __buttonVariantKeys[number]
type ButtonSizeKey = typeof __buttonSizeKeys[number]

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        "outline-destructive":
          "border border-red-300 bg-transparent text-red-600 shadow-sm hover:bg-red-50 hover:text-red-700",
        "outline-info":
          "border border-blue-300 bg-transparent text-blue-700 shadow-sm hover:bg-blue-100 hover:text-blue-900",
        "outline-warning":
          "border border-amber-300 bg-transparent text-amber-700 shadow-sm hover:bg-amber-100 hover:text-amber-900",
        "outline-success":
          "border border-green-300 bg-transparent text-green-700 shadow-sm hover:bg-green-100 hover:text-green-900",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      } satisfies Record<ButtonVariantKey, string>,
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 gap-1.5 rounded-md px-3",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      } satisfies Record<ButtonSizeKey, string>,
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
