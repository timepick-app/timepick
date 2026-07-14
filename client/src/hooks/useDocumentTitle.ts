import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { formatTitle, getStaticTitle } from '@/config/pageTitle';

interface UseDocumentTitleOptions {
  /**
   * Custom title to use (overrides automatic route-based title)
   * Use this for dynamic titles like event names
   */
  title?: string;

  /**
   * Whether to append " - TimePick" suffix
   * @default true
   */
  includeAppName?: boolean;

  /**
   * Skip automatic title detection from route
   * Set to true when you want complete manual control
   * @default false
   */
  skipAuto?: boolean;
}

interface UseDocumentTitleReturn {
  /**
   * Programmatically set the title
   * Useful for dynamic updates after data loads
   */
  setTitle: (title: string) => void;
}

/**
 * Hook to manage document.title with automatic route-based detection
 *
 * @param options - Configuration options
 * @returns Object with setTitle function for programmatic updates
 *
 * @example
 * // Static title from route (automatic)
 * useDocumentTitle();
 *
 * @example
 * // Custom static title
 * useDocumentTitle({ title: 'Connexion' });
 *
 * @example
 * // Dynamic title (e.g., event name)
 * useDocumentTitle({
 *   title: event?.name ?? (isLoading ? 'Chargement...' : 'Événement')
 * });
 *
 * @example
 * // Without app name suffix
 * useDocumentTitle({ title: 'Custom', includeAppName: false });
 */
export function useDocumentTitle(options: UseDocumentTitleOptions = {}): UseDocumentTitleReturn {
  const {
    title: customTitle,
    includeAppName = true,
    skipAuto = false,
  } = options;

  const location = useLocation();
  const previousTitleRef = useRef<string | null>(null);

  /**
   * Internal function to update document.title
   */
  const updateTitle = useCallback((newTitle: string | null | undefined) => {
    if (!newTitle) {
      return;
    }

    const formattedTitle = formatTitle(newTitle, includeAppName);

    // Only update if title has changed (avoid unnecessary DOM updates)
    if (previousTitleRef.current !== formattedTitle) {
      document.title = formattedTitle;
      previousTitleRef.current = formattedTitle;
    }
  }, [includeAppName]);

  // Effect: Update title when options or route changes
  useEffect(() => {
    // Priority 1: Custom title provided
    if (customTitle !== undefined) {
      updateTitle(customTitle);
      return;
    }

    // Priority 2: Skip auto-detection
    if (skipAuto) {
      return;
    }

    // Priority 3: Auto-detect from route
    const routeTitle = getStaticTitle(location.pathname);
    if (routeTitle) {
      updateTitle(routeTitle);
    }
  }, [customTitle, skipAuto, location.pathname, updateTitle]);

  // Cleanup: Restore previous title on unmount (optional, typically not needed)
  // Keeping this as a pattern for future enhancement if needed

  return { setTitle: updateTitle };
}
