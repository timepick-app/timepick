/**
 * Garde de parité client ⇄ serveur sur l'interpolation de l'objet.
 *
 * POURQUOI ELLE EXISTE. L'éditeur affiche l'objet interpolé CÔTÉ CLIENT ; c'est
 * une promesse sur la chaîne que le SERVEUR mettra dans l'en-tête. Une promesse
 * fausse est pire que pas d'aperçu — et ce dépôt a déjà payé exactement cette
 * asymétrie : les détecteurs de variables du client toléraient les espaces
 * (`{{ nom }}`) que le serveur, lui, laisse littéraux. L'interface annonçait
 * « reconnu » et l'e-mail partait avec les accolades visibles.
 *
 * Ce test importe LES DEUX implémentations et les compare sur un jeu de cas
 * figé. Même motif que la garde SSOT de la coque d'usine : franchir la
 * frontière des workspaces dans le test est le seul moyen de la verrouiller.
 *
 * CE QUI N'EST PAS COUVERT, et c'est délibéré : un jeton qui appartient à
 * l'alphabet du moteur (les 6 clés) mais PAS à la liste du modèle courant. Le
 * serveur le remplace par du vide, le client le laisse littéral. Ce cas est
 * inatteignable pour un objet persisté — la validation le refuse à l'écriture —
 * et pendant la frappe la ligne affiche le motif de refus, pas l'aperçu.
 */

import { substituteSubjectVariables, type VariablesPayload } from '../../services/mjml-compile.service'
import { normalizeSubject as normalizeServer } from '../../lib/email-subject'
import {
  interpolateSubject,
  normalizeSubject as normalizeClient,
  type SubjectVariable,
} from '../../../../client/src/lib/email-subject'

/** Les valeurs de démonstration, dans les deux formes que chaque côté attend. */
const DEMO: Record<string, string> = {
  event_name: 'Réunion de présentation',
  slot_date: 'lundi 4 août 2026',
  slot_time: '14h00',
  user_first_name: 'Camille',
  user_last_name: 'Martin',
  user_full_name: 'Camille Martin',
}

function variablesFrom(values: Record<string, string>): SubjectVariable[] {
  return Object.entries(values).map(([name, previewValue]) => ({
    name,
    label: name,
    previewValue,
  }))
}

/** Ce que le serveur produit réellement au moment de l'envoi. */
function serverSubject(source: string, values: Record<string, string>): string {
  return normalizeServer(substituteSubjectVariables(source, values as VariablesPayload))
}

const CASES: { name: string; source: string; values?: Record<string, string> }[] = [
  { name: 'texte sans aucun jeton', source: 'Bienvenue sur TimePick' },
  { name: 'un jeton connu', source: 'Inscription participation - {{event_name}}' },
  {
    name: 'plusieurs jetons, dont un nom',
    source: 'Venez à {{event_name}}, {{user_full_name}} — le {{slot_date}}',
  },
  { name: 'le même jeton deux fois', source: '{{event_name}} : {{event_name}}' },
  {
    name: 'jeton avec espaces intérieurs — littéral des DEUX côtés',
    source: 'Venez à {{ event_name }} !',
  },
  { name: 'jeton inconnu — littéral des DEUX côtés', source: 'Bonjour {{prenom}}' },
  { name: 'accolades non fermées', source: 'Reste {{event_name littéral' },
  {
    name: 'valeur contenant $& et $1 — non-régression F16',
    source: 'Offre {{event_name}} !',
    values: { ...DEMO, event_name: "Pay $50 $& $1 $' $$" },
  },
  {
    name: 'valeur vide (mononyme) — les deux produisent du vide',
    source: 'Bonjour {{user_last_name}}, à bientôt',
    values: { ...DEMO, user_last_name: '' },
  },
  {
    name: 'objet réduit à un jeton vide',
    source: '{{user_last_name}}',
    values: { ...DEMO, user_last_name: '' },
  },
  {
    name: 'blancs multiples, tabulations et retours à la ligne',
    source: '  Venez\t\tà   {{event_name}}\n\npour de vrai  ',
  },
  {
    name: 'caractères de contrôle et de format dans la source — NUL/BEL/ESC/NEL/zero-width/bidi',
    source: 'Invitation\u0000\u0007\u001b\u0085\u200b\u202e{{event_name}}',
  },
]

describe('parité client ⇄ serveur — interpolation de l’objet', () => {
  it.each(CASES)('$name', ({ source, values }) => {
    const resolved = values ?? DEMO
    expect(interpolateSubject(source, variablesFrom(resolved))).toBe(
      serverSubject(source, resolved),
    )
  })

  // Le nettoyage est le second membre du contrat : le compteur de caractères de
  // l'éditeur annonce la longueur RÉELLEMENT stockée, ce qui n'est vrai que si
  // les deux normalisations sont la même fonction.
  it.each([
    '   ',
    'un   deux',
    '\tavant\napres\r\n',
    ' bord ',
    'déjà propre',
    '',
  ])('normalisation identique des deux côtés : %j', (raw) => {
    expect(normalizeClient(raw)).toBe(normalizeServer(raw))
  })
})
