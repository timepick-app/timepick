// Extension globale du type Express.Request.user.
//
// Avant la story 1.4, `declare global { namespace Express.Request.user }` était
// dupliqué à l'identique dans `middleware/auth.middleware.ts` et
// `middleware/adminAuth.ts` (shape `{ userId, role }`). D3 (story 1.4) fusionne
// ces deux déclarations ici en une seule source de vérité et y ajoute
// `hasMemberAccess` (calculé à la volée via `EXISTS(SELECT 1 FROM event_users)`,
// D1 — jamais stocké en DB).
//
// `hasMemberAccess` ne pilote PAS la sécurité (le guard `/me/*` est
// `isAuthenticated`, le guard `/admin/*` est `requireAdmin` côté serveur 403) :
// il n'expose au client qu'un lien de bascule NavUser (D7). Les middlewares
// `requireAuth` / `requireAdmin` / `optionalAuth` re-settent `req.user` à chaque
// requête depuis la DB (le JWT n'est pas trusté pour ce champ, D2/D3).

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        role: string
        hasMemberAccess: boolean
      }
    }
  }
}

export {}
