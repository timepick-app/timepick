/**
 * Contrat partagé entre le service de notification, le formatage email et les tests.
 * Comparaison des horaires via .getTime() (les appelants réels passent des Date pg).
 * null ≡ '' pour description (les deux signifient « pas de description »).
 */

export type WatchedField = 'start_time' | 'end_time' | 'description'

export interface SlotSnapshot {
  readonly start_time: Date
  readonly end_time: Date
  readonly description: string | null
}

export interface SlotDiff {
  readonly fields: readonly WatchedField[]
  before: SlotSnapshot
  after: SlotSnapshot
}

export function computeSlotDiff(before: SlotSnapshot, after: SlotSnapshot): SlotDiff {
  const fields: WatchedField[] = []

  if (before.start_time.getTime() !== after.start_time.getTime()) {
    fields.push('start_time')
  }
  if (before.end_time.getTime() !== after.end_time.getTime()) {
    fields.push('end_time')
  }
  if ((before.description ?? '') !== (after.description ?? '')) {
    fields.push('description')
  }

  return {
    fields,
    before: {
      start_time: before.start_time,
      end_time: before.end_time,
      description: before.description,
    },
    after: {
      start_time: after.start_time,
      end_time: after.end_time,
      description: after.description,
    },
  }
}
