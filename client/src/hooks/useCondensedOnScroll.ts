import { useEffect, useState } from 'react'

/**
 * Condense l'en-tête dès que la page est défilée.
 * Seuil 0 (le plancher) : tout seuil > 0 oscillerait — le scroll-anchoring
 * recule `scrollY` de la hauteur regagnée, repassant le seuil.
 */
export function useCondensedOnScroll(): boolean {
  const [condensed, setCondensed] = useState(false)

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return condensed
}
