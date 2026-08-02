import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { getPublicHealth } from '../services/settings.service';
import { useAuth, type AuthUser } from '../hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { isSafeInternalPath } from '@/lib/safeRedirect';
import { MagicLinkLoading } from '@/components/auth/MagicLinkLoading';
import { MagicLinkSuccess } from '@/components/auth/MagicLinkSuccess';
import { MagicLinkExpired } from '@/components/auth/MagicLinkExpired';
import { MagicLinkErrorCard } from '@/components/auth/MagicLinkErrorCard';
import { EmailLoginForm } from '@/components/auth/EmailLoginForm';

interface AuthLoginResponse {
  user: AuthUser;
  token: string;
  sessionTTL?: number;
  eventId?: string;
  redirectAfterLogin?: string;
}

interface ExpiredContext {
  eventName?: string;
  eventId?: string;
  expiredAt?: string;
  canResend: boolean;
  isAdmin?: boolean;
}

/** Forme minimale d'une erreur API (enveloppe axios) consommée par cette page. */
interface ApiError {
  response?: {
    data?: {
      error?: {
        code?: string;
        message?: string;
        context?: Record<string, unknown>;
      };
    };
  };
}

type LoginStatus = 'idle' | 'loading' | 'success' | 'error';
type LinkState = 'loading' | 'success' | 'expired' | 'alreadyUsed' | 'setupDone' | 'invalid' | 'error';
type ResendStatus = 'idle' | 'sending' | 'sent' | 'rate_limited' | 'error';

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  useDocumentTitle({ title: 'Connexion' });
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<LoginStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<LinkState>('loading');
  const [expiredContext, setExpiredContext] = useState<ExpiredContext | null>(null);
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle');
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendErrorCode, setResendErrorCode] = useState<string | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const verifiedTokenRef = useRef<string | null>(null);

  // Public health check — flags degraded banner when server reports smtp unreachable
  const { data: healthData } = useQuery({
    queryKey: ['public', 'health'],
    queryFn: getPublicHealth,
    staleTime: 60 * 1000,
    retry: false,
  });
  const smtpDegraded = healthData?.services?.smtp === 'degraded';

  /**
   * Demande un lien neuf pour le jeton présenté. Prend le jeton en paramètre plutôt
   * que de lire `currentToken` : l'appel automatique ci-dessus part depuis le `catch`
   * de la vérification, avant que React n'ait committé cet état.
   */
  const requestFreshLink = useCallback(async (token: string) => {
    setResendError(null);
    setResendErrorCode(null);
    setResendStatus('sending');
    try {
      await api.post('/auth/resend-invitation', { token });
      setResendStatus('sent');
    } catch (err: unknown) {
      const apiError = err as ApiError;
      const errorCode = apiError.response?.data?.error?.code;
      setResendErrorCode(errorCode ?? null);
      if (errorCode === 'RATE_LIMITED') {
        setResendStatus('rate_limited');
      } else if (errorCode === 'EMAIL_SERVICE_UNAVAILABLE') {
        setResendError("Le service d'envoi d'email est temporairement indisponible. Veuillez réessayer plus tard.");
        setResendStatus('error');
      } else if (errorCode === 'RESEND_NOT_AVAILABLE') {
        setResendError("Impossible de renvoyer un lien pour cette invitation. Contactez l'administrateur.");
        setResendStatus('error');
      } else {
        setResendError('Une erreur est survenue. Veuillez réessayer.');
        setResendStatus('error');
      }
    }
  }, []);

  const handleResend = () => {
    if (!currentToken || resendStatus === 'sending') return;
    void requestFreshLink(currentToken);
  };

  // Vérification du magic link : déclarée en useCallback AVANT l'effet pour
  // satisfaire react-hooks (exhaustive-deps, immutability). Les re-exécutions
  // de l'effet sont inoffensives : la vérification est protégée one-shot par
  // verifiedTokenRef dans l'effet ci-dessous.
  const verifyAndLogin = useCallback(async (token: string) => {
    setCurrentToken(token);
    setLinkState('loading');
    try {
      const response = await api.post<{ data: AuthLoginResponse; message: string }>('/auth/verify', { token });

      if (response.data?.data) {
        const { user, token: verifiedToken, eventId, redirectAfterLogin, sessionTTL = 7200 } = response.data.data;
        login(verifiedToken, user, sessionTTL);
        setLinkState('success');
        setStatus('success');

        setTimeout(() => {
          // Priorité (D4 story 1.4) : eventId > redirectAfterLogin > rôle
          if (eventId) {
            navigate(`/me/events/${eventId}`, { replace: true });
          } else if (isSafeInternalPath(redirectAfterLogin)) {
            navigate(redirectAfterLogin, { replace: true });
          } else if (user.role === 'admin') {
            navigate('/admin', { replace: true });
          } else {
            navigate('/me', { replace: true });
          }
        }, 500);
      }
    } catch (err: unknown) {
      const apiError = err as ApiError;
      const errorCode = apiError.response?.data?.error?.code;
      const errorMessage = apiError.response?.data?.error?.message;
      const context = apiError.response?.data?.error?.context;

      // Lien mort mais renvoyable : on n'attend pas un clic de plus. Arriver ici
      // EST la demande — l'intention du porteur du lien n'a pas d'ambiguïté, et lui
      // faire cliquer « Demander un nouveau lien » n'ajoutait qu'une étape entre lui
      // et sa boîte mail. Le garde one-shot `verifiedTokenRef` borne l'envoi à un
      // par jeton présenté ; au-delà, le rate-limit serveur (1/min) prend le relais.
      const canResend = (context?.canResend as boolean | undefined) ?? false;

      if (errorCode === 'TOKEN_EXPIRED') {
        setLinkState('expired');
        setExpiredContext({
          eventName: context?.eventName as string | undefined,
          eventId: context?.eventId as string | undefined,
          expiredAt: context?.expiredAt as string | undefined,
          canResend,
          isAdmin: (context?.isAdmin as boolean | undefined) ?? false,
        });
        setError('Ce lien de connexion a expiré.');
        if (canResend) void requestFreshLink(token);
      } else if (errorCode === 'TOKEN_ALREADY_USED') {
        // Un lien ne vaut qu'une session. Pas d'`expiredAt` ici : le lien n'a pas
        // expiré, il a servi — afficher une date d'expiration serait mensonger.
        setLinkState('alreadyUsed');
        setExpiredContext({
          eventName: context?.eventName as string | undefined,
          eventId: context?.eventId as string | undefined,
          canResend,
          isAdmin: (context?.isAdmin as boolean | undefined) ?? false,
        });
        setError('Ce lien de connexion a déjà été utilisé.');
        if (canResend) void requestFreshLink(token);
      } else if (errorCode === 'INVALID_TOKEN') {
        setLinkState('invalid');
        setError('Ce lien de connexion est invalide.');
      } else if (errorCode === 'USER_NOT_FOUND') {
        setLinkState('error');
        setError('Membre non trouvé. Contactez l\'administrateur.');
      } else if (errorCode === 'SETUP_ALREADY_DONE') {
        setExpiredContext({ canResend: true });
        setLinkState('setupDone');
      } else {
        setLinkState('error');
        setError(errorMessage || 'Une erreur est survenue lors de la connexion.');
      }
    }
  }, [login, navigate, requestFreshLink]);

  // Vérifie le token de magic link présent dans l'URL — one-shot par token.
  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      // One-shot : un même token n'est vérifié qu'une seule fois.
      if (verifiedTokenRef.current === token) return;
      verifiedTokenRef.current = token;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation externe (URL) → React voulue
      verifyAndLogin(token);
      return;
    }

    if (isAuthenticated && !token) {
      // D11 story 1.4 : rôle-aware redirect pour un membre déjà authentifié sur /login.
      const next = searchParams.get('next');
      navigate(isSafeInternalPath(next) ? next : user?.role === 'admin' ? '/admin' : '/me', { replace: true });
      return;
    }
  }, [searchParams, isAuthenticated, navigate, verifyAndLogin, user]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setError(null);
    try {
      const next = searchParams.get('next');
      await api.post('/auth/login', next ? { email, next } : { email });
      setStatus('success');
    } catch (err: unknown) {
      const apiError = err as ApiError;
      const errorCode = apiError.response?.data?.error?.code;
      if (errorCode === 'EMAIL_SERVICE_UNAVAILABLE') {
        setError("Le service d'envoi d'email est temporairement indisponible. Veuillez réessayer plus tard.");
      } else {
        setError('Une erreur est survenue. Vérifiez votre email et réessayez.');
      }
      setStatus('error');
    }
  };

  const reason = searchParams.get('reason');
  const token = searchParams.get('token');
  const ctxValues = searchParams.getAll('ctx');
  const isAdminContext = ctxValues.length === 1 && ctxValues[0] === 'admin';
  const backToLogin = () => navigate('/login', { replace: true });

  // Branches magic-link
  if (token) {
    if (linkState === 'loading') return <MagicLinkLoading />;
    if (linkState === 'success') return <MagicLinkSuccess />;
    if (linkState === 'expired') return (
      <MagicLinkExpired
        expiredContext={expiredContext}
        resendStatus={resendStatus}
        resendError={resendError}
        showEmergencyLink={(expiredContext?.isAdmin ?? false) && resendErrorCode === 'EMAIL_SERVICE_UNAVAILABLE'}
        onResend={handleResend}
        onBackToLogin={backToLogin}
      />
    );
    if (linkState === 'alreadyUsed') return (
      <MagicLinkExpired
        variant="already-used"
        expiredContext={expiredContext}
        resendStatus={resendStatus}
        resendError={resendError}
        showEmergencyLink={(expiredContext?.isAdmin ?? false) && resendErrorCode === 'EMAIL_SERVICE_UNAVAILABLE'}
        onResend={handleResend}
        onBackToLogin={backToLogin}
      />
    );
    if (linkState === 'setupDone') return (
      <MagicLinkExpired
        variant="setup-already-done"
        expiredContext={expiredContext}
        resendStatus={resendStatus}
        resendError={resendError}
        showEmergencyLink={false}
        onResend={handleResend}
        onBackToLogin={backToLogin}
      />
    );
    if (linkState === 'invalid') return (
      <MagicLinkErrorCard
        title="Lien invalide"
        description="Ce lien semble incomplet. Les liens sont parfois coupés dans les emails — copiez-le en entier, ou retournez à la connexion pour en demander un nouveau."
        onBackToLogin={backToLogin}
      />
    );
    if (linkState === 'error') return (
      <MagicLinkErrorCard
        title="Erreur de connexion"
        description={error ?? 'Une erreur est survenue lors de la connexion.'}
        onBackToLogin={backToLogin}
      />
    );
  }

  // Formulaire email (+ état success email envoyé)
  return (
    <EmailLoginForm
      status={status}
      error={error}
      email={email}
      smtpDegraded={smtpDegraded}
      isAdminContext={isAdminContext}
      reason={reason}
      onEmailChange={setEmail}
      onSubmit={handleSubmit}
    />
  );
}
