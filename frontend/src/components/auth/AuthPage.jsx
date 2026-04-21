import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { animate, stagger } from 'animejs'
import { useApp } from '@/context/AppContext'
import { auth as authApi } from '@/lib/api'
import Silk from '@/components/Silk'
import rubrixLogo from '@/assets/rubrix-logo.svg'
import { Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

function RubrixDrawTitle() {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!svgRef.current) return
    const elements = svgRef.current.querySelectorAll('.rubrix-letter')
    if (!elements.length) return

    elements.forEach((el) => {
      if (el.tagName === 'circle') {
        const r = parseFloat(el.getAttribute('r'))
        const circ = 2 * Math.PI * r
        el.style.strokeDasharray = circ
        el.style.strokeDashoffset = circ
        el.style.fill = 'transparent'
      } else {
        const length = el.getTotalLength()
        el.style.strokeDasharray = length
        el.style.strokeDashoffset = length
        el.style.fill = 'transparent'
      }
    })

    animate(elements, {
      strokeDashoffset: 0,
      duration: 1800,
      ease: 'inOutQuad',
      delay: stagger(120),
      onComplete: () => {
        animate(elements, {
          stroke: ['url(#rubrixStrokeGrad)', '#e0d4ff'],
          duration: 800,
          ease: 'inOutQuad',
          delay: stagger(60),
        })
      },
    })
  }, [])

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 230 60"
      className="mx-auto block h-auto w-[220px]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="rubrixStrokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="50%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <filter id="rubrixGlow">
          <feGaussianBlur stdDeviation="2" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path className="rubrix-letter" d="M10 50 L10 10 L30 10 Q42 10 42 22 Q42 34 30 34 L10 34 M30 34 L44 50" stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />
      <path className="rubrix-letter" d="M58 22 L58 40 Q58 50 68 50 L76 50 Q86 50 86 40 L86 22" stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />
      <path className="rubrix-letter" d="M100 8 L100 50 L100 40 Q100 22 115 22 Q130 22 130 36 Q130 50 115 50 L100 50" stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />
      <path className="rubrix-letter rubrix-stroke-only" d="M146 50 L146 30 Q146 22 156 22 L162 22" stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />
      <path className="rubrix-letter rubrix-stroke-only" d="M178 50 L178 22 M176 11 Q178 7 180 11 Q178 15 176 11" stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />
      <path className="rubrix-letter" d="M196 22 L220 50 M220 22 L196 50" stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />
    </svg>
  )
}

export default function AuthPage() {
  const { login, register, theme, toggleTheme } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlResetToken = searchParams.get('reset')

  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('student')
  const [authError, setAuthError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthError('')
    setIsLoading(true)
    try {
      await login(email, password)
      toast.success('Autentificare reușită!')
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setAuthError('')
    setIsLoading(true)
    try {
      await register({ email, password, fullName, role })
      setAuthMode('login')
      toast.success('Cont creat cu succes! Te poți autentifica.')
      setEmail('')
      setPassword('')
      setFullName('')
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setIsLoading(true)
    try {
      const res = await authApi.forgotPassword(email.trim())
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Cererea a eșuat.')
      toast.success(data.message || 'Verifică email-ul.')
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    if (resetNewPassword.length < 6) {
      setAuthError('Parola trebuie să aibă cel puțin 6 caractere.')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setAuthError('Parolele nu coincid.')
      return
    }
    setIsLoading(true)
    try {
      const res = await authApi.resetPassword(urlResetToken, resetNewPassword)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Resetarea a eșuat.')
      setSearchParams({})
      setResetNewPassword('')
      setResetConfirmPassword('')
      setAuthMode('login')
      toast.success(data.message || 'Parola a fost actualizată.')
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <Button
        variant="outline"
        size="icon"
        className="fixed right-4 top-4 z-20"
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>

      <div className="absolute inset-0 z-0 opacity-70">
        <Silk
          speed={5}
          scale={1}
          color={theme === 'light' ? '#9b7fd4' : '#6521a1'}
          noiseIntensity={1.5}
          rotation={0}
        />
      </div>

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center">
            <div
              className="h-24 w-24"
              style={{
                backgroundColor: 'var(--primary)',
                WebkitMaskImage: `url(${rubrixLogo})`,
                maskImage: `url(${rubrixLogo})`,
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
              }}
            />
          </div>
          <RubrixDrawTitle />
        </div>

        <Card className="border-border/50 bg-card/80 backdrop-blur-xl">
          <CardContent className="p-6">
            {urlResetToken ? (
              <form onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Parolă nouă</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Alege o parolă nouă pentru contul tău.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Parolă nouă</Label>
                  <Input type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirmă parola</Label>
                  <Input type="password" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" />
                </div>
                {authError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{authError}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Se salvează...' : 'Salvează parola'}
                </Button>
                <Button type="button" variant="link" className="text-sm" onClick={() => { setSearchParams({}); setAuthMode('login'); setAuthError('') }}>
                  ← Înapoi la autentificare
                </Button>
              </form>
            ) : (
              <>
                <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1">
                  <button type="button" className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${authMode === 'login' || authMode === 'forgot' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => { setAuthMode('login'); setAuthError('') }}>
                    Sign In
                  </button>
                  <button type="button" className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${authMode === 'register' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => { setAuthMode('register'); setAuthError('') }}>
                    Sign Up
                  </button>
                </div>

                {authMode === 'forgot' ? (
                  <form onSubmit={handleForgotSubmit} className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">
                      Introdu adresa de email. Vei primi un link pentru resetarea parolei.
                    </p>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@universitate.ro" required autoComplete="email" />
                    </div>
                    {authError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{authError}</p>}
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Se trimite...' : 'Trimite link de resetare'}
                    </Button>
                    <Button type="button" variant="link" className="text-sm" onClick={() => { setAuthMode('login'); setAuthError('') }}>
                      ← Înapoi la autentificare
                    </Button>
                  </form>
                ) : authMode === 'register' ? (
                  <form onSubmit={handleRegister} className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <Label>Nume complet</Label>
                      <Input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ion Popescu" />
                    </div>
                    <div className="space-y-2">
                      <Label>Rol</Label>
                      <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-full"><option value="student">Student</option><option value="professor">Profesor</option></select>
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@universitate.ro" required autoComplete="email" />
                    </div>
                    <div className="space-y-2">
                      <Label>Parolă</Label>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" />
                    </div>
                    {authError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{authError}</p>}
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Se procesează...' : 'Creează cont'}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@universitate.ro" required autoComplete="email" />
                    </div>
                    <div className="space-y-2">
                      <Label>Parolă</Label>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="current-password" />
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => { setAuthMode('forgot'); setAuthError('') }}>
                        Ai uitat parola?
                      </Button>
                    </div>
                    {authError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{authError}</p>}
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Se procesează...' : 'Intră în cont'}
                    </Button>
                  </form>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
