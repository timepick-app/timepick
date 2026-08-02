import { generateMagicLink, magicLinkTokenHash, verifyToken } from '../../services/auth.service';
import { query } from '../../db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_testing';

// Mock the database module
jest.mock('../../db', () => ({
  query: jest.fn(),
}));

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateMagicLink', () => {
    it('génère un token avec expiration basée sur le TTL fourni', async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await generateMagicLink({
        userId: 'user-uuid-1234',
        ttl: 86400, // 24 heures
      });

      expect(result.link).toContain('/login?token=');
      expect(result.expirationDate).toBeInstanceOf(Date);
      expect(query).toHaveBeenCalled();
      const calls = (query as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][0]).toContain('INSERT INTO magic_link_tokens');
      expect(calls[0][0]).toContain('(user_id, token_hash, expires_at)');
    });


    it('stocke l\'empreinte du token et l\'expiration en base de données', async () => {
      (query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await generateMagicLink({
        userId: 'user-uuid-1234',
        ttl: 86400, // 24 heures
      });

      expect(result.link).toContain('/login?token=');
      expect(query).toHaveBeenCalled();
      const calls = (query as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][0]).toContain('INSERT INTO magic_link_tokens');
      expect(calls[0][0]).toContain('(user_id, token_hash, expires_at)');
      const [userId, stored, exp] = calls[0][1];
      expect(userId).toBe('user-uuid-1234');
      expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

      // Ce qui part en base est l'empreinte du lien, jamais le lien : une fuite de
      // `magic_link_tokens` ne doit rien livrer de rejouable.
      const emitted = new URL(result.link).searchParams.get('token') as string;
      expect(stored).not.toBe(emitted);
      expect(stored).toBe(magicLinkTokenHash(emitted));
    });

    it('lance une erreur si ttl absent', async () => {
      await expect(
        generateMagicLink({
          userId: 'user-uuid-1234',
        })
      ).rejects.toThrow(/ttl/);
    });
  });

  describe('verifyToken', () => {
    it('vérifie un token valide et retourne le payload', async () => {
      const testPayload = {
        userId: 'user-uuid-1234',
        exp: Math.floor(Date.now() / 1000) + 3600, // +1 heure
        eventId: 'event-uuid-5678',
      };

      const token = jwt.sign(testPayload, JWT_SECRET);

      const payload = await verifyToken(token);

      expect(payload).toBeTruthy();
      expect(payload?.userId).toBe('user-uuid-1234');
      expect(payload?.eventId).toBe('event-uuid-5678');
    });

    it('retourne null pour un token invalide', async () => {
      const payload = await verifyToken('invalid-token');

      expect(payload).toBeNull();
    });

    it('retourne null pour un token expiré', async () => {
      const expiredToken = jwt.sign(
        { userId: 'user-uuid', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );

      const payload = await verifyToken(expiredToken);

      expect(payload).toBeNull();
    });
  });

});
