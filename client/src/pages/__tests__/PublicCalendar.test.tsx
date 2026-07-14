import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PublicCalendar } from '../PublicCalendar'

// useAuth est la seule dépendance de la garde — on la mocke pour piloter l'état
// d'authentification. Navigate/Routes viennent du vrai react-router-dom (jsdom).
const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: true,
  user: null as { role: 'admin' | 'user' } | null,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    user: authState.user,
  }),
}))

// EventCalendarContent est remplacé par un stub minimal pour isoler la garde.
vi.mock('@/components/public', () => ({
  EventCalendarContent: () => <div data-testid="event-calendar-content" />,
}))

/**
 * Monte PublicCalendar sur /events/:uuid avec une route sentinelle /me/events/:uuid
 * permettant de vérifier les redirections membres.
 */
function renderPublicCalendar(uuid: string = 'EVT') {
  return render(
    <MemoryRouter initialEntries={[`/events/${uuid}`]}>
      <Routes>
        <Route path="/events/:uuid" element={<PublicCalendar />} />
        <Route
          path="/me/events/:uuid"
          element={<div data-testid="member-event-page" />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublicCalendar — garde de redirection', () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.isLoading = true
    authState.user = null
  })

  it('isLoading:true → retourne null (pas de flash, aucun contenu rendu)', () => {
    authState.isLoading = true
    renderPublicCalendar()
    expect(screen.queryByTestId('event-calendar-content')).toBeNull()
    expect(screen.queryByTestId('member-event-page')).toBeNull()
  })

  it('non authentifié → rend EventCalendarContent (page publique)', () => {
    authState.isLoading = false
    authState.isAuthenticated = false
    authState.user = null
    renderPublicCalendar()
    expect(screen.getByTestId('event-calendar-content')).toBeInTheDocument()
    expect(screen.queryByTestId('member-event-page')).toBeNull()
  })

  it('membre (role:user) → redirige vers /me/events/:uuid', () => {
    authState.isLoading = false
    authState.isAuthenticated = true
    authState.user = { role: 'user' }
    renderPublicCalendar('EVT')
    expect(screen.getByTestId('member-event-page')).toBeInTheDocument()
    expect(screen.queryByTestId('event-calendar-content')).toBeNull()
  })

  it('admin (role:admin) → rend EventCalendarContent (aperçu de contrôle)', () => {
    authState.isLoading = false
    authState.isAuthenticated = true
    authState.user = { role: 'admin' }
    renderPublicCalendar()
    expect(screen.getByTestId('event-calendar-content')).toBeInTheDocument()
    expect(screen.queryByTestId('member-event-page')).toBeNull()
  })
})
