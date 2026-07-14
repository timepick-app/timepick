/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['var(--font-family-sans)'],
  			mono: ['var(--font-family-mono)'],
  		},
  		/*
  		 * ==========================================================================
  		 * TYPOGRAPHY SCALE
  		 * ==========================================================================
  		 *
  		 * We use CSS variables for font sizes to enable fluid typography with clamp().
  		 * This allows text to scale smoothly between viewport sizes (640px to 1536px).
  		 *
  		 * ARRAY FORMAT EXPLAINED:
  		 * -----------------------
  		 * Each fontSize entry uses the array format: [size, { lineHeight, letterSpacing }]
  		 *
  		 * - size: The font-size value (we use CSS variables like var(--font-size-h1))
  		 * - lineHeight: Optional line-height for this size
  		 * - letterSpacing: Optional letter-spacing for this size
  		 *
  		 * Example:
  		 *   'h1': ['var(--font-size-h1)', { lineHeight: 'var(--line-height-tight)', letterSpacing: 'var(--letter-spacing-tight)' }]
  		 *
  		 * This generates:
  		 *   .text-h1 { font-size: var(--font-size-h1); line-height: var(--line-height-tight); letter-spacing: var(--letter-spacing-tight); }
  		 *
  		 * WHY CSS VARIABLES?
  		 * ------------------
  		 * 1. Fluid scaling: CSS variables in index.css use clamp() for responsive sizing
  		 * 2. Single source of truth: Values defined once in index.css, referenced everywhere
  		 * 3. Easy maintenance: Change a value in index.css, all uses update automatically
  		 * 4. Theme support: Variables can be overridden for different themes
  		 *
  		 * THE 5-FILE UPDATE RULE:
  		 * -----------------------
  		 * When adding a new font size, you MUST update ALL 5 files:
  		 *
  		 * 1. index.css - Define the CSS variable with clamp() formula
  		 *    Example: --font-size-new: clamp(1rem, 0.9rem + 0.2vw, 1.25rem);
  		 *
  		 * 2. tailwind.config.js (THIS FILE) - Add the fontSize mapping
  		 *    Example: 'new-size': ['var(--font-size-new)', { lineHeight: 'var(--line-height-normal)' }]
  		 *
  		 * 3. typography.tsx - Add to typographyVariants, elementMap, and defaultWeightMap
  		 *    Example: variant: { "new-size": "text-new-size" }
  		 *
  		 * 4. utils.ts - Add to customTwMerge classGroups.font-size
  		 *    Example: 'text-new-size' in the font-size array
  		 *    WHY? Without this, tailwind-merge will treat text-new-size as conflicting
  		 *    with text-foreground, text-muted-foreground, etc. and may remove it!
  		 *
  		 * 5. DesignSystem.tsx - Update documentation (optional but recommended)
  		 *
  		 * COMMON PITFALL:
  		 * ---------------
  		 * Forgetting to update utils.ts causes the font-size class to conflict with
  		 * text-color classes. For example, text-h1 + text-foreground would result
  		 * in only text-foreground being applied because tailwind-merge doesn't know
  		 * that text-h1 is a font-size class, not a text-color class.
  		 *
  		 * See index.css for the actual clamp() formulas and their mathematical derivation.
  		 * ==========================================================================
  		 */
  		fontSize: {
  			'h1': ['var(--font-size-h1)', { lineHeight: 'var(--line-height-tight)', letterSpacing: 'var(--letter-spacing-tight)' }],
  			'h2': ['var(--font-size-h2)', { lineHeight: 'var(--line-height-tight)', letterSpacing: 'var(--letter-spacing-tight)' }],
  			'h3': ['var(--font-size-h3)', { lineHeight: 'var(--line-height-snug)', letterSpacing: 'var(--letter-spacing-tight)' }],
  			'h4': ['var(--font-size-h4)', { lineHeight: 'var(--line-height-snug)' }],
  			'h5': ['var(--font-size-h5)', { lineHeight: 'var(--line-height-normal)' }],
  			'h6': ['var(--font-size-h6)', { lineHeight: 'var(--line-height-normal)' }],
  			'body-lg': ['var(--font-size-body-lg)', { lineHeight: 'var(--line-height-normal)' }],
  			'body': ['var(--font-size-body)', { lineHeight: 'var(--line-height-loose)' }],
  			'body-sm': ['var(--font-size-body-sm)', { lineHeight: 'var(--line-height-normal)' }],
  			'body-xs': ['var(--font-size-body-xs)', { lineHeight: 'var(--line-height-normal)' }],
  			'field': ['var(--font-size-field)', { lineHeight: 'var(--line-height-normal)' }],
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			slotAvailable: {
  				DEFAULT: 'hsl(var(--slot-available))',
  				foreground: 'hsl(var(--slot-available-foreground))'
  			},
  			slotPartial: {
  				DEFAULT: 'hsl(var(--slot-partial))',
  				foreground: 'hsl(var(--slot-partial-foreground))'
  			},
  			slotFull: {
  				DEFAULT: 'hsl(var(--slot-full))',
  				foreground: 'hsl(var(--slot-full-foreground))'
  			}
  		},
  		animation: {
  			'slide-up': 'slideUp 0.3s ease-out',
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
  		keyframes: {
  			slideUp: {
  				'0%': {
  					transform: 'translateY(100%)',
  					opacity: '0'
  				},
  				'100%': {
  					transform: 'translateY(0)',
  					opacity: '1'
  				}
  			},
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/container-queries")],
}
