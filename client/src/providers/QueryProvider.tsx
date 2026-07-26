import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

interface QueryProviderProps {
  children: ReactNode
}

/**
 * QueryProvider - Fournit React Query pour la gestion d'état serveur
 *
 * Configuration:
 * - refetchOnWindowFocus: true (données fraîches au retour d'onglet)
 * - retry: 1 (évite tentatives multiples en cas d'erreur)
 * - staleTime: 5min (données considérées fraîches 5 min)
 *
 * `refetchOnWindowFocus` ne refetch QUE les requêtes déjà *stale* : c'est
 * `staleTime` qui décide. Le défaut de 5 min borne la rafale au retour — ne pas
 * le relever sans mesurer. Mesures et angles écartés : ADR « rafraîchissement
 * au retour d'onglet ».
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Observabilité minimale : aucun échec de requête n'était tracé. DEV uniquement.
            if (import.meta.env.DEV) console.error('[query] échec', query.queryKey, error)
          },
        }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: true,
            retry: 1,
            staleTime: 5 * 60 * 1000, // 5 minutes
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
