import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EmailVariablesHelp } from '../EmailVariablesHelp'
import {
  describeEmailVariables,
  INVITATION_VARIABLE_HELP,
} from '../../../lib/email-template-constants'
import { SYSTEM_TEMPLATE_VARIABLE_HELP } from '../../../lib/email-system-template-constants'

describe('EmailVariablesHelp', () => {
  it('rend le titre et chaque token au format {{name}} avec sa description', () => {
    render(
      <EmailVariablesHelp variables={SYSTEM_TEMPLATE_VARIABLE_HELP.magic_link_login} />,
    )

    expect(screen.getByText('Variables disponibles')).toBeInTheDocument()
    expect(screen.getByText('{{magic_link}}')).toBeInTheDocument()
    expect(screen.getByText('{{expiration_date}}')).toBeInTheDocument()
    expect(
      screen.getByText(/Date et heure d'expiration du lien/),
    ).toBeInTheDocument()
  })

  it('rend les variables propres à la confirmation de réservation', () => {
    render(
      <EmailVariablesHelp
        variables={SYSTEM_TEMPLATE_VARIABLE_HELP.reservation_confirmation}
      />,
    )

    expect(screen.getByText('{{event_name}}')).toBeInTheDocument()
    expect(screen.getByText('{{slot_date}}')).toBeInTheDocument()
    expect(screen.getByText('{{slot_time}}')).toBeInTheDocument()
    expect(screen.getByText('{{calendar_url}}')).toBeInTheDocument()
  })

  it('rend les variables de l\u2019invitation', () => {
    render(<EmailVariablesHelp variables={INVITATION_VARIABLE_HELP} />)

    expect(screen.getByText('{{event_name}}')).toBeInTheDocument()
    expect(screen.getByText('{{event_description}}')).toBeInTheDocument()
    expect(screen.getByText('{{magic_link}}')).toBeInTheDocument()
    expect(screen.getByText('{{expiration_date}}')).toBeInTheDocument()
  })

  it('accepte un data-testid personnalisé', () => {
    render(
      <EmailVariablesHelp
        variables={INVITATION_VARIABLE_HELP}
        data-testid="invitation-template-variables"
      />,
    )

    expect(
      screen.getByTestId('invitation-template-variables'),
    ).toBeInTheDocument()
  })

  it('ne rend rien quand la liste est vide', () => {
    const { container } = render(
      <EmailVariablesHelp variables={describeEmailVariables([])} />,
    )

    expect(container.firstChild).toBeNull()
  })
})
