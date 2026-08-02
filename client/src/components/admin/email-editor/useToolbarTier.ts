import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Les tenues de la barre d'outils de l'éditeur d'e-mails, DE LA PLUS LISIBLE À
 * LA MOINS LISIBLE. L'ordre n'est pas décoratif : c'est lui que la décision
 * parcourt, et il EST la règle.
 *
 * `resserre` a été inséré après la relecture d'écran du 2026-08-01 : la marche
 * `court` → `icones` abandonnait jusqu'à 434 px d'un coup sur la barre la plus
 * chargée, soit 51 % de sa largeur à l'instant précis où elle déclarait manquer
 * de place. Ce palier ne concède que la VALEUR du sélecteur de modèle — 138,5 px
 * sur la barre système — et laisse tous les boutons avec leurs mots.
 *
 * Il ne coupe la marche que sur les deux barres générales : celle d'un événement
 * n'a pas de sélecteur, donc rien à concéder entre ses libellés courts et ses
 * icônes. Ce résidu est la RÈGLE DE COHÉRENCE elle-même — si un palier met les
 * libellés en icônes, il les met TOUS en icônes — et non un défaut de
 * granularité : le fractionner rendrait son mot à « Enregistrer » au milieu de
 * quatre icônes, l'incohérence que ce chantier a précisément supprimée.
 */
const TOOLBAR_TIERS = ['entier', 'court', 'resserre', 'icones'] as const

type ToolbarTier = (typeof TOOLBAR_TIERS)[number]

/**
 * Plafond de largeur du titre PENDANT LA MESURE, par palier.
 *
 * Il ne sert qu'à borner la taille hypothétique du titre dans la décision : sans
 * lui, un nom d'événement de 200 caractères ouvre une ligne à lui seul et la
 * barre se rompt à toute largeur. En rendu, le plafond réellement appliqué est
 * celui-ci PLUS tout le mou qui reste — voir `--tp-toolbar-title-max`.
 */
const TITLE_CAP_PX: Record<ToolbarTier, number> = {
  entier: 256,
  court: 256,
  resserre: 256,
  icones: 160,
}

/**
 * Propriété personnalisée qui porte le plafond de largeur du titre. Le composant
 * la consomme en `max-w-[var(…)]` ; ce hook est seul à l'écrire.
 */
const TITLE_MAX_VAR = '--tp-toolbar-title-max'

/**
 * Le plafond de MESURE du palier retenu, publié tel quel.
 *
 * Rien dans le rendu ne le consomme : il existe pour que la garde de la barre
 * puisse reconstituer le besoin réel d'un palier. Depuis que le titre absorbe le
 * mou, la somme des largeurs rendues vaut toujours la largeur de la barre — le
 * mou n'est plus observable, et une garde qui s'y fierait ne prouverait plus
 * rien. C'est une ENTRÉE de la décision (une constante), pas son résultat : la
 * garde continue de vérifier elle-même ce qui tient, par la mise en page.
 */
const TITLE_BASE_VAR = '--tp-toolbar-title-base'

/**
 * Largeur dont la barre a besoin dans un palier donné, bordures et padding
 * compris.
 *
 * C'est la TAILLE INTRINSÈQUE de la barre, lue au lieu d'être resommée : sous
 * `width: max-content`, le moteur de rendu dispose la barre avec une place
 * infinie, donc aucun enfant n'est comprimé et aucun ne revient à la ligne — par
 * définition, pas par précaution. Une première version additionnait à la main
 * largeurs des enfants, gouttières et padding sous une largeur de mesure
 * arbitraire de 10 000 px : même résultat, trois façons de plus de se tromper
 * (une gouttière oubliée, un enfant hors flux compté, une bordure latérale
 * ajoutée un jour à la barre et absente de la somme).
 *
 * Le résultat ne dépend que du couple (contenu, palier) — jamais du palier
 * actuellement affiché. C'est ce qui interdit l'oscillation : il n'y a pas de
 * boucle de rétroaction, donc pas de va-et-vient possible.
 */
function needForTier(bar: HTMLElement, tier: ToolbarTier): number {
  bar.dataset.toolbarTier = tier
  bar.style.setProperty(TITLE_MAX_VAR, `${TITLE_CAP_PX[tier]}px`)
  return bar.getBoundingClientRect().width
}

/**
 * Choisit la tenue de la barre d'outils : **le palier le plus lisible qui
 * tient**, mesuré, jamais deviné.
 *
 * AUCUN SEUIL EN PIXELS. Un seuil unique ne peut pas servir six configurations
 * dont le besoin va de 445 à 1 266 px : la barre la plus légère paierait pour la
 * plus lourde et masquerait ses libellés avec 600 px de vide. C'est le défaut
 * que ce hook existe pour rendre impossible, pas une préférence
 * d'implémentation.
 *
 * Quatre temps, tous avant l'affichage (`useLayoutEffect`) :
 *
 * 1. relever la largeur DISPONIBLE (celle de la barre, qui ne dépend pas du
 *    palier : la barre occupe toute la fenêtre) ;
 * 2. passer la barre en `width: max-content` pour lire des tailles naturelles ;
 * 3. essayer les paliers du plus lisible au moins lisible, retenir le PREMIER
 *    qui tient ;
 * 4. écrire le palier retenu en `data-toolbar-tier`, qui pilote tout le rendu en
 *    CSS, et rendre au titre le mou qui reste.
 *
 * LE TITRE NE PERD QUE CE QU'IL DOIT. Son plafond de mesure (256 px, 160 au
 * palier icônes) borne la taille hypothétique dans la décision ; s'il agissait
 * aussi en rendu, un nom d'événement serait amputé de 144 px pendant que 463 px
 * restent vides sur la même ligne — relevé à l'écran le 2026-08-01, et c'est le
 * défaut d'origine de ce chantier en miniature. Le plafond publié en rendu vaut
 * donc le plafond de mesure PLUS le mou du palier retenu : la troncature ne
 * survient que lorsque la place manque réellement, et elle recule
 * continûment à mesure que la fenêtre s'élargit.
 *
 * Le palier vit dans le DOM et non dans un état React : la décision doit pouvoir
 * poser un palier, mesurer, en poser un autre et ne committer que le gagnant —
 * le tout dans la même passe synchrone. Un état React imposerait un rendu par
 * candidat.
 *
 * ### Pourquoi pas `useCompactMode`
 *
 * `client/src/hooks/useCompactMode.ts` vise le même problème et reste le bon
 * outil pour ses appelants. Il ne convient pas ici, pour trois raisons lisibles
 * dans son code :
 *
 * 1. il est **binaire** — il ne sait pas dire « lequel de quatre » ;
 * 2. il capture la largeur naturelle **une seule fois** et ne la reprend que sur
 *    un `recalibrate()` explicite ; or le contenu de cette barre change en cours
 *    de vie (titre, valeur du sélecteur, apparition et variante du badge,
 *    pastille d'état modifié) — une largeur naturelle figée deviendrait fausse au
 *    premier clic dans le canvas ;
 * 3. il exige `overflow-hidden` + `[contain:inline-size]` sur l'élément mesuré,
 *    deux classes qui ROGNENT — incompatibles avec le `flex-wrap` gardé en
 *    plancher, qui doit pouvoir déborder sur une seconde ligne plutôt qu'être
 *    coupé.
 *
 * Ce qui en est repris : le `ResizeObserver` posé par **callback ref** — la
 * mesure part dès que le nœud s'attache, ce qui compte derrière une garde
 * d'authentification.
 *
 * @param signature Tout ce qui change le CONTENU de la barre sans changer sa
 *   largeur. L'observateur de taille ne peut pas le voir : c'est cette chaîne
 *   qui déclenche la reprise de mesure.
 * @returns La callback ref à poser sur la barre.
 */
export function useToolbarTier(signature: string) {
  const barRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const decide = useCallback(() => {
    const bar = barRef.current
    if (!bar) return

    const available = bar.getBoundingClientRect().width
    // Barre pas encore affichée (ancêtre en `display: none`, ou environnement
    // sans moteur de rendu) : mesurer donnerait 0 et condamnerait la barre au
    // palier le moins lisible. On pose le palier le PLUS lisible et on attend
    // l'observateur — ne rien poser du tout laisserait une tenue hybride, ni
    // entière ni en icônes, puisque les classes de socle diffèrent d'un contrôle
    // à l'autre.
    if (available <= 0) {
      bar.dataset.toolbarTier ??= TOOLBAR_TIERS[0]
      return
    }

    const restore = bar.style.width
    let chosen: ToolbarTier = TOOLBAR_TIERS[TOOLBAR_TIERS.length - 1]
    let need = available
    try {
      bar.style.width = 'max-content'
      for (const tier of TOOLBAR_TIERS) {
        const candidate = needForTier(bar, tier)
        // Comparaison exacte, sans tolérance : la condition de retour à la ligne
        // du moteur de rendu est exactement « besoin > place », aux mêmes
        // sous-pixels. Une tolérance positive ferait tenir un palier qui déborde
        // de 2 px — et 2 px suffisent à renvoyer « Fermer » à la ligne. Aucune
        // tolérance n'est par ailleurs nécessaire contre l'oscillation : la
        // décision est une fonction pure de (largeur, contenu), sans
        // rétroaction.
        if (candidate <= available) {
          chosen = tier
          need = candidate
          break
        }
      }
    } finally {
      // Dans un `finally` : une exception qui laisserait la barre en
      // `max-content` la romprait à l'écran jusqu'à la prochaine mesure réussie.
      bar.style.width = restore
    }

    bar.dataset.toolbarTier = chosen
    bar.style.setProperty(TITLE_BASE_VAR, `${TITLE_CAP_PX[chosen]}px`)
    bar.style.setProperty(
      TITLE_MAX_VAR,
      `${TITLE_CAP_PX[chosen] + Math.max(0, available - need)}px`,
    )
  }, [])

  const ref = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      barRef.current = node
      if (!node) return

      decide()
      // Le nœud SEUL suffit. `useCompactMode` observe aussi le parent parce que
      // ses appelants peuvent masquer l'élément mesuré, ce qui tarit ses propres
      // événements ; cette barre n'est jamais masquée et reste étirée par son
      // parent en colonne, donc sa boîte suit celle du parent au pixel.
      const observer = new ResizeObserver(decide)
      observer.observe(node)
      observerRef.current = observer
    },
    [decide],
  )

  useLayoutEffect(() => {
    decide()
  }, [decide, signature])

  useEffect(() => {
    // Une police qui finit de charger change la largeur de TOUS les libellés
    // sans changer celle de la barre : aucun observateur de taille ne le voit.
    let cancelled = false
    document.fonts?.ready
      .then(() => {
        if (!cancelled) decide()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [decide])

  useEffect(
    () => () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    },
    [],
  )

  return ref
}
