import { describe, it, expect } from 'vitest'
import { computeOnboardingState } from '../onboarding'

describe('computeOnboardingState', () => {
  it("L'ordre des steps est toujours [members, event, invites]", () => {
    const steps = computeOnboardingState({ memberCount: 0, eventCount: 0, invitationsSent: 0 })
    expect(steps[0].key).toBe('members')
    expect(steps[1].key).toBe('event')
    expect(steps[2].key).toBe('invites')
  })

  it('(0,0,0) → members active, event todo, invites todo', () => {
    const steps = computeOnboardingState({ memberCount: 0, eventCount: 0, invitationsSent: 0 })
    expect(steps[0]).toEqual({ key: 'members', state: 'active', count: 0 })
    expect(steps[1]).toEqual({ key: 'event', state: 'todo', count: 0 })
    expect(steps[2]).toEqual({ key: 'invites', state: 'todo', count: 0 })
  })

  it('(40,0,0) → members done (count 40), event active, invites todo', () => {
    const steps = computeOnboardingState({ memberCount: 40, eventCount: 0, invitationsSent: 0 })
    expect(steps[0]).toEqual({ key: 'members', state: 'done', count: 40 })
    expect(steps[1]).toEqual({ key: 'event', state: 'active', count: 0 })
    expect(steps[2]).toEqual({ key: 'invites', state: 'todo', count: 0 })
  })

  it('(40,3,0) → members done, event done (count 3), invites active', () => {
    const steps = computeOnboardingState({ memberCount: 40, eventCount: 3, invitationsSent: 0 })
    expect(steps[0]).toEqual({ key: 'members', state: 'done', count: 40 })
    expect(steps[1]).toEqual({ key: 'event', state: 'done', count: 3 })
    expect(steps[2]).toEqual({ key: 'invites', state: 'active', count: 0 })
  })

  it('(40,3,120) → tous done', () => {
    const steps = computeOnboardingState({ memberCount: 40, eventCount: 3, invitationsSent: 120 })
    expect(steps[0]).toEqual({ key: 'members', state: 'done', count: 40 })
    expect(steps[1]).toEqual({ key: 'event', state: 'done', count: 3 })
    expect(steps[2]).toEqual({ key: 'invites', state: 'done', count: 120 })
  })

  it('première étape non faite = active, les suivantes incomplètes = todo', () => {
    const steps = computeOnboardingState({ memberCount: 5, eventCount: 2, invitationsSent: 0 })
    expect(steps[0].state).toBe('done')
    expect(steps[1].state).toBe('done')
    expect(steps[2].state).toBe('active')
  })

  it('count reflète le compteur réel pour chaque step quel que soit son state', () => {
    const steps = computeOnboardingState({ memberCount: 7, eventCount: 0, invitationsSent: 99 })
    expect(steps[0].count).toBe(7)
    expect(steps[1].count).toBe(0)
    expect(steps[2].count).toBe(99)
  })

  it("régression (0,1,0) : un retour arrière sur ① ne dé-fait pas ② (l'événement reste done)", () => {
    const steps = computeOnboardingState({ memberCount: 0, eventCount: 1, invitationsSent: 0 })
    expect(steps[0]).toEqual({ key: 'members', state: 'active', count: 0 })
    expect(steps[1]).toEqual({ key: 'event', state: 'done', count: 1 })
    expect(steps[2]).toEqual({ key: 'invites', state: 'todo', count: 0 })
  })
})
