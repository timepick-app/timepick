/** Logique d'état pure pour le guide d'onboarding du tableau de bord admin. Zéro import React. */

type OnboardingStepKey = 'members' | 'event' | 'invites'
type OnboardingStepState = 'done' | 'active' | 'todo'

export interface OnboardingStep {
  key: OnboardingStepKey
  state: OnboardingStepState
  count: number
}

export interface OnboardingCounts {
  memberCount: number
  eventCount: number
  invitationsSent: number
}

/**
 * Calcule l'état complet du guide d'onboarding à partir des compteurs réels.
 *
 * Règle : chaque étape est « faite » dès que SON propre compteur ≥ 1 (état indépendant des
 * autres). Un retour en arrière sur une étape antérieure (ex. suppression de membres) ne
 * « dé-fait » donc pas une étape déjà accomplie — on ne ment jamais sur l'état réel.
 * `activeIndex` = première étape encore incomplète = repère focal ('active') ; les autres
 * étapes incomplètes sont 'todo'.
 */
export function computeOnboardingState(counts: OnboardingCounts): OnboardingStep[] {
  const { memberCount, eventCount, invitationsSent } = counts

  const counters: [OnboardingStepKey, number][] = [
    ['members', memberCount],
    ['event', eventCount],
    ['invites', invitationsSent],
  ]

  const activeIndex = counters.findIndex(([, c]) => c < 1)

  const steps: OnboardingStep[] = counters.map(([key, count], index) => {
    const state: OnboardingStepState =
      count >= 1 ? 'done' : index === activeIndex ? 'active' : 'todo'
    return { key, state, count }
  })

  return steps
}
