// Event + CreateEventInput + UpdateEventInput — forme wire unifiée (source unique
// @timepick/shared). Historiquement définis ici (extraits du hook useEvents en
// Phase 0) puis le serveur en avait sa propre copie (sans periodStart/periodEnd).
// À présent importés depuis @timepick/shared et ré-exportés pour préserver les
// importateurs (`import type { Event } from '@/types/event'` et le hub
// useEvents.ts). Le serveur garde son interface Event interne (G2 — sans
// periodStart/periodEnd, correct pour les single-event queries).
export type { Event, CreateEventInput, UpdateEventInput } from '@timepick/shared'
