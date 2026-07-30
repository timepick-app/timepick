import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { usePublicOrganization, PUBLIC_ORGANIZATION_QUERY_KEY } from '../usePublicOrganization'
import type { OrganizationSettings } from '@/services/organization.service'

const mockGetPublicOrganization = vi.hoisted(() => vi.fn())
vi.mock('@/services/organization.service', () => ({
  getPublicOrganization: () => mockGetPublicOrganization(),
}))

const identity: OrganizationSettings = {
  name: 'Chorale du Marais',
  logo: '',
  description: '',
  homepageFacade: true,
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('usePublicOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPublicOrganization.mockResolvedValue(identity)
  })

  it("met l'identité en cache sous la clé contractuelle ['public','organization']", async () => {
    // Contrat inter-modules : le panneau Paramètres → Organisation invalide
    // cette clé littérale après enregistrement. La renommer casserait le
    // rafraîchissement de la façade et de l'en-tête public, silencieusement.
    expect(PUBLIC_ORGANIZATION_QUERY_KEY).toEqual(['public', 'organization'])

    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => usePublicOrganization(), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual(identity))
    expect(queryClient.getQueryData(['public', 'organization'])).toEqual(identity)
  })

  it('enabled=false → aucune requête, état pending', () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => usePublicOrganization({ enabled: false }), { wrapper })

    expect(mockGetPublicOrganization).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(true)
  })

  it('ne réessaie pas après un échec (repli immédiat côté consommateurs)', async () => {
    mockGetPublicOrganization.mockRejectedValue(new Error('network'))
    const { wrapper } = setup()
    const { result } = renderHook(() => usePublicOrganization(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockGetPublicOrganization).toHaveBeenCalledTimes(1)
  })
})
