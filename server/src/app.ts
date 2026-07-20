import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import authRoutes from './routes/auth.routes';
import meRoutes from './routes/me.routes';
import slotsRoutes from './routes/slots.routes';
import adminRoutes from './routes/admin.routes';
import eventsRoutes from './routes/events.routes';
import slotsAdminRoutes from './routes/slots.admin.routes';
import cancellationNotificationsAdminRoutes from './routes/cancellation-notifications.admin.routes';
import publicEventsRoutes from './routes/public.events.routes';
import publicAuthRoutes from './routes/public-auth.routes';
import setupRoutes from './routes/setup.routes';
import testRoutes from './routes/test.routes';
import settingsRoutes from './routes/settings.routes';
import healthRoutes from './routes/health.routes';
import uploadsRoutes from './routes/uploads.routes';
import shellPartsRoutes from './routes/shell-parts.routes';
import { recoveryPublicRoutes, recoveryAdminRoutes } from './routes/recovery.routes';
import { encryptionKeyAdminRoutes } from './routes/encryption-key.admin.routes';
import { optionalAuth } from './middleware/auth.middleware';
import { snakeToCamelMiddleware } from './middleware/jsonConverter';
import { getTransportStatus, checkSmtpConnection } from './services/email.service';
import { getStorage } from './services/storage';

const app = express();

// Trust the first proxy hop so `req.ip` and express-rate-limit read the
// real client IP from X-Forwarded-For when the server runs behind a reverse
// proxy (Nginx, Cloud Run, etc.). Safe when exactly one trusted proxy is
// in front of us; bump the count or use a list for multi-hop setups.
app.set('trust proxy', 1);

// STORAGE_DRIVER=s3 serves images from an external bucket origin; helmet's
// default CSP (img-src 'self' data:) would block them in the admin editor and
// the Aperçu iframe (srcdoc, same CSP). Extend img-src to the bucket origin only
// under s3. Calling getStorage() here also fails fast at boot on an incomplete
// s3 config (StorageConfigError thrown at app construction).
const storage = getStorage();
app.use(
  helmet(
    storage.mode === 's3'
      ? { contentSecurityPolicy: { useDefaults: true, directives: { 'img-src': ["'self'", 'data:', storage.s3PublicOrigin] } } }
      : undefined,
  ),
);
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(morgan('dev'));
app.use(express.json());

// Middleware de conversion snake_case → camelCase pour les réponses API
// Doit être AVANT les routes pour pouvoir intercepter res.json()
app.use(snakeToCamelMiddleware);

// Routes de configuration initiale (publiques, avant les autres routes)
app.use('/api/setup', setupRoutes);

// Routes de test (uniquement en développement)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test', testRoutes);
}

// Emergency recovery (public) — must be mounted BEFORE authRoutes so the
// public /emergency-login endpoint is reachable without admin middleware.
app.use('/api/auth', recoveryPublicRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/slots', slotsRoutes);
app.use('/api/admin', recoveryAdminRoutes);
app.use('/api/admin', encryptionKeyAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', slotsAdminRoutes);
app.use('/api/admin', cancellationNotificationsAdminRoutes);
app.use('/api/admin/settings', settingsRoutes);
app.use('/api/admin/events', eventsRoutes);
app.use('/api/admin/uploads', uploadsRoutes);
app.use('/api/admin/shell-parts', shellPartsRoutes);
app.use('/api/events', publicEventsRoutes);  // Routes publiques pour événements publiés
app.use('/api/public', optionalAuth, publicAuthRoutes);  // Routes publiques (auth optionnelle)

// Static serving of admin-uploaded email images.
// Path resolves to server/uploads from both server/dist (prod) and server/src (dev).
// F3 fix: dropped `immutable` so URLs can be cache-busted if a file ever needs
// rotation (UUID-naming makes collisions impossible, but the cache pin would
// outlive deletions for 7 days).
// F33 fix: open CORS on /uploads so the Aperçu iframe (different origin during
// dev — :5173 → :3000) and any future cross-origin email preview can load images.
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  next()
})
app.use(
  '/uploads',
  express.static(path.resolve(__dirname, '..', 'uploads'), {
    maxAge: '7d',
    fallthrough: false,
  })
);

// Admin health (detailed) — GET /api/admin/health
app.use('/api/admin', healthRoutes);

// Public health — binary SMTP status (null → 'ok' to avoid false positives at startup)
app.get('/health', (_req, res) => {
  const { healthy } = getTransportStatus();
  const smtp: 'ok' | 'degraded' = healthy === false ? 'degraded' : 'ok';
  res.json({
    status: smtp,
    timestamp: new Date().toISOString(),
    services: { smtp },
  });
});


// Production : sert le SPA buildé et résout le routage côté client. Monté APRÈS
// tous les handlers /api, /uploads et /health (qui gardent la priorité) et AVANT
// le handler d'erreur global. Inactif hors production (le dev utilise Vite).
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '..', 'public');
  app.use(express.static(clientDist));
  // Fallback history du SPA (Express 5 : pas de wildcard string). Tout GET non-API
  // renvoie index.html pour que deep links et rafraîchissements se résolvent côté client.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/health')
    ) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}
// Filet de sécurité global : capture toute erreur non gérée — y compris les rejets
// de promesses des handlers async, qu'Express 5 transmet automatiquement au
// middleware d'erreur — et renvoie une réponse 500 propre plutôt que de laisser la
// requête sans réponse. DOIT rester déclaré après toutes les routes.
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  console.error('[app] Erreur non gérée :', err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: 'Server Error' });
});

// Boot-time SMTP check (non-blocking) — warns in production when no transport is reachable
checkSmtpConnection()
  .then((healthy) => {
    if (!healthy && process.env.NODE_ENV === 'production') {
      console.error('[App] WARNING: SMTP connection failed at startup. Emails will not be sent.');
    }
  })
  .catch(() => { /* checkSmtpConnection never throws */ });

export default app;
