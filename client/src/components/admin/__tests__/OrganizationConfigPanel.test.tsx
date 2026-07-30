import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrganizationConfigPanel } from '../OrganizationConfigPanel'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { OrganizationSettings } from '../../../services/organization.service'

const mockUseOrganizationSettings = vi.fn()
const mockUseUpdateOrganizationSettings = vi.fn()
const mockUseUploadOrganizationLogo = vi.fn()
const mockUseDeleteOrganizationLogo = vi.fn()

vi.mock('../../../hooks/useOrganizationSettings', () => ({
  useOrganizationSettings: () => mockUseOrganizationSettings(),
  useUpdateOrganizationSettings: () => mockUseUpdateOrganizationSettings(),
  useUploadOrganizationLogo: () => mockUseUploadOrganizationLogo(),
  useDeleteOrganizationLogo: () => mockUseDeleteOrganizationLogo(),
}))

// Tiptap/ProseMirror est inutilisable sous jsdom — cf. @/test/mockRichTextEditor.
vi.mock('@/components/ui/rich-text-editor', () => import('@/test/mockRichTextEditor'))

const sampleSettings: OrganizationSettings = {
  name: 'TimePick',
  logo: 'https://test.example/uploads/organization/logo.webp',
  description: 'Une organisation de test',
  homepageFacade: true,
}

const emptySettings: OrganizationSettings = {
  name: '',
  logo: '',
  description: '',
  homepageFacade: true,
}

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const renderPanel = () => {
  const queryClient = createQueryClient()
  // Élément neuf à chaque rendu : `rerender` avec la MÊME référence d'élément
  // laisse React court-circuiter la réconciliation, et le hook mocké n'est
  // jamais relu.
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <OrganizationConfigPanel />
    </QueryClientProvider>
  )
  const result = render(tree())
  // Un refetch ne change pas l'arbre : il change ce que le hook mocké renvoie.
  // `resync()` rejoue le rendu pour que le composant relise le mock — c'est le
  // seul moyen d'exercer la garde anti-écrasement (`settings !== syncedSettings`).
  return { ...result, resync: () => result.rerender(tree()) }
}

describe('OrganizationConfigPanel', () => {
  const mockSave = vi.fn()
  const mockUpload = vi.fn()
  const mockRemove = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockUseOrganizationSettings.mockReturnValue({
      data: sampleSettings,
      isLoading: false,
      error: null,
    })
    mockUseUpdateOrganizationSettings.mockReturnValue({
      mutate: mockSave,
      isPending: false,
    })
    mockUseUploadOrganizationLogo.mockReturnValue({
      mutate: mockUpload,
      isPending: false,
    })
    mockUseDeleteOrganizationLogo.mockReturnValue({
      mutate: mockRemove,
      isPending: false,
    })
  })

  it('affiche le nom et la description pré-remplis', () => {
    renderPanel()

    expect(screen.getByTestId('organization-name-input')).toHaveValue('TimePick')
    expect(screen.getByTestId('organization-description-input')).toHaveValue('Une organisation de test')
  })

  it('affiche l\'aperçu du logo quand présent', () => {
    renderPanel()

    const img = screen.getByTestId('organization-logo-preview')
    expect(img).toHaveAttribute('src', sampleSettings.logo)
  })

  it('affiche un message quand aucun logo n\'est configuré', () => {
    mockUseOrganizationSettings.mockReturnValue({
      data: emptySettings,
      isLoading: false,
      error: null,
    })

    renderPanel()

    expect(screen.queryByTestId('organization-logo-preview')).not.toBeInTheDocument()
    expect(screen.getByText('Glissez un fichier ici ou cliquez pour parcourir')).toBeInTheDocument()
    expect(screen.queryByTestId('organization-logo-remove-button')).not.toBeInTheDocument()
  })

  it('enregistre avec un nom vide : la requête part, la description est conservée', () => {
    mockUseOrganizationSettings.mockReturnValue({
      data: emptySettings,
      isLoading: false,
      error: null,
    })

    renderPanel()

    fireEvent.change(screen.getByTestId('organization-description-input'), {
      target: { value: 'Une description sans nom' },
    })
    fireEvent.click(screen.getByTestId('organization-save-button'))

    expect(mockSave).toHaveBeenCalledWith({
      name: '',
      description: 'Une description sans nom',
      homepageFacade: true,
    })
  })

  it('un nom composé uniquement d\'espaces est enregistré vide (trim)', () => {
    renderPanel()

    fireEvent.change(screen.getByTestId('organization-name-input'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByTestId('organization-save-button'))

    expect(mockSave).toHaveBeenCalledWith({
      name: '',
      description: 'Une organisation de test',
      homepageFacade: true,
    })
  })

  it('appelle la mutation de sauvegarde avec le payload attendu (nom trimé)', () => {
    renderPanel()

    fireEvent.change(screen.getByTestId('organization-name-input'), {
      target: { value: '  TimePick Edité  ' },
    })
    fireEvent.change(screen.getByTestId('organization-description-input'), {
      target: { value: 'Nouvelle description' },
    })

    fireEvent.click(screen.getByTestId('organization-save-button'))

    expect(mockSave).toHaveBeenCalledWith({
      name: 'TimePick Edité',
      description: 'Nouvelle description',
      homepageFacade: true,
    })
  })

  it('un éditeur vidé est persisté en chaîne vide, jamais en "<p></p>"', () => {
    renderPanel()

    // Tiptap émet `<p></p>` quand l'utilisateur efface tout : la convention
    // « non configuré » du contrat organisation est la chaîne vide.
    fireEvent.change(screen.getByTestId('organization-description-input'), {
      target: { value: '<p></p>' },
    })
    fireEvent.click(screen.getByTestId('organization-save-button'))

    expect(mockSave).toHaveBeenCalledWith({
      name: 'TimePick',
      description: '',
      homepageFacade: true,
    })
  })

  // Garde de resync — les deux tests qui suivent encadrent le même mécanisme :
  // le premier prouve qu'il se dégèle, le second qu'il protège toujours.
  // Dette W1 de la revue « étape organisation ».
  it("après un vidage de la description, une modification venue d'ailleurs est toujours adoptée", () => {
    const { resync } = renderPanel()

    // 1. L'admin efface tout : Tiptap émet `<p></p>`, le payload part en ''.
    fireEvent.change(screen.getByTestId('organization-description-input'), {
      target: { value: '<p></p>' },
    })
    fireEvent.click(screen.getByTestId('organization-save-button'))

    // 2. Notre propre sauvegarde revient : le serveur confirme la chaîne vide.
    mockUseOrganizationSettings.mockReturnValue({
      data: { ...sampleSettings, description: '' },
      isLoading: false,
      error: null,
    })
    resync()

    // 3. Un autre admin (ou un autre onglet) renomme l'organisation.
    mockUseOrganizationSettings.mockReturnValue({
      data: { ...sampleSettings, description: '', name: 'Renommée ailleurs' },
      isLoading: false,
      error: null,
    })
    resync()

    expect(screen.getByTestId('organization-name-input')).toHaveValue('Renommée ailleurs')
  })

  it("un refetch d'arrière-plan n'écrase pas une saisie en cours", () => {
    const { resync } = renderPanel()

    fireEvent.change(screen.getByTestId('organization-name-input'), {
      target: { value: 'Saisie en cours' },
    })

    mockUseOrganizationSettings.mockReturnValue({
      data: { ...sampleSettings, name: 'Renommée ailleurs' },
      isLoading: false,
      error: null,
    })
    resync()

    expect(screen.getByTestId('organization-name-input')).toHaveValue('Saisie en cours')
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('appelle la mutation de suppression du logo au clic', () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('organization-logo-remove-button'))

    expect(mockRemove).toHaveBeenCalledTimes(1)
  })

  it('appelle la mutation de téléversement au choix d\'un fichier', async () => {
    renderPanel()

    const file = new File(['fake'], 'logo.png', { type: 'image/png' })
    const input = screen.getByTestId('organization-logo-input') as HTMLInputElement

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1)
    })
    expect(mockUpload.mock.calls[0][0]).toBe(file)
  })

  it('le toggle reflète homepageFacade=true par défaut', () => {
    renderPanel()

    const toggle = screen.getByTestId('organization-homepage-facade-toggle')
    expect(toggle).toHaveAttribute('data-state', 'checked')
    expect(screen.getByText(/les visiteurs non connectés voient l'identité/)).toBeInTheDocument()
  })

  it('le toggle reflète homepageFacade=false et bascule la description', () => {
    mockUseOrganizationSettings.mockReturnValue({
      data: { ...sampleSettings, homepageFacade: false },
      isLoading: false,
      error: null,
    })

    renderPanel()

    const toggle = screen.getByTestId('organization-homepage-facade-toggle')
    expect(toggle).toHaveAttribute('data-state', 'unchecked')
    expect(screen.getByText(/redirigés directement vers la connexion/)).toBeInTheDocument()
  })

  it('bascule le toggle et inclut la nouvelle valeur dans le payload de sauvegarde', () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('organization-homepage-facade-toggle'))
    fireEvent.click(screen.getByTestId('organization-save-button'))

    expect(mockSave).toHaveBeenCalledWith({
      name: 'TimePick',
      description: 'Une organisation de test',
      homepageFacade: false,
    })
  })

  it('affiche un état de chargement', () => {
    mockUseOrganizationSettings.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    renderPanel()

    expect(screen.getByText('Chargement...')).toBeInTheDocument()
  })

  it('affiche un message d\'erreur en cas d\'échec de chargement', () => {
    mockUseOrganizationSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    })

    renderPanel()

    expect(
      screen.getByText(/Erreur de chargement des paramètres de l'organisation/)
    ).toBeInTheDocument()
  })

  it('n\'utilise jamais le mot "association"', () => {
    renderPanel()

    expect(document.body.textContent?.toLowerCase()).not.toContain('association')
  })
})
