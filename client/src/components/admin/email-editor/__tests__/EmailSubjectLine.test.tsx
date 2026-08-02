import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmailSubjectLine } from '../EmailSubjectLine'
import type { EmailSubjectState } from '../EmailSubjectLine'
import type { SubjectVariable } from '@/lib/email-subject'

// Deux variables suffisent : `event_name` sert aux tests d'interpolation et
// d'insertion, `user_first_name` sert au test d'affichage interpolé.
const VARIABLES: SubjectVariable[] = [
  { name: 'event_name', label: "Nom de l'événement", previewValue: 'Kermesse de printemps' },
  { name: 'user_first_name', label: 'Prénom', previewValue: 'Alex' },
]

// Objet de repli SANS jeton par défaut : la plupart des tests n'ont pas
// besoin d'interpolation, et un objet sans accolades peut être tapé au
// clavier avec `userEvent.type` sans avoir à échapper la syntaxe `{…}` que
// cette librairie réserve aux touches spéciales.
const FALLBACK_SUBJECT = 'Bienvenue sur TimePick'

const baseProps = {
  fallbackSubject: FALLBACK_SUBJECT,
  level: 'template' as const,
  variables: VARIABLES,
}

function lastState(spy: Mock): EmailSubjectState {
  const call = spy.mock.calls.at(-1)
  return call?.[0] as EmailSubjectState
}

beforeEach(() => {
  // jsdom ne définit PAS `document.execCommand` (aucune implémentation, même
  // partielle) : l'appeler tel quel ferait planter le composant avec une
  // `TypeError`. Un vrai navigateur qui ne prend pas en charge la commande
  // répond par `false` — c'est ce comportement qu'on simule ici pour exercer
  // le chemin de repli `setState` du composant, celui qui tourne réellement
  // dans jsdom (cf. test « insertion à la position du curseur »).
  document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand
})

describe('EmailSubjectLine — ligne affichée', () => {
  it("affiche l'objet interpolé, jamais la source à jetons", () => {
    render(
      <EmailSubjectLine
        {...baseProps}
        subject={null}
        fallbackSubject="Bonjour {{user_first_name}}"
        subjectAdmin={undefined}
        onStateChange={vi.fn()}
      />,
    )
    const lineText = screen.getByTestId('email-subject-line-text')
    expect(lineText).toHaveTextContent('Bonjour Alex')
    expect(lineText.textContent).not.toContain('{{user_first_name}}')
  })
})

describe('EmailSubjectLine — badges', () => {
  it('niveau template, non personnalisé : aucun badge', () => {
    render(
      <EmailSubjectLine {...baseProps} subject={null} onStateChange={vi.fn()} />,
    )
    const line = screen.getByTestId('email-subject-line')
    expect(within(line).queryByText('Personnalisé')).not.toBeInTheDocument()
    expect(within(line).queryByText('Hérité du modèle')).not.toBeInTheDocument()
  })

  it('niveau template, personnalisé : badge « Personnalisé »', () => {
    render(
      <EmailSubjectLine
        {...baseProps}
        subject="Objet totalement personnalisé"
        onStateChange={vi.fn()}
      />,
    )
    const line = screen.getByTestId('email-subject-line')
    expect(within(line).getByText('Personnalisé')).toBeInTheDocument()
  })

  it('niveau event, non personnalisé : badge « Hérité du modèle »', () => {
    render(
      <EmailSubjectLine
        {...baseProps}
        level="event"
        subject={null}
        onStateChange={vi.fn()}
      />,
    )
    const line = screen.getByTestId('email-subject-line')
    expect(within(line).getByText('Hérité du modèle')).toBeInTheDocument()
  })
})

describe('EmailSubjectLine — niveau event non personnalisé', () => {
  it('le popover montre du texte et « Personnaliser », pas de champ ni de bouton variable ; le clic fait apparaître le champ', async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine
        {...baseProps}
        level="event"
        subject={null}
        onStateChange={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('email-subject-line'))

    expect(screen.getByTestId('email-subject-inherited')).toBeInTheDocument()
    expect(screen.queryByTestId('email-subject-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('email-subject-variable-trigger')).not.toBeInTheDocument()
    const customizeBtn = screen.getByTestId('email-subject-customize-btn')
    expect(customizeBtn).toBeInTheDocument()

    await user.click(customizeBtn)

    expect(screen.getByTestId('email-subject-input')).toBeInTheDocument()
  })
})

describe('EmailSubjectLine — persistance du brouillon', () => {
  it('le brouillon survit à la fermeture du popover (état hissé hors de PopoverContent)', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <div data-testid="outside-target" style={{ width: 200, height: 200 }} />
        <EmailSubjectLine {...baseProps} subject={null} onStateChange={vi.fn()} />
      </div>,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    const input = screen.getByTestId('email-subject-input')
    await user.clear(input)
    await user.type(input, 'Brouillon non enregistré')

    await user.click(screen.getByTestId('outside-target'))
    expect(screen.queryByTestId('email-subject-popover')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('email-subject-line'))
    const reopenedInput = screen.getByTestId('email-subject-input') as HTMLInputElement
    expect(reopenedInput.value).toBe('Brouillon non enregistré')
  })
})

describe('EmailSubjectLine — retour au fallback', () => {
  it('un brouillon ramené à l\u2019identique du fallback remonte payload.subject === null, pas la chaîne', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()
    render(
      <EmailSubjectLine
        {...baseProps}
        subject="Un objet personnalisé bien différent"
        onStateChange={onStateChange}
      />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    const input = screen.getByTestId('email-subject-input')
    await user.clear(input)
    await user.type(input, FALLBACK_SUBJECT)

    const state = lastState(onStateChange)
    expect(state.payload).toHaveProperty('subject', null)
    expect(state.dirty).toBe(true)
  })
})

describe('EmailSubjectLine — état remonté', () => {
  it('dirty:false et blockReason:null au montage tant que rien n\u2019a changé', () => {
    const onStateChange = vi.fn()
    render(
      <EmailSubjectLine {...baseProps} subject={null} onStateChange={onStateChange} />,
    )
    const mountState = onStateChange.mock.calls[0][0] as EmailSubjectState
    expect(mountState.dirty).toBe(false)
    expect(mountState.blockReason).toBeNull()
  })

  it('remonte un blockReason nommant le jeton interdit après une frappe', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()
    render(
      <EmailSubjectLine {...baseProps} subject={null} onStateChange={onStateChange} />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    const input = screen.getByTestId('email-subject-input')

    // Contient des accolades : `fireEvent` via `userEvent.type` réserverait
    // `{…}` aux touches spéciales, donc on pose la valeur directement, comme
    // le ferait n'importe quel changement contrôlé.
    fireEvent.change(input, {
      target: { value: `${FALLBACK_SUBJECT} {{jeton_interdit}}` },
    })

    const state = lastState(onStateChange)
    expect(state.blockReason).toContain('{{jeton_interdit}}')
  })
})

describe('EmailSubjectLine — Échap dans le popover', () => {
  it("ferme le popover sans propager l'événement (preventDefault posé par le composant)", async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine {...baseProps} subject={null} onStateChange={vi.fn()} />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    expect(screen.getByTestId('email-subject-popover')).toBeInTheDocument()

    const seen: KeyboardEvent[] = []
    const capture = (event: KeyboardEvent) => seen.push(event)
    // Écoute en phase de bulles : le `onEscapeKeyDown` de Radix tourne en
    // phase de capture, donc `defaultPrevented` est déjà posé quand cet
    // écouteur reçoit l'événement — exactement ce qu'observerait un Dialog
    // parent plus haut dans l'arbre.
    document.addEventListener('keydown', capture)
    try {
      await user.keyboard('{Escape}')
    } finally {
      document.removeEventListener('keydown', capture)
    }

    expect(screen.queryByTestId('email-subject-popover')).not.toBeInTheDocument()
    const escapeEvent = seen.find((event) => event.key === 'Escape')
    expect(escapeEvent?.defaultPrevented).toBe(true)
  })
})

describe('EmailSubjectLine — insertion de variable', () => {
  it('insère le jeton à la position du curseur, pas en fin de champ', async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine
        {...baseProps}
        subject="AB CD"
        onStateChange={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    const input = screen.getByTestId('email-subject-input') as HTMLInputElement
    expect(input.value).toBe('AB CD')

    // Curseur juste après "AB", avant l'espace.
    input.focus()
    input.setSelectionRange(2, 2)

    await user.click(screen.getByTestId('email-subject-variable-trigger'))
    await user.click(screen.getByTestId('email-subject-variable-event_name'))

    expect(input.value).toBe('AB{{event_name}} CD')
  })
})

describe('EmailSubjectLine — magic_link_login (variante admin)', () => {
  it('sans fallbackSubjectAdmin, pas de sélecteur de variante', async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine {...baseProps} subject={null} onStateChange={vi.fn()} />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    expect(screen.queryByTestId('email-subject-variant-toggle')).not.toBeInTheDocument()
  })

  it('avec fallbackSubjectAdmin, le sélecteur bascule le champ entre deux brouillons indépendants', async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine
        fallbackSubject="Connexion à TimePick"
        level="template"
        subject={null}
        subjectAdmin={null}
        fallbackSubjectAdmin="Connexion à l'administration TimePick"
        variables={VARIABLES}
        onStateChange={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    expect(screen.getByTestId('email-subject-variant-toggle')).toBeInTheDocument()

    const input = screen.getByTestId('email-subject-input') as HTMLInputElement
    expect(input.value).toBe('Connexion à TimePick')

    await user.clear(input)
    await user.type(input, 'Connexion Membre Modifiée')
    expect(input.value).toBe('Connexion Membre Modifiée')

    await user.click(screen.getByText('Administrateur'))
    expect(input.value).toBe("Connexion à l'administration TimePick")

    await user.clear(input)
    await user.type(input, 'Connexion Admin Modifiée')
    expect(input.value).toBe('Connexion Admin Modifiée')

    // Retour au membre : le brouillon membre n'a pas bougé pendant l'édition
    // de la variante admin.
    await user.click(screen.getByText('Membre'))
    expect(input.value).toBe('Connexion Membre Modifiée')
  })
})

describe('EmailSubjectLine — aperçu mononyme', () => {
  // Jeu dédié : contrairement à `VARIABLES`, il porte les trois jetons de nom
  // avec des valeurs de démonstration non vides des deux côtés, pour pouvoir
  // distinguer l'aperçu normal de l'aperçu mononyme.
  const NAME_VARIABLES: SubjectVariable[] = [
    { name: 'event_name', label: "Nom de l'événement", previewValue: 'Kermesse de printemps' },
    { name: 'user_first_name', label: 'Prénom', previewValue: 'Alex' },
    { name: 'user_last_name', label: 'Nom de famille', previewValue: 'Dupont' },
    { name: 'user_full_name', label: 'Nom complet', previewValue: 'Alex Dupont' },
  ]

  it("absent quand l'objet ne dépend d'aucun jeton de nom", async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine
        {...baseProps}
        variables={NAME_VARIABLES}
        subject="Invitation - {{event_name}}"
        onStateChange={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    expect(screen.queryByTestId('email-subject-mononym-preview')).not.toBeInTheDocument()
  })

  it('présent avec {{user_full_name}} : ne montre que le prénom, jamais le nom de famille de démonstration', async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine
        {...baseProps}
        variables={NAME_VARIABLES}
        subject="Bonjour {{user_full_name}}"
        onStateChange={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    const preview = screen.getByTestId('email-subject-mononym-preview')
    expect(preview.textContent).toContain('Alex')
    expect(preview.textContent).not.toContain('Dupont')
  })

  it("objet réduit à {{user_last_name}} : annonce que l'objet part vide et retombe sur l'objet par défaut", async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine
        {...baseProps}
        variables={NAME_VARIABLES}
        subject="{{user_last_name}}"
        onStateChange={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    const preview = screen.getByTestId('email-subject-mononym-preview')
    expect(preview.textContent).toContain(
      "l'objet part vide et retombe sur l'objet par défaut.",
    )
  })

  it('se recalcule à la frappe', async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine
        {...baseProps}
        variables={NAME_VARIABLES}
        subject="Invitation - {{event_name}}"
        onStateChange={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    expect(screen.queryByTestId('email-subject-mononym-preview')).not.toBeInTheDocument()

    const input = screen.getByTestId('email-subject-input')
    // Contient des accolades : posé directement comme ailleurs dans ce
    // fichier pour éviter la syntaxe spéciale `{…}` de `userEvent.type`.
    fireEvent.change(input, { target: { value: 'Bonjour {{user_full_name}}' } })

    const preview = screen.getByTestId('email-subject-mononym-preview')
    expect(preview.textContent).toContain('Alex')
  })
})

describe('EmailSubjectLine — infobulle du texte tronqué', () => {
  it("le texte de la ligne porte un `title` égal à ce qui est affiché ; le bouton conteneur ne porte ni `title` ni `aria-label`", () => {
    render(
      <EmailSubjectLine
        {...baseProps}
        subject={null}
        fallbackSubject="Bonjour {{user_first_name}}"
        onStateChange={vi.fn()}
      />,
    )
    const lineText = screen.getByTestId('email-subject-line-text')
    expect(lineText).toHaveAttribute('title', 'Bonjour Alex')

    const line = screen.getByTestId('email-subject-line')
    expect(line).not.toHaveAttribute('title')
    expect(line).not.toHaveAttribute('aria-label')
  })
})

describe('EmailSubjectLine — compteur de caractères', () => {
  it('reflète la longueur NORMALISÉE, pas la longueur brute de la saisie', async () => {
    const user = userEvent.setup()
    render(
      <EmailSubjectLine {...baseProps} subject={null} onStateChange={vi.fn()} />,
    )
    await user.click(screen.getByTestId('email-subject-line'))
    const input = screen.getByTestId('email-subject-input')

    // Trois NUL consécutifs se rabattent sur UN espace après normalisation :
    // brut = 12 caractères, normalisé = 10. Si le compteur lisait la saisie
    // brute, il afficherait 12.
    fireEvent.change(input, { target: { value: 'Test\u0000\u0000\u0000Objet' } })

    const help = screen.getByTestId('email-subject-help')
    expect(within(help).getByText('10 caractères')).toBeInTheDocument()
    expect(within(help).queryByText('12 caractères')).not.toBeInTheDocument()
  })
})
