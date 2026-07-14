import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AxiosError } from 'axios'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthShell, AuthBrand } from '@/components/auth/AuthShell'
import { AlertCircle, Clock, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { emergencyLogin } from '@/services/recovery.service'
import { formatCountdown } from '@/lib/format'

type FormState = 'idle' | 'submitting' | 'success' | 'error' | 'locked'

export default function EmergencyLogin() {
  const navigate = useNavigate()
  const { login } = useAuth()
  useDocumentTitle({ title: 'Connexion de secours' })

  // Keep recovery URL out of search indexes and suppress Referer leakage on
  // outbound clicks. Closure-reference cleanup is deliberate — never look up
  // these metas via querySelector (see tech-spec R2 / adversarial review F5).
  useEffect(() => {
    const robotsMeta = document.createElement('meta')
    robotsMeta.setAttribute('name', 'robots')
    robotsMeta.setAttribute('content', 'noindex')

    const referrerMeta = document.createElement('meta')
    referrerMeta.setAttribute('name', 'referrer')
    referrerMeta.setAttribute('content', 'same-origin')

    document.head.appendChild(robotsMeta)
    document.head.appendChild(referrerMeta)

    return () => {
      robotsMeta.remove()
      referrerMeta.remove()
    }
  }, [])

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [retryAfterMs, setRetryAfterMs] = useState<number>(0)

  // Countdown tick for lockout state
  useEffect(() => {
    if (state !== 'locked' || retryAfterMs <= 0) return
    const tick = setInterval(() => {
      setRetryAfterMs((prev) => {
        const next = prev - 1000
        if (next <= 0) {
          setState('idle')
          setError(null)
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [state, retryAfterMs])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state === 'submitting' || state === 'locked') return

    setState('submitting')
    setError(null)

    try {
      const data = await emergencyLogin(email, code)
      login(
        data.token,
        {
          id: data.user.id,
          email: data.user.email,
          firstName: data.user.firstName ?? '',
          lastName: data.user.lastName ?? null,
          role: data.user.role,
          // Emergency login = flux de secours admin (recovery.controller, hors
          // scope 1.4). hasMemberAccess n'est pas retourné par ce endpoint ;
          // défaut false (lien « Espace membre » masqué jusqu'au prochain login normal, D6).
          hasMemberAccess: false,
        },
        data.sessionTtl
      )
      // Flag every emergency session — banner (d) on dashboard reads this as
      // a fast-path before the /status query resolves.
      sessionStorage.setItem('emergencySession', 'true')
      setState('success')
      navigate('/admin/dashboard', { replace: true })
    } catch (err) {
      const axErr = err as AxiosError<{ code?: string; retryAfterMs?: number }>
      const status = axErr.response?.status
      const body = axErr.response?.data
      if (status === 429 && typeof body?.retryAfterMs === 'number') {
        setRetryAfterMs(body.retryAfterMs)
        setState('locked')
        setError(`Trop de tentatives. Réessayez dans ${formatCountdown(body.retryAfterMs)}.`)
        return
      }
      if (status === 429) {
        setRetryAfterMs(15 * 60 * 1000)
        setState('locked')
        setError('Trop de tentatives. Réessayez plus tard.')
        return
      }
      setState('error')
      setError('Identifiants incorrects.')
    }
  }

  const isDisabled = state === 'submitting' || state === 'locked'

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <AuthBrand />
          <Typography variant="h3" as="h2" className="tracking-tight">Connexion de secours</Typography>
          <CardDescription>
            Saisissez l'un de vos codes de secours pour vous reconnecter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="emergency-email">Adresse email</Label>
              <Input
                id="emergency-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                disabled={isDisabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="emergency-code">Code de secours</Label>
              <Input
                id="emergency-code"
                type="text"
                required
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="TIMEPICK-XXXX-XXXX"
                disabled={isDisabled}
              />
              <Typography variant="body-xs" color="muted">
                Entrez l'un de vos codes de secours (peu importe lequel).
              </Typography>
            </div>

            {error && (state === 'error' || state === 'locked') && (
              <Alert variant={state === 'locked' ? 'warning' : 'destructive'}>
                {state === 'locked' ? <Clock className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isDisabled}>
              {state === 'submitting' ? 'Vérification…' : 'Se connecter'}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/login')}>
            <ArrowLeft />
            Retour à la connexion par email
          </Button>
        </CardFooter>
      </Card>
    </AuthShell>
  )
}
