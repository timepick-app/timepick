/**
 * Fragments SQL partagés autour des créneaux (`slots`).
 *
 * Centralise les bouts de requête réutilisés par plusieurs surfaces afin
 * d'éviter la divergence silencieuse (ex. correction côté public oubliée côté
 * admin).
 */

/**
 * Sous-requête corrélée agrégeant les réservants d'un créneau en `json_agg`.
 *
 * **Pré-requis** : la requête englobante DOIT exposer la table `slots` sous
 * l'alias `s` (le fragment référence `s.id`).
 *
 * Le nom est composé côté SQL via `CONCAT(first_name, last_name)` trimé ;
 * `NULLIF(…, '')` renvoie `null` si les deux champs sont vides (cas théorique :
 * `first_name` est requis côté Zod). `json_agg` renvoie `NULL` (et non `[]`)
 * lorsqu'aucune réservation n'existe — le client traite `null`/`[]`/absent de
 * façon identique (aucune section de noms).
 *
 * Clés `id`/`name` déjà camelCase → traversent `snakeToCamelMiddleware` sans
 * transformation.
 */
export const VOLUNTEERS_AGG_FRAGMENT = `(
    SELECT json_agg(json_build_object(
      'id', u.id,
      'name', NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')
    ))
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    WHERE b.slot_id = s.id
  ) AS volunteers`
