import request from 'supertest';
import { testServer } from '../helpers/test-server';
import { query } from '../../db';
import { generateMagicLink, magicLinkTokenHash } from '../../services/auth.service';

/**
 * Preuves du chantier « lien magique rejouable » (CRITICAL-002).
 *
 * Ces tests portent sur le contrat OBSERVABLE de POST /api/auth/verify, pas sur la
 * mécanique : un lien vaut une session, plusieurs liens vivants coexistent, et deux
 * clics simultanés n'en ouvrent qu'une.
 */

const ONE_HOUR = 3600;
const EMAIL_PREFIX = 'test-single-use-';

const tokenFromLink = (link: string): string => new URL(link).searchParams.get('token') || '';

const uniqueSuffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = async (role: 'admin' | 'user' = 'user') => {
  const result = await query(
    `INSERT INTO users (email, first_name, role)
     VALUES ($1, $2, $3)
     RETURNING id, email`,
    [`${EMAIL_PREFIX}${uniqueSuffix()}@test.com`, 'Camille', role]
  );
  return result.rows[0];
};

const createEvent = async (): Promise<string> => {
  const result = await query(
    `INSERT INTO events (name, description)
     VALUES ($1, $2)
     RETURNING id`,
    [`test-single-use-event-${uniqueSuffix()}`, 'Événement de preuve']
  );
  return result.rows[0].id;
};

const verify = (token: string) =>
  request(testServer()).post('/api/auth/verify').send({ token });

describe('Magic link à usage unique — POST /api/auth/verify', () => {
  afterEach(async () => {
    await query('DELETE FROM users WHERE email LIKE $1', [`${EMAIL_PREFIX}%`]);
    await query("DELETE FROM events WHERE name LIKE 'test-single-use-event-%'");
  });

  it('ouvre une session au premier appel, la refuse au second (preuve centrale)', async () => {
    const user = await createUser();
    const { link } = await generateMagicLink({ userId: user.id, ttl: ONE_HOUR });
    const token = tokenFromLink(link);

    const first = await verify(token);
    expect(first.status).toBe(200);
    expect(first.body.data.token).toBeTruthy();

    const second = await verify(token);
    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe('TOKEN_ALREADY_USED');
    // Le lien reste inutilisable : l'utilisateur doit pouvoir en redemander un.
    expect(second.body.error.context.canResend).toBe(true);
  });

  it('marque le lien consommé en base, sans le supprimer', async () => {
    const user = await createUser();
    const { link } = await generateMagicLink({ userId: user.id, ttl: ONE_HOUR });
    const token = tokenFromLink(link);

    // La ligne se retrouve par empreinte : le jeton lui-même n'est pas en base.
    const hash = magicLinkTokenHash(token);

    const before = await query('SELECT consumed_at FROM magic_link_tokens WHERE token_hash = $1', [hash]);
    expect(before.rows[0].consumed_at).toBeNull();

    await verify(token);

    const after = await query('SELECT consumed_at FROM magic_link_tokens WHERE token_hash = $1', [hash]);
    expect(after.rows[0].consumed_at).not.toBeNull();
  });

  it('ne stocke pas le lien : la valeur en base, présentée telle quelle, n\'ouvre pas de session', async () => {
    // Le point de la migration 043. Avant elle, `token` portait le JWT complet :
    // qui lisait la table pouvait se connecter à la place de tout membre
    // dont le lien était encore en attente.
    const user = await createUser();
    const { link } = await generateMagicLink({ userId: user.id, ttl: ONE_HOUR });
    const token = tokenFromLink(link);

    const stored = await query(
      'SELECT token_hash FROM magic_link_tokens WHERE user_id = $1',
      [user.id]
    );
    expect(stored.rows[0].token_hash).not.toBe(token);

    const res = await verify(stored.rows[0].token_hash);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');

    // Et le lien authentique, lui, marche toujours : la table n'a pas été cassée.
    const legitimate = await verify(token);
    expect(legitimate.status).toBe(200);
  });

  it('laisse vivre les liens de deux événements : cliquer le premier après réception du second fonctionne', async () => {
    // Le parcours nominal que l'ancienne colonne unique aurait cassé en silence :
    // une seconde invitation écrasait le jeton de la première.
    const user = await createUser();
    const eventA = await createEvent();
    const eventB = await createEvent();

    const { link: linkA } = await generateMagicLink({ userId: user.id, eventId: eventA, ttl: ONE_HOUR });
    const { link: linkB } = await generateMagicLink({ userId: user.id, eventId: eventB, ttl: ONE_HOUR });

    const clickedFirst = await verify(tokenFromLink(linkA));
    expect(clickedFirst.status).toBe(200);
    expect(clickedFirst.body.data.eventId).toBe(eventA);

    // Et le second lien reste utilisable : chaque lien se consomme séparément.
    const clickedSecond = await verify(tokenFromLink(linkB));
    expect(clickedSecond.status).toBe(200);
    expect(clickedSecond.body.data.eventId).toBe(eventB);
  });

  it('deux vérifications simultanées du même lien : exactement une session émise', async () => {
    const user = await createUser();
    const { link } = await generateMagicLink({ userId: user.id, ttl: ONE_HOUR });
    const token = tokenFromLink(link);

    // Aucun await entre les deux envois : les requêtes courent ensemble.
    const [a, b] = await Promise.all([verify(token), verify(token)]);

    const accepted = [a, b].filter((res) => res.status === 200);
    const refused = [a, b].filter((res) => res.status === 401);

    expect(accepted).toHaveLength(1);
    expect(accepted[0].body.data.token).toBeTruthy();
    expect(refused).toHaveLength(1);
    expect(refused[0].body.error.code).toBe('TOKEN_ALREADY_USED');
  });

  it('refuse un jeton correctement signé mais jamais émis par cette instance', async () => {
    const user = await createUser();
    const { link } = await generateMagicLink({ userId: user.id, ttl: ONE_HOUR });
    const token = tokenFromLink(link);

    // Le lien est authentique, mais sa trace est effacée de la base : la signature
    // seule ne suffit plus à ouvrir une session.
    await query('DELETE FROM magic_link_tokens WHERE token_hash = $1', [magicLinkTokenHash(token)]);

    const res = await verify(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_ALREADY_USED');
  });
});
