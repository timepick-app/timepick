import {
  findUnsafeBodyConstruct,
  assertSafeEmailBody,
} from '../../validators/email-body-content.validator'
import { ValidationError } from '../../errors/ValidationError'
import { ERROR_CODES } from '@timepick/shared'

/**
 * Garde de contenu du corps d'e-mail — surface d'écriture des deux flux jumeaux.
 *
 * Deux familles d'assertions, et la seconde compte autant que la première :
 *   1. les constructions qui contournent le sanitiseur de sortie ou qui exécutent
 *      sont refusées ;
 *   2. les formes légitimes réellement présentes dans les corps d'usine et dans
 *      la prose des modèles passent — un garde qui refuse un corps existant est
 *      une régression silencieuse au prochain enregistrement.
 */
describe('email-body-content.validator', () => {
  describe('commentaires — la règle qui ferme le contournement', () => {
    // Le sanitiseur de sortie ne parse pas les nœuds commentaires ; Outlook pour
    // Windows, lui, interprète les commentaires conditionnels. Tout ce que la
    // liste d'éléments interdits retire passerait donc, pour ce client-là.
    it('refuse un commentaire conditionnel transportant un <script>', () => {
      expect(
        findUnsafeBodyConstruct(
          '<mj-section><mj-column><mj-raw><!--[if mso]><script>alert(1)</script><![endif]--></mj-raw></mj-column></mj-section>',
        ),
      ).toBe('comment-markup')
    })

    it('refuse un commentaire conditionnel transportant des balises de tableau', () => {
      expect(
        findUnsafeBodyConstruct(
          '<mj-raw><!--[if mso | IE]><table role="presentation"><tr><td><![endif]--></mj-raw>',
        ),
      ).toBe('comment-markup')
    })

    it('refuse la forme downlevel-revealed (commentaire ouvert puis refermé plus loin)', () => {
      expect(
        findUnsafeBodyConstruct('<mj-raw><!--[if !mso]><!--><div>x</div><!--<![endif]--></mj-raw>'),
      ).toBe('comment-markup')
    })

    it('refuse un commentaire conditionnel même sans balise dans sa charge — `<![endif]` suffit', () => {
      // Conséquence voulue de la règle « aucun `<` dans un commentaire » : elle
      // couvre TOUS les commentaires conditionnels sans avoir à les énumérer.
      expect(findUnsafeBodyConstruct('<mj-raw><!--[if mso]>texte<![endif]--></mj-raw>')).toBe(
        'comment-markup',
      )
    })

    it('refuse un commentaire jamais refermé', () => {
      expect(findUnsafeBodyConstruct('<mj-section><!-- ouvert et jamais fermé')).toBe(
        'comment-unterminated',
      )
    })

    it('accepte les marqueurs structurels de l\u2019éditeur', () => {
      // Forme d'usine du corps d'invitation : ces deux marqueurs sont présents
      // dans les corps stockés depuis la migration de la coque « carte ».
      expect(
        findUnsafeBodyConstruct(
          '<!-- BODY:START --><mj-section><mj-text>ok</mj-text></mj-section><!-- BODY:END -->',
        ),
      ).toBeNull()
    })

    it('accepte les marqueurs de zones des modèles système', () => {
      expect(
        findUnsafeBodyConstruct(
          '<mj-section><mj-column><!-- INTRO:START --><mj-text>Bonjour</mj-text><!-- INTRO:END --><!-- SIG:START --><mj-text>Merci</mj-text><!-- SIG:END --></mj-column></mj-section>',
        ),
      ).toBeNull()
    })

    it('accepte un commentaire de prose sans balisage', () => {
      expect(
        findUnsafeBodyConstruct('<!-- note interne --><mj-section><mj-text>x</mj-text></mj-section>'),
      ).toBeNull()
    })
  })

  describe('vecteurs exécutables', () => {
    it.each([
      ['balise script', '<mj-raw><script>alert(1)</script></mj-raw>', 'forbidden-tag'],
      ['balise script en capitales', '<mj-raw><SCRIPT>alert(1)</SCRIPT></mj-raw>', 'forbidden-tag'],
      ['iframe', '<mj-raw><iframe src="https://x.test"></iframe></mj-raw>', 'forbidden-tag'],
      ['formulaire', '<mj-raw><form action="https://x.test"></form></mj-raw>', 'forbidden-tag'],
      [
        'gestionnaire d\u2019événement',
        '<mj-raw><img src="https://x.test/a.png" onerror="alert(1)"></mj-raw>',
        'handler-attribute',
      ],
      [
        'gestionnaire sans guillemets',
        '<mj-raw><img src=x onerror=alert(1)></mj-raw>',
        'handler-attribute',
      ],
      [
        'gestionnaire après un saut de ligne',
        '<mj-raw><img\n  onclick="x"\n  src="https://x.test/a.png"></mj-raw>',
        'handler-attribute',
      ],
      ['URI javascript:', '<mj-text><a href="javascript:alert(1)">x</a></mj-text>', 'script-uri'],
      ['URI vbscript:', '<mj-text><a href="vbscript:msgbox(1)">x</a></mj-text>', 'script-uri'],
    ])('refuse %s', (_label, body, expected) => {
      expect(findUnsafeBodyConstruct(body)).toBe(expected)
    })

    it('voit un gestionnaire caché derrière un `>` dans une valeur d\u2019attribut', () => {
      // Un découpage naïf des balises sur le `>` scinderait `alt=">"` et laisserait
      // `onerror=` hors de toute balise reconnue.
      expect(findUnsafeBodyConstruct('<mj-raw><img alt=">" onerror="alert(1)"></mj-raw>')).toBe(
        'handler-attribute',
      )
    })
  })

  describe('prose affichée — aucun refus sur du texte', () => {
    it.each([
      ['une prose contenant « once= »', '<mj-text>Le tarif once=2 est un exemple</mj-text>'],
      ['une prose citant javascript:', '<mj-text>Le protocole javascript: est bloqué</mj-text>'],
      ['une prose citant un script', '<mj-text>Nous parlons ici de script, pas de code</mj-text>'],
    ])('accepte %s', (_label, body) => {
      expect(findUnsafeBodyConstruct(body)).toBeNull()
    })

    it('accepte du HTML brut légitime dans un mj-raw', () => {
      expect(
        findUnsafeBodyConstruct('<mj-raw><div style="color:#333">bonjour</div></mj-raw>'),
      ).toBeNull()
    })

    it('accepte les variables de substitution et les entités', () => {
      expect(
        findUnsafeBodyConstruct(
          '<mj-section><mj-column><mj-text>Bonjour {{user_first_name}},<br/>Tarif &lt; 10 &amp; plus</mj-text><mj-button href="{{magic_link}}">Réserver</mj-button></mj-column></mj-section>',
        ),
      ).toBeNull()
    })
  })

  /**
   * Écarts MESURÉS le 2026-07-31 sur la première implémentation (deux passes de
   * regex), tous dus à la même cause : une regex ne sait pas dans quel contexte
   * elle se trouve. Chaque cas ci-dessous échouait alors, dans un sens ou dans
   * l'autre. Ils tiennent la porte sur le découpage à état qui les a corrigés.
   */
  describe('fidélité du découpage — écarts mesurés puis fermés', () => {
    it.each([
      // Faux positifs : une séquence de commentaire dans une valeur d'attribut
      // n'ouvre aucun commentaire pour un parseur.
      ['`<!--` non refermé dans une valeur d\u2019attribut', '<mj-image src="https://x.test/a.png" alt="<!-- promo" />'],
      ['`<!--` refermé dans une valeur d\u2019attribut', '<mj-image src="https://x.test/a.png" alt="<!-- promo -->" />'],
      ['`-->` isolé dans du texte affiché', '<mj-text>Flèche --> ici</mj-text>'],
      ['`<` littéral dans du texte affiché', '<mj-text>a < b et 3 > 2</mj-text>'],
      ['URL non quotée contenant `/one=`', '<mj-raw><img src=https://x.test/one=1></mj-raw>'],
      // Conformes au découpage réel d'un client : le gestionnaire est À
      // L'INTÉRIEUR d'une valeur, ou après la fin de la balise — il n'est jamais
      // posé. Les refuser serait un faux positif.
      ['`onerror` à l\u2019intérieur de la valeur de `alt`', '<mj-raw><img alt="x onerror="alert(1)"></mj-raw>'],
      ['`onerror` après le `>` non quoté qui ferme la balise', '<mj-raw><img alt=a>b onerror="alert(1)"></mj-raw>'],
      ['`/` à l\u2019intérieur d\u2019une valeur non quotée', '<mj-raw><img src=x/onerror="alert(1)"></mj-raw>'],
      // Le `>` d'un attribut booléen ne doit pas être franchi : le balayage
      // continuerait à découper le balisage SUIVANT comme s'il était dans la balise.
      ['pseudo-déclaration suivie de balisage légitime', '<mj-raw><! --[if mso]><mj-text>ok</mj-text></mj-raw>'],
    ])('accepte %s', (_label, body) => {
      expect(findUnsafeBodyConstruct(body)).toBeNull()
    })

    it.each([
      ['`/` séparateur juste après le nom de balise', '<mj-raw><img/onerror="alert(1)" src=x></mj-raw>', 'handler-attribute'],
      ['`/` séparateur entre deux attributs', '<mj-raw><img src="x"/onerror="alert(1)"></mj-raw>', 'handler-attribute'],
      ['balise non refermée en fin de fragment', '<mj-raw><img src=x onerror="alert(1)"', 'handler-attribute'],
      ['balise interdite non refermée en fin de fragment', '<mj-raw><script src="https://x.test/a.js"', 'forbidden-tag'],
      ['entité décimale dans le schéma d\u2019URI', '<mj-text><a href="&#106;avascript:alert(1)">x</a></mj-text>', 'script-uri'],
      ['entité hexadécimale dans le schéma d\u2019URI', '<mj-text><a href="&#x6A;avascript:alert(1)">x</a></mj-text>', 'script-uri'],
      ['`:` encodé dans le schéma d\u2019URI', '<mj-text><a href="javascript&#58;alert(1)">x</a></mj-text>', 'script-uri'],
      ['tabulation à l\u2019intérieur du schéma d\u2019URI', '<mj-text><a href="java\tscript:alert(1)">x</a></mj-text>', 'script-uri'],
      ['espaces avant le schéma d\u2019URI', '<mj-text><a href="  javascript:alert(1)">x</a></mj-text>', 'script-uri'],
      ['schéma d\u2019URI dans une valeur non quotée', '<mj-text><a href=javascript:alert(1)>x</a></mj-text>', 'script-uri'],
      ['terminateur de commentaire `--!>`', '<mj-raw><!--[if mso]><script>x</script><![endif]--!></mj-raw>', 'comment-markup'],
      ['pseudo-déclaration masquant une balise interdite', '<mj-raw><![CDATA[<iframe src=x>]]></mj-raw>', 'forbidden-tag'],
      ['pseudo-déclaration `<! --` suivie d\u2019un script', '<mj-raw><! --[if mso]><script>x</script>--></mj-raw>', 'forbidden-tag'],
    ])('refuse %s', (_label, body, expected) => {
      expect(findUnsafeBodyConstruct(body)).toBe(expected)
    })

    it('reste linéaire sur une entrée adverse de 64 Kio', () => {
      // La première implémentation prenait ~400 ms sur cette entrée (retour arrière
      // du moteur de regex), sur un chemin d'écriture synchrone. Le plafond est
      // large — il ne vise pas une performance, il détecte une régression d'ordre
      // de grandeur.
      const adversarial = [
        '<a '.repeat(16_000),
        '<!--' + '-'.repeat(65_000),
        '<img alt="' + 'a'.repeat(65_000),
        '<img ' + 'data-x=1 '.repeat(8_000) + '>',
      ]
      const started = Date.now()
      for (const body of adversarial) findUnsafeBodyConstruct(body)
      expect(Date.now() - started).toBeLessThan(500)
    })

    it.each([
      ['décimale hors plage Unicode', '<mj-text><a href="&#1114112;:x">y</a></mj-text>'],
      ['hexadécimale hors plage Unicode', '<mj-text><a href="&#xFFFFFF;:x">y</a></mj-text>'],
      ['décimale absurde', '<mj-text><a href="&#99999999999;:x">y</a></mj-text>'],
    ])('ne lève pas sur une entité %s (elle produirait un 500 sur un corps légitime)', (_label, body) => {
      // Trouvé par une revue de cas limites : `String.fromCodePoint` lève une
      // `RangeError` que le contrôleur ne sait pas classer — 500 et refus
      // d'enregistrement sur un corps qui ne porte aucun vecteur.
      expect(() => findUnsafeBodyConstruct(body)).not.toThrow()
      expect(findUnsafeBodyConstruct(body)).toBeNull()
    })

    it.each([
      ['surrogate haut isolé, hexadécimal', '<mj-text><a href="&#xD800;:x">y</a></mj-text>'],
      ['surrogate bas isolé, hexadécimal', '<mj-text><a href="&#xDFFF;:x">y</a></mj-text>'],
      ['surrogate haut isolé, décimal', '<mj-text><a href="&#55296;:x">y</a></mj-text>'],
    ])('tolère une entité %s', (_label, body) => {
      // Une revue a signalé ces entités comme un second chemin de `RangeError`.
      // Mesuré : faux positif — `String.fromCodePoint` rend un surrogate isolé
      // sans lever, seuls `< 0` et `> 0x10FFFF` lèvent, et ceux-là sont gardés.
      // Le cas est épinglé ici pour que la question ne se rejoue pas.
      expect(() => findUnsafeBodyConstruct(body)).not.toThrow()
      expect(findUnsafeBodyConstruct(body)).toBeNull()
    })

    it('décode encore le schéma quand une entité voisine est hors plage', () => {
      expect(
        findUnsafeBodyConstruct('<mj-text><a href="&#1114112;&#106;avascript:x">y</a></mj-text>'),
      ).toBeNull()
      expect(
        findUnsafeBodyConstruct('<mj-text><a href="&#106;avascript:&#1114112;">y</a></mj-text>'),
      ).toBe('script-uri')
    })
  })

  /**
   * Le balayage avance à la main dans une chaîne, avec plusieurs branches qui
   * décident chacune du prochain curseur. Sa terminaison était démontrée par un
   * commentaire — un raisonnement, pas une mesure. Sur un chemin d'écriture
   * HTTP synchrone, une boucle qui n'avance pas bloque un worker : la preuve en
   * prose ne suffit pas, elle est ici remplacée par une exploration.
   *
   * Déterministe (générateur à graine fixe) : un échec est reproductible et le
   * fragment fautif est imprimé.
   */
  describe('terminaison — exploration de fragments malformés', () => {
    const CONSTRUCTS = new Set([
      'comment-markup',
      'comment-unterminated',
      'forbidden-tag',
      'handler-attribute',
      'script-uri',
      null,
    ])

    // Jetons choisis pour tomber sur les frontières du balayage : ouvertures,
    // fermetures, séparateurs, guillemets dépareillés, tirets, entités.
    const TOKENS = [
      '<', '>', '</', '<!', '<!--', '-->', '--!>', '<!-', '--', '/', '=', ' ', '\t', '\n',
      '"', "'", '`', 'a', 'on', 'onerror', 'src', 'mj-text', 'script', '![CDATA[',
      '&#', '&#106;', '&#1114112;', ':', 'javascript', '{{v}}', '\u00e9', '\ud83d\ude00',
    ]

    function makeFragment(seed: number): string {
      // LCG (Numerical Recipes) — reproductible, sans dépendance.
      let state = seed
      const next = () => (state = (state * 1_664_525 + 1_013_904_223) >>> 0)
      const length = 1 + (next() % 40)
      let out = ''
      for (let i = 0; i < length; i++) out += TOKENS[next() % TOKENS.length]
      return out
    }

    it('rend un verdict sur 3 000 fragments malformés, sans boucler ni lever', () => {
      for (let seed = 1; seed <= 3_000; seed++) {
        const fragment = makeFragment(seed)
        let verdict: unknown
        try {
          verdict = findUnsafeBodyConstruct(fragment)
        } catch (error) {
          throw new Error(
            `graine ${seed} lève ${(error as Error).name} sur ${JSON.stringify(fragment)}`,
          )
        }
        if (!CONSTRUCTS.has(verdict as never)) {
          throw new Error(`graine ${seed} rend ${String(verdict)} sur ${JSON.stringify(fragment)}`)
        }
      }
    })

    it.each([
      ['séparateur `/` collé à un nom d\u2019attribut', '<img foo/'],
      ['attribut booléen touchant le `>` de fin', '<img foo>'],
      ['nom d\u2019attribut terminé par la fin de chaîne', '<img foo'],
      ['`=` sans nom d\u2019attribut', '<img =foo>'],
      ['`=` en fin de chaîne', '<img foo='],
      ['guillemet ouvert sans fin', '<img foo="'],
      ['balise vide', '<>'],
      ['chevron seul', '<'],
      ['fermeture seule', '</'],
      ['bang seul', '<!'],
      ['ouverture de commentaire seule', '<!--'],
      ['tirets seuls', '--'],
      ['valeur non quotée collée à la fin', '<img foo=bar'],
      ['slash final', '<img/'],
      ['espaces seuls dans la balise', '<img    >'],
    ])('termine sur %s', (_label, fragment) => {
      expect(CONSTRUCTS.has(findUnsafeBodyConstruct(fragment) as never)).toBe(true)
    })
  })

  describe('assertSafeEmailBody', () => {
    it('ne lève pas sur un corps accepté', () => {
      expect(() =>
        assertSafeEmailBody('<mj-section><mj-text>ok</mj-text></mj-section>'),
      ).not.toThrow()
    })

    it('lève un refus 400 portant le code montrable et nommant la construction', () => {
      let caught: unknown
      try {
        assertSafeEmailBody('<mj-raw><!--[if mso]><script>x</script><![endif]--></mj-raw>')
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(ValidationError)
      const error = caught as ValidationError
      expect(error.statusCode).toBe(400)
      expect(error.code).toBe(ERROR_CODES.EMAIL_BODY_UNSAFE_CONTENT)
      expect(error.message).toContain('commentaire conditionnel Outlook')
      // Le message ne recopie jamais la charge refusée.
      expect(error.message).not.toContain('script')
    })

    it('nomme la construction différemment selon le refus', () => {
      const messages = [
        '<mj-raw><script>x</script></mj-raw>',
        '<mj-raw><img src=x onerror=y></mj-raw>',
        '<mj-text><a href="javascript:x">l</a></mj-text>',
      ].map((body) => {
        try {
          assertSafeEmailBody(body)
          return null
        } catch (error) {
          return (error as ValidationError).message
        }
      })

      expect(messages).toEqual([
        expect.stringContaining('balise interdite'),
        expect.stringContaining("gestionnaire d\u2019événement"),
        expect.stringContaining('javascript:'),
      ])
    })
  })
})
