import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export interface SetupStatusResponse {
  needsSetup: boolean;
}

/**
 * Constante pour la durée de validité du cache du statut de configuration
 * Le statut change instantanément lors de la création du premier admin,
 * donc on garde un cache court pour permettre les mises à jour rapides
 */
const SETUP_STATUS_STALE_TIME_MS = 60 * 1000; // 1 minute

/**
 * Hook pour récupérer le statut de configuration initiale
 * @returns QueryResult avec needsSetup
 */
export function useSetupStatus() {
  return useQuery({
    queryKey: ['setup-status'],
    queryFn: async (): Promise<SetupStatusResponse> => {
      const response = await api.get<SetupStatusResponse>('/setup/status');
      return response.data;
    },
    refetchInterval: false,
    retry: false,
    staleTime: SETUP_STATUS_STALE_TIME_MS,
  });
}
