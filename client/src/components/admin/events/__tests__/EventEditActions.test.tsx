import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ComponentProps } from 'react'

// Mock react-i18next BEFORE importing the component
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'eventPublishBanner.draft': 'Brouillon',
        'eventPublishBanner.published': 'Publié',
        'eventPublishBanner.draftAriaLabel': "Publier l'événement",
        'eventPublishBanner.publishedAriaLabel': "Dépublier l'événement",
        'eventPublishBanner.publish': 'Publier',
        'eventPublishBanner.unpublish': 'Dépublier',
        'eventPublishBanner.save': 'Enregistrer',
        'eventPublishBanner.saving': 'Enregistrement...',
        'eventPublishBanner.resetChanges': 'Annuler les modifications',
      }
      return translations[key] || key
    },
  }),
}))

// Import component AFTER mocking
import { EventEditActions } from '../EventEditActions'

type EventEditActionsProps = ComponentProps<typeof EventEditActions>

/**
 * Props par défaut : événement brouillon, sans modifications, hors chargement.
 */
function defaultProps(overrides: Partial<EventEditActionsProps> = {}): EventEditActionsProps {
  return {
    isPublished: false,
    onPublish: vi.fn(),
    onUnpublish: vi.fn(),
    isUpdating: false,
    onSave: vi.fn(),
    onReset: vi.fn(),
    hasUnsavedChanges: false,
    ...overrides,
  }
}

describe('EventEditActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================
  // Bouton « Annuler les modifications »
  // ==========================================
  describe('Bouton « Annuler les modifications »', () => {
    it("n'est pas rendu quand hasUnsavedChanges=false", () => {
      render(<EventEditActions {...defaultProps()} />)
      expect(screen.queryByRole('button', { name: /annuler les modifications/i })).not.toBeInTheDocument()
    })

    it('est rendu quand hasUnsavedChanges=true', () => {
      render(<EventEditActions {...defaultProps({ hasUnsavedChanges: true })} />)
      expect(screen.getByRole('button', { name: /annuler les modifications/i })).toBeInTheDocument()
    })

    it('appelle onReset au clic', () => {
      const onReset = vi.fn()
      render(<EventEditActions {...defaultProps({ onReset, hasUnsavedChanges: true })} />)

      fireEvent.click(screen.getByRole('button', { name: /annuler les modifications/i }))
      expect(onReset).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================
  // Bouton « Enregistrer »
  // ==========================================
  describe('Bouton « Enregistrer »', () => {
    it('est désactivé quand !hasUnsavedChanges', () => {
      render(<EventEditActions {...defaultProps({ hasUnsavedChanges: false })} />)
      expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled()
    })

    it('est activé quand hasUnsavedChanges', () => {
      render(<EventEditActions {...defaultProps({ hasUnsavedChanges: true })} />)
      expect(screen.getByRole('button', { name: /enregistrer/i })).toBeEnabled()
    })

    it('appelle onSave au clic quand hasUnsavedChanges', () => {
      const onSave = vi.fn()
      render(<EventEditActions {...defaultProps({ onSave, hasUnsavedChanges: true })} />)

      fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))
      expect(onSave).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================
  // Bascule de publication
  // ==========================================
  describe('Bascule de publication', () => {
    describe('isPublished=false (brouillon)', () => {
      it('affiche le libellé « Publier »', () => {
        render(<EventEditActions {...defaultProps({ isPublished: false })} />)
        expect(screen.getByRole('button', { name: "Publier l'événement" })).toHaveTextContent(/publier/i)
      })

      it('utilise le variant default (fond primaire)', () => {
        render(<EventEditActions {...defaultProps({ isPublished: false })} />)
        // Le variant `default` est le seul à porter `bg-primary`
        expect(screen.getByRole('button', { name: "Publier l'événement" })).toHaveClass('bg-primary')
      })

      it('appelle onPublish au clic', () => {
        const onPublish = vi.fn()
        const onUnpublish = vi.fn()
        render(<EventEditActions {...defaultProps({ isPublished: false, onPublish, onUnpublish })} />)

        fireEvent.click(screen.getByRole('button', { name: "Publier l'événement" }))
        expect(onPublish).toHaveBeenCalledTimes(1)
        expect(onUnpublish).not.toHaveBeenCalled()
      })

      it("porte l'aria-label « Publier l'événement »", () => {
        render(<EventEditActions {...defaultProps({ isPublished: false })} />)
        expect(screen.getByRole('button', { name: "Publier l'événement" })).toBeInTheDocument()
      })
    })

    describe('isPublished=true (publié)', () => {
      it('affiche le libellé « Dépublier »', () => {
        render(<EventEditActions {...defaultProps({ isPublished: true })} />)
        expect(screen.getByRole('button', { name: "Dépublier l'événement" })).toHaveTextContent(/dépublier/i)
      })

      it('utilise le variant outline (bordure input)', () => {
        render(<EventEditActions {...defaultProps({ isPublished: true })} />)
        // Le variant `outline` est le seul à porter `border-input` (default n'a pas de bordure)
        expect(screen.getByRole('button', { name: "Dépublier l'événement" })).toHaveClass('border-input')
      })

      it('appelle onUnpublish au clic', () => {
        const onPublish = vi.fn()
        const onUnpublish = vi.fn()
        render(<EventEditActions {...defaultProps({ isPublished: true, onPublish, onUnpublish })} />)

        fireEvent.click(screen.getByRole('button', { name: "Dépublier l'événement" }))
        expect(onUnpublish).toHaveBeenCalledTimes(1)
        expect(onPublish).not.toHaveBeenCalled()
      })

      it("porte l'aria-label « Dépublier l'événement »", () => {
        render(<EventEditActions {...defaultProps({ isPublished: true })} />)
        expect(screen.getByRole('button', { name: "Dépublier l'événement" })).toBeInTheDocument()
      })
    })
  })

  // ==========================================
  // État de mise à jour (isUpdating)
  // ==========================================
  describe('État de mise à jour (isUpdating)', () => {
    it('désactive le bouton Enregistrer', () => {
      render(<EventEditActions {...defaultProps({ hasUnsavedChanges: true, isUpdating: true })} />)
      expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled()
    })

    it('désactive le bouton de bascule de publication', () => {
      render(<EventEditActions {...defaultProps({ isUpdating: true })} />)
      expect(screen.getByRole('button', { name: "Publier l'événement" })).toBeDisabled()
    })

    it('affiche le spinner sur le bouton de bascule de publication', () => {
      const { container } = render(<EventEditActions {...defaultProps({ isUpdating: true })} />)
      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('désactive le bouton « Annuler les modifications »', () => {
      render(<EventEditActions {...defaultProps({ hasUnsavedChanges: true, isUpdating: true })} />)
      expect(screen.getByRole('button', { name: /annuler les modifications/i })).toBeDisabled()
    })
  })

  // ==========================================
  // Attributs data-action et classes condensé
  // ==========================================
  describe('Attributs data-action et classes de condensation', () => {
    it('chaque bouton porte son data-action', () => {
      render(<EventEditActions {...defaultProps({ hasUnsavedChanges: true })} />)
      const cases: [RegExp | string, string][] = [
        [/annuler les modifications/i, 'reset'],
        ["Publier l'événement",        'publish'],
        [/enregistrer/i,               'save'],
      ]
      for (const [name, action] of cases)
        expect(screen.getByRole('button', { name })).toHaveAttribute('data-action', action)
    })

    it('les boutons reset et publish portent max-lg:group-data-[condensed]/sticky:hidden', () => {
      render(<EventEditActions {...defaultProps({ hasUnsavedChanges: true })} />)
      const resetBtn = screen.getByRole('button', { name: /annuler les modifications/i })
      const publishBtn = screen.getByRole('button', { name: "Publier l'événement" })
      expect(resetBtn).toHaveClass('max-lg:group-data-[condensed]/sticky:hidden')
      expect(publishBtn).toHaveClass('max-lg:group-data-[condensed]/sticky:hidden')
    })

  })
})
