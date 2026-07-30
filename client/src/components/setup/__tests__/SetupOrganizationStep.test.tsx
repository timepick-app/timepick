import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SetupOrganizationStep } from '../SetupOrganizationStep'
import type { SetupOrganizationDraft, SetupOrganizationSaved } from '../SetupOrganizationStep'
import {
  saveSetupOrganization,
  uploadSetupOrganizationLogo,
  deleteSetupOrganizationLogo,
} from '@/services/setup.service'
// Mock sonner pour pouvoir ASSERTER le toast d'erreur (vi.hoisted évite la TDZ).
const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: mockToastError, success: vi.fn() } }))

// Tiptap/ProseMirror est inutilisable sous jsdom — cf. @/test/mockRichTextEditor.
vi.mock('@/components/ui/rich-text-editor', () => import('@/test/mockRichTextEditor'))

vi.mock('@/services/setup.service', () => ({
  saveSetupOrganization: vi.fn(),
  uploadSetupOrganizationLogo: vi.fn(),
  deleteSetupOrganizationLogo: vi.fn(),
}))

const mockedSaveSetupOrganization = vi.mocked(saveSetupOrganization)
const mockedUploadSetupOrganizationLogo = vi.mocked(uploadSetupOrganizationLogo)
const mockedDeleteSetupOrganizationLogo = vi.mocked(deleteSetupOrganizationLogo)

const emptyDraft: SetupOrganizationDraft = { name: '', description: '', logo: '' }
/** Ce que renvoie une instance neuve : identité lue, mais vide. À ne pas
 *  confondre avec `saved: null`, qui veut dire « état enregistré inconnu » —
 *  auquel cas l'étape n'écrit JAMAIS (elle n'a pas de référence). */
const emptySaved: SetupOrganizationSaved = { name: '', description: '' }

/**
 * `SetupOrganizationStep` est entièrement piloté par ses props depuis le
 * refactor du wizard : plus de `useQuery`, plus d'état de saisie local. Ce
 * harnais tient `draft`/`saved` dans un `useState`, comme le fait
 * `SetupWizard` en vrai, et branche `onDraftChange`/`onSaved` dessus.
 */
function OrganizationStepHarness({
  initialDraft = emptyDraft,
  initialSaved = null,
  isLoading = false,
  loadFailed = false,
  onDone,
  onBack,
  onSavedSpy,
  onRetryLoad,
}: {
  initialDraft?: SetupOrganizationDraft
  initialSaved?: SetupOrganizationSaved | null
  isLoading?: boolean
  loadFailed?: boolean
  onDone: () => void
  onBack?: () => void
  onSavedSpy?: (saved: SetupOrganizationSaved) => void
  onRetryLoad?: () => void
}) {
  const [draft, setDraft] = useState(initialDraft)
  const [saved, setSaved] = useState(initialSaved)
  return (
    <SetupOrganizationStep
      draft={draft}
      onDraftChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
      saved={saved}
      onSaved={(next) => {
        onSavedSpy?.(next)
        setSaved(next)
      }}
      isLoading={isLoading}
      loadFailed={loadFailed}
      onRetryLoad={onRetryLoad ?? (() => {})}
      onDone={onDone}
      onBack={onBack}
    />
  )
}

const renderStep = (
  options: {
    initialDraft?: SetupOrganizationDraft
    initialSaved?: SetupOrganizationSaved | null
    isLoading?: boolean
    loadFailed?: boolean
    withBack?: boolean
  } = {},
) => {
  const { withBack, ...rest } = options
  const onDone = vi.fn()
  const onSavedSpy = vi.fn()
  const onBack = vi.fn()
  const onRetryLoad = vi.fn()
  const utils = render(
    <OrganizationStepHarness
      {...rest}
      onDone={onDone}
      onSavedSpy={onSavedSpy}
      onRetryLoad={onRetryLoad}
      onBack={withBack ? onBack : undefined}
    />,
  )
  return { ...utils, onDone, onSavedSpy, onBack, onRetryLoad }
}

describe('SetupOrganizationStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche les champs Nom, Description et Logo, sans bouton "Passer"', () => {
    renderStep()

    expect(screen.getByTestId('org-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('org-description-input')).toBeInTheDocument()
    expect(screen.getByTestId('org-logo-dropzone')).toBeInTheDocument()
    expect(screen.queryByTestId('org-skip-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('org-continue-btn')).toBeInTheDocument()
  })

  it('un seul bouton d\'avancement, libellé "Continuer" au repos, vide ou rempli', async () => {
    const user = userEvent.setup()
    renderStep({ initialSaved: emptySaved })

    const continueBtn = screen.getByTestId('org-continue-btn')
    expect(continueBtn).toHaveTextContent('Continuer')
    expect(screen.queryByTestId('org-skip-btn')).not.toBeInTheDocument()

    await user.type(screen.getByTestId('org-name-input'), 'Club de padel')
    await user.type(screen.getByTestId('org-description-input'), 'Une description')

    expect(continueBtn).toHaveTextContent('Continuer')
    expect(screen.queryByTestId('org-skip-btn')).not.toBeInTheDocument()
  })

  it('pendant l\'envoi, le bouton passe en "Sauvegarde..." et se désactive', async () => {
    const user = userEvent.setup()
    let resolveSave: () => void = () => {}
    mockedSaveSetupOrganization.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSave = () => resolve() }),
    )
    renderStep({ initialSaved: emptySaved })

    await user.type(screen.getByTestId('org-name-input'), 'Club de padel')
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() =>
      expect(screen.getByTestId('org-continue-btn')).toHaveTextContent('Sauvegarde...'),
    )
    expect(screen.getByTestId('org-continue-btn')).toBeDisabled()

    resolveSave()
  })

  it('valeurs identiques à ce qui est déjà enregistré : "Continuer" n\'écrit rien', async () => {
    const user = userEvent.setup()
    const { onDone } = renderStep({
      initialDraft: { name: 'Club de padel', description: 'Une description', logo: '' },
      initialSaved: { name: 'Club de padel', description: 'Une description' },
    })

    await user.click(screen.getByTestId('org-continue-btn'))

    expect(mockedSaveSetupOrganization).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("formulaire vide et lecture serveur non aboutie (saved=null) : \"Continuer\" n'écrit rien et avance", async () => {
    const user = userEvent.setup()
    const { onDone } = renderStep({ initialDraft: emptyDraft, initialSaved: null })

    await user.click(screen.getByTestId('org-continue-btn'))

    expect(mockedSaveSetupOrganization).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('vider un champ enregistré efface : "Continuer" envoie le vide', async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockResolvedValue(undefined)
    const { onDone } = renderStep({
      initialDraft: { name: 'Ancien', description: '<p>Texte</p>', logo: '' },
      initialSaved: { name: 'Ancien', description: '<p>Texte</p>' },
    })

    await user.clear(screen.getByTestId('org-name-input'))
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: '',
        description: '<p>Texte</p>',
      })
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('onSaved reçoit exactement le payload écrit après un succès', async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockResolvedValue(undefined)
    const { onSavedSpy } = renderStep({ initialDraft: emptyDraft, initialSaved: emptySaved })

    await user.type(screen.getByTestId('org-name-input'), 'Club de padel')
    await user.type(screen.getByTestId('org-description-input'), 'Une description')
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => {
      expect(onSavedSpy).toHaveBeenCalledWith({
        name: 'Club de padel',
        description: 'Une description',
      })
    })
  })

  it('isLoading désactive la saisie et le bouton "Continuer"', () => {
    renderStep({ isLoading: true })

    expect(screen.getByTestId('org-name-input')).toBeDisabled()
    expect(screen.getByTestId('org-continue-btn')).toBeDisabled()
  })

  // ECH-1 : sans ce verrou, un échec de lecture rouvre la saisie avec un
  // formulaire vide et « Continuer » écrase l'identité réellement en base.
  it("échec de lecture : saisie verrouillée, « Continuer » avance sans rien écrire", async () => {
    const user = userEvent.setup()
    const { onDone } = renderStep({ initialSaved: null, loadFailed: true })

    expect(screen.getByTestId('org-load-error')).toBeInTheDocument()
    expect(screen.getByTestId('org-name-input')).toBeDisabled()

    const continueBtn = screen.getByTestId('org-continue-btn')
    expect(continueBtn).toBeEnabled()
    await user.click(continueBtn)

    expect(mockedSaveSetupOrganization).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('échec de lecture : « Réessayer » relance la lecture serveur', async () => {
    const user = userEvent.setup()
    const { onRetryLoad } = renderStep({ initialSaved: null, loadFailed: true })

    await user.click(screen.getByTestId('org-load-retry-btn'))

    expect(onRetryLoad).toHaveBeenCalledTimes(1)
  })

  it('« Précédent » quitte l\'étape sans rien écrire', async () => {
    const user = userEvent.setup()
    const { onBack, onDone } = renderStep({
      initialDraft: { name: 'Saisie non enregistrée', description: '', logo: '' },
      initialSaved: emptySaved,
      withBack: true,
    })

    await user.click(screen.getByTestId('org-back-btn'))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(mockedSaveSetupOrganization).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('sans onBack, aucun bouton « Précédent » n\'est rendu', () => {
    renderStep({ initialSaved: emptySaved })

    expect(screen.queryByTestId('org-back-btn')).not.toBeInTheDocument()
  })

  it('un nom seul, sans description, est enregistré sans blocage', async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockResolvedValue(undefined)
    const { onDone } = renderStep({ initialDraft: emptyDraft, initialSaved: emptySaved })

    await user.type(screen.getByTestId('org-name-input'), 'Club de padel')
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: 'Club de padel',
        description: '',
      })
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('"Continuer" avec un nom et une description remplis appelle saveSetupOrganization puis onDone', async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockResolvedValue(undefined)
    const { onDone } = renderStep({ initialDraft: emptyDraft, initialSaved: emptySaved })

    await user.type(screen.getByTestId('org-name-input'), 'Club de padel')
    await user.type(screen.getByTestId('org-description-input'), 'Une description')
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: 'Club de padel',
        description: 'Une description',
      })
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('une description sans nom part bien à l\'enregistrement, avec name: \'\'', async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockResolvedValue(undefined)
    const { onDone } = renderStep({ initialDraft: emptyDraft, initialSaved: emptySaved })

    await user.type(screen.getByTestId('org-description-input'), 'Une description orpheline')
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: '',
        description: 'Une description orpheline',
      })
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it("un nom fait uniquement d'espaces est envoyé trimé, comme un nom vide", async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockResolvedValue(undefined)
    const { onDone } = renderStep({ initialDraft: emptyDraft, initialSaved: emptySaved })

    await user.type(screen.getByTestId('org-name-input'), '   ')
    await user.type(screen.getByTestId('org-description-input'), 'Une description orpheline')
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: '',
        description: 'Une description orpheline',
      })
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it("l'échec de saveSetupOrganization affiche un toast d'erreur sans appeler onDone", async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockRejectedValue(new Error('boom'))
    const { onDone } = renderStep({ initialDraft: emptyDraft, initialSaved: emptySaved })

    await user.type(screen.getByTestId('org-name-input'), 'Club de padel')
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => expect(mockedSaveSetupOrganization).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('un éditeur vidé est persisté en chaîne vide, jamais en "<p></p>"', async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockResolvedValue(undefined)
    renderStep({ initialDraft: emptyDraft, initialSaved: emptySaved })

    await user.type(screen.getByTestId('org-name-input'), 'Club de padel')
    // Tiptap émet `<p></p>` quand l'utilisateur efface tout : la convention
    // « non configuré » du contrat organisation est la chaîne vide.
    fireEvent.change(screen.getByTestId('org-description-input'), {
      target: { value: '<p></p>' },
    })
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: 'Club de padel',
        description: '',
      })
    })
  })

  // W2 — une instance dont la description a été personnalisée AVANT l'éditeur
  // riche porte du texte brut en base (migration 041 ne vide que le seed
  // d'origine). L'éditeur l'affiche normalisé et remonte le HTML canonique de
  // Tiptap dès le premier rendu : sans comparaison sur forme canonique, ce
  // simple aller-retour déclenche une écriture alors que rien n'a changé pour
  // l'utilisateur. Dette relevée en revue de l'« étape organisation ».
  it("une description seedée en texte brut, non modifiée, n'est pas réécrite au clic", async () => {
    const user = userEvent.setup()
    const { onDone } = renderStep({
      initialDraft: { name: 'Club de padel', description: "L'asso & co", logo: '' },
      initialSaved: { name: 'Club de padel', description: "L'asso & co" },
    })

    // Ce que le vrai éditeur remonte à l'hydratation : le même contenu, écrit
    // comme Tiptap l'écrit. L'utilisateur n'a rien touché.
    fireEvent.change(screen.getByTestId('org-description-input'), {
      target: { value: "<p>L'asso &amp; co</p>" },
    })
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(mockedSaveSetupOrganization).not.toHaveBeenCalled()
  })

  it('une description réellement modifiée part bien à l\'enregistrement', async () => {
    const user = userEvent.setup()
    mockedSaveSetupOrganization.mockResolvedValue(undefined)
    renderStep({
      initialDraft: { name: 'Club de padel', description: "L'asso & co", logo: '' },
      initialSaved: { name: 'Club de padel', description: "L'asso & co" },
    })

    fireEvent.change(screen.getByTestId('org-description-input'), {
      target: { value: "<p>L'asso &amp; co, section padel</p>" },
    })
    await user.click(screen.getByTestId('org-continue-btn'))

    await waitFor(() => {
      expect(mockedSaveSetupOrganization).toHaveBeenCalledWith({
        name: 'Club de padel',
        description: "<p>L'asso &amp; co, section padel</p>",
      })
    })
  })

  it("la sélection d'un fichier logo appelle uploadSetupOrganizationLogo et affiche l'aperçu", async () => {
    const user = userEvent.setup()
    mockedUploadSetupOrganizationLogo.mockResolvedValue({ logo: 'https://cdn.example/new-logo.png' })
    renderStep()

    const file = new File(['fake-image'], 'logo.png', { type: 'image/png' })
    await user.upload(screen.getByTestId('org-logo-input'), file)

    await waitFor(() => {
      expect(mockedUploadSetupOrganizationLogo).toHaveBeenCalledWith(file)
    })
    await waitFor(() => {
      expect(screen.getByTestId('org-logo-preview')).toHaveAttribute(
        'src',
        'https://cdn.example/new-logo.png',
      )
    })
  })

  it('"Supprimer" le logo appelle deleteSetupOrganizationLogo et retire l\'aperçu', async () => {
    const user = userEvent.setup()
    mockedDeleteSetupOrganizationLogo.mockResolvedValue(undefined)
    renderStep({
      initialDraft: { name: '', description: '', logo: 'https://cdn.example/logo.png' },
      initialSaved: null,
    })

    expect(screen.getByTestId('org-logo-preview')).toBeInTheDocument()

    await user.click(screen.getByTestId('org-logo-remove-btn'))

    await waitFor(() => expect(mockedDeleteSetupOrganizationLogo).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByTestId('org-logo-preview')).not.toBeInTheDocument())
  })
})
