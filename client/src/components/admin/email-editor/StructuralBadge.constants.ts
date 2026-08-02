/**
 * Les deux formulations de chaque état : la longue, et celle des paliers court
 * et icônes de la barre d'outils de l'éditeur.
 *
 * LE BADGE EST RACCOURCI, PAS TRONQUÉ, et ce n'est pas une préférence de style.
 * Le mot qui désambiguïse les deux états est en FIN de chaîne — « …non
 * modifiable ici » contre « …non supprimable ». Une ellipse à droite couperait
 * exactement ce mot et recréerait l'ambiguïté que l'incident du 2026-07-30 a
 * levée. Les deux formes courtes gardent donc leur fin intacte et ne cèdent que
 * la qualification de tête, qui est la partie COMMUNE aux deux et n'apprend
 * donc rien sur l'état.
 *
 * Mesuré le 2026-08-01 : 280,1 → 170,5 px (hérité), 302,1 → 186,9 px
 * (modifiable). Ce badge pèse le plus lourd de la barre après le groupe
 * d'actions : le raccourcir DÈS le palier court fait gagner ~115 px et retarde
 * d'autant le passage aux icônes.
 */
const WORDING = {
  inherited: {
    // « pas encore personnalisé » et NON « non modifiable ici ». Relevé à l'écran
    // le 2026-08-01 : à 60 px sous ce badge, le panneau d'héritage affiche
    // « Cliquez sur “Personnaliser ce bloc” POUR LE MODIFIER ICI » et le bouton
    // qui fait exactement cela. Les mêmes trois mots, niés. Le badge assénait un
    // absolu que le panneau réfutait immédiatement — soit précisément
    // l'ambiguïté que l'incident du 2026-07-30 avait entrepris de lever, recréée
    // par la formulation censée la lever. On énonce donc l'ÉTAT, pas l'interdit :
    // la non-modifiabilité immédiate est déjà portée par le panneau, qui a la
    // place de l'expliquer et l'action pour en sortir.
    long: 'Élément structurel — hérité, pas encore personnalisé ici',
    short: 'Hérité — pas encore personnalisé',
  },
  editable: {
    long: 'Élément structurel — modifiable, non supprimable',
    short: 'Structurel — non supprimable',
  },
} as const

/**
 * Les deux formulations de l'état demandé. Exporté pour la région live de la
 * barre d'outils, qui annonce la forme longue quel que soit le palier affiché :
 * une aide technique n'a pas de raison de recevoir le texte abrégé faute de
 * place à l'écran.
 */
export const structuralBadgeWording = (inherited: boolean) =>
  inherited ? WORDING.inherited : WORDING.editable
