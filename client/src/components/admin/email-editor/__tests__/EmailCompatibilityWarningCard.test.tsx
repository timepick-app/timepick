import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmailCompatibilityWarningCard } from '../EmailCompatibilityWarningCard'

const SOURCES_WITH_BORDER_RADIUS = {
  body: '<mj-section border-radius="4px"><mj-column /></mj-section>',
}

const SOURCES_CLEAN = {
  body: '<mj-section padding="0"><mj-column /></mj-section>',
}

const SCOPE = 'test:1'
const DISMISS_KEY = 'EmailCompat:test:1:border-radius:body'

describe('<EmailCompatibilityWarningCard />', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("rend null quand aucune incompat n'est détectée", () => {
    const { container } = render(
      <EmailCompatibilityWarningCard sources={SOURCES_CLEAN} scopeKey={SCOPE} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('rend null quand toutes les sources sont vides', () => {
    const { container } = render(
      <EmailCompatibilityWarningCard sources={{}} scopeKey={SCOPE} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('affiche le titre Compatibilité Outlook et 1 puce quand border-radius détecté', () => {
    render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    expect(screen.getByText('Compatibilité Outlook')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText(/coins arrondis/i)).toBeInTheDocument()
  })

  it("signale la provenance de l'incompat dans la puce", () => {
    render(
      <EmailCompatibilityWarningCard
        sources={{
          header: '<mj-section border-radius="4px"></mj-section>',
          body: '<mj-button border-radius="8px">CTA</mj-button>',
        }}
        scopeKey={SCOPE}
      />,
    )
    expect(screen.getByText(/Détecté dans\s*:\s*entête, corps/)).toBeInTheDocument()
  })

  it('le clic sur X masque la card immédiatement', () => {
    render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    expect(screen.queryByTestId('email-compatibility-warning-card')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('email-compatibility-dismiss-btn'))
    expect(screen.queryByTestId('email-compatibility-warning-card')).not.toBeInTheDocument()
  })

  it("persiste le dismiss en localStorage avec une clé scopée incluant le set d'incompats et la provenance", () => {
    render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    fireEvent.click(screen.getByTestId('email-compatibility-dismiss-btn'))
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('1')
  })

  it('reste cachée au remount si localStorage contient déjà le dismiss pour le même hash', () => {
    window.localStorage.setItem(DISMISS_KEY, '1')
    const { container } = render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it("ne s'applique pas à un autre scope (dismiss d'un événement n'affecte pas un autre)", () => {
    window.localStorage.setItem(
      'EmailCompat:event:autre-event:border-radius:body',
      '1',
    )
    render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    expect(screen.getByTestId('email-compatibility-warning-card')).toBeInTheDocument()
  })

  it('réapparaît si la provenance change (body → header)', () => {
    const { rerender } = render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    fireEvent.click(screen.getByTestId('email-compatibility-dismiss-btn'))
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('1')

    rerender(
      <EmailCompatibilityWarningCard
        sources={{ header: '<mj-section border-radius="4px"></mj-section>' }}
        scopeKey={SCOPE}
      />,
    )
    expect(screen.getByTestId('email-compatibility-warning-card')).toBeInTheDocument()
  })

  it("purge la clé dismiss quand l'utilisateur corrige l'incompat (réapparition au retour)", () => {
    const { rerender } = render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    fireEvent.click(screen.getByTestId('email-compatibility-dismiss-btn'))
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('1')

    rerender(
      <EmailCompatibilityWarningCard sources={SOURCES_CLEAN} scopeKey={SCOPE} />,
    )
    expect(window.localStorage.getItem(DISMISS_KEY)).toBeNull()

    rerender(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    expect(screen.getByTestId('email-compatibility-warning-card')).toBeInTheDocument()
  })

  it('purge même après unmount + remount (panel rechargé par la mutation post-save)', () => {
    // 1. Mount initial avec incompat → dismiss
    const first = render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    fireEvent.click(screen.getByTestId('email-compatibility-dismiss-btn'))
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('1')

    // 2. Unmount complet (panel passe en isLoading=true pendant la mutation)
    first.unmount()
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('1') // toujours là

    // 3. Remount avec sources corrigées (refetch terminé, plus de border-radius)
    render(<EmailCompatibilityWarningCard sources={SOURCES_CLEAN} scopeKey={SCOPE} />)

    // La clé doit être purgée même si la card est un nouveau composant
    expect(window.localStorage.getItem(DISMISS_KEY)).toBeNull()
  })

  it("purge toutes les clés du scope, pas seulement le hash courant", () => {
    // Simule plusieurs résidus de provenance différents pour le même scope
    window.localStorage.setItem(`EmailCompat:${SCOPE}:border-radius:body`, '1')
    window.localStorage.setItem(`EmailCompat:${SCOPE}:border-radius:header`, '1')
    window.localStorage.setItem(
      `EmailCompat:${SCOPE}:border-radius:body,header`,
      '1',
    )
    // Une clé d'un autre scope qui ne doit PAS être purgée
    window.localStorage.setItem('EmailCompat:autre-scope:border-radius:body', '1')

    render(<EmailCompatibilityWarningCard sources={SOURCES_CLEAN} scopeKey={SCOPE} />)

    expect(
      window.localStorage.getItem(`EmailCompat:${SCOPE}:border-radius:body`),
    ).toBeNull()
    expect(
      window.localStorage.getItem(`EmailCompat:${SCOPE}:border-radius:header`),
    ).toBeNull()
    expect(
      window.localStorage.getItem(
        `EmailCompat:${SCOPE}:border-radius:body,header`,
      ),
    ).toBeNull()
    // L'autre scope est intact
    expect(
      window.localStorage.getItem('EmailCompat:autre-scope:border-radius:body'),
    ).toBe('1')
  })

  it('ne crashe pas quand localStorage.setItem throw (mode privé strict)', () => {
    const setItemSpy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
    render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
      />,
    )
    expect(() =>
      fireEvent.click(screen.getByTestId('email-compatibility-dismiss-btn')),
    ).not.toThrow()
    expect(
      screen.queryByTestId('email-compatibility-warning-card'),
    ).not.toBeInTheDocument()
    setItemSpy.mockRestore()
  })

  it('forward className et data-* sur la racine', () => {
    render(
      <EmailCompatibilityWarningCard
        sources={SOURCES_WITH_BORDER_RADIUS}
        scopeKey={SCOPE}
        className="custom-cls"
        data-testid="custom-card"
      />,
    )
    const root = screen.getByTestId('custom-card')
    expect(root).toHaveClass('custom-cls')
  })
})
