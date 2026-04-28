import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { animate, stagger } from 'animejs'
import { useApp } from '@/context/AppContext'
import { auth as authApi } from '@/lib/api'
import { Sun, Moon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const OG = '#E55B20'      // primary orange
const OG2 = '#c04010'     // darker orange for SVG lines

// ─── Animated "Rubrix" draw-on SVG title ─────────────────────────────────────
function RubrixDrawTitle({ color, className = 'w-[220px]' }) {
  const svgRef = useRef(null)
  useEffect(() => {
    if (!svgRef.current) return
    const els = svgRef.current.querySelectorAll('.rl')
    if (!els.length) return
    els.forEach((el) => {
      const len = el.getTotalLength ? el.getTotalLength() : 0
      el.style.strokeDasharray = len
      el.style.strokeDashoffset = len
      el.style.fill = 'transparent'
    })
    animate(els, { strokeDashoffset: 0, duration: 1600, ease: 'inOutQuad', delay: stagger(110) })
  }, [])
  return (
    <svg ref={svgRef} viewBox="0 0 230 60" className={`mx-auto block h-auto ${className}`} xmlns="http://www.w3.org/2000/svg">
      <path className="rl" d="M10 50 L10 10 L30 10 Q42 10 42 22 Q42 34 30 34 L10 34 M30 34 L44 50" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" />
      <path className="rl" d="M58 22 L58 40 Q58 50 68 50 L76 50 Q86 50 86 40 L86 22" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" />
      <path className="rl" d="M100 8 L100 50 L100 40 Q100 22 115 22 Q130 22 130 36 Q130 50 115 50 L100 50" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" />
      <path className="rl" d="M146 50 L146 30 Q146 22 156 22 L162 22" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" />
      <path className="rl" d="M178 50 L178 22 M176 11 Q178 7 180 11 Q178 15 176 11" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" />
      <path className="rl" d="M196 22 L220 50 M220 22 L196 50" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" />
    </svg>
  )
}

// ─── Brain + burst illustration ───────────────────────────────────────────────
function BrainSVG({ w = 200, h = 106 }) {
  return (
    <svg width={w} height={h} viewBox="0 0 155 82" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 60 C6 55 3 43 6 33 C9 23 18 18 24 21 C25 13 32 8 40 11 C44 4 52 2 59 7 C64 2 73 2 77 8 C84 6 93 10 94 21 C101 23 106 31 103 43 C101 53 93 59 84 58 C78 64 70 66 62 62 C55 68 44 68 37 63 C28 68 21 67 20 60 Z" fill={OG} />
      <circle cx="26" cy="19" r="10" fill={OG} />
      <circle cx="42" cy="12" r="11" fill={OG} />
      <circle cx="59" cy="8"  r="11" fill={OG} />
      <circle cx="77" cy="9"  r="10" fill={OG} />
      <circle cx="91" cy="18" r="9"  fill={OG} />
      <path d="M58 8 L58 64" stroke={OG2} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M34 30 C39 25 45 30 50 25" stroke={OG2} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M31 44 C37 38 44 44 50 38" stroke={OG2} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M63 28 C68 23 74 28 79 23" stroke={OG2} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M63 43 C68 38 74 43 80 38" stroke={OG2} strokeWidth="2" strokeLinecap="round" fill="none" />
      <rect x="50" y="63" width="14" height="14" rx="6" fill={OG} />
      <path d="M121 35 L124 24 L127 35 L138 38 L127 41 L124 52 L121 41 L110 38 Z" fill={OG} />
      <circle cx="107" cy="24" r="3"   fill={OG} />
      <circle cx="140" cy="24" r="2.5" fill={OG} />
      <circle cx="143" cy="52" r="2"   fill={OG} />
      <circle cx="104" cy="50" r="2"   fill={OG} />
    </svg>
  )
}

// ─── Left panel illustration scene ───────────────────────────────────────────
function LeftScene({ innerBg, textMuted }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ background: innerBg }}>
      {/* Orange top bar */}
      <div className="shrink-0 px-6 py-2.5" style={{ background: OG }}>
        <span className="font-mono text-sm font-medium tracking-widest text-white">
          evaluare inteligentă
        </span>
      </div>

      {/* Scrollable inner content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-10 py-8">
        {/* Title */}
        <div className="text-center">
          <RubrixDrawTitle color={OG} className="w-[260px]" />
          <p className="mt-2 font-mono text-sm tracking-wider" style={{ color: textMuted }}>
            platformă de evaluare & feedback
          </p>
        </div>

        {/* Floating scene SVG */}
        <FloatingScene innerBg={innerBg} />

        {/* Feature rows */}
        <div className="w-full space-y-2 border-t pt-5" style={{ borderColor: `${OG}33` }}>
          {[
            ['✦', 'Evaluare automată cu AI'],
            ['✦', 'Feedback instant per exercițiu'],
            ['✦', 'Variante de test pentru examene'],
            ['✦', 'Analiză și export PDF'],
          ].map(([icon, text]) => (
            <div key={text} className="flex items-center gap-3">
              <span className="font-mono text-xs" style={{ color: OG }}>{icon}</span>
              <span className="font-mono text-xs" style={{ color: textMuted }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Rich SVG scene for the left panel ───────────────────────────────────────
function FloatingScene({ innerBg }) {
  // A composition: brain in the centre, surrounded by floating cards/elements
  const cream = innerBg
  return (
    <svg viewBox="0 0 360 240" className="w-full max-w-xs" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* ── floating evaluation card top-left ── */}
      <g transform="translate(10, 18) rotate(-8)">
        <rect width="90" height="68" rx="6" fill={OG} opacity="0.15" />
        <rect width="90" height="68" rx="6" fill="none" stroke={OG} strokeWidth="1.5" />
        <text x="8" y="18" fontFamily="monospace" fontSize="7" fill={OG} fontWeight="bold">EVALUARE</text>
        <line x1="8" y1="24" x2="82" y2="24" stroke={OG} strokeWidth="1" opacity="0.4" />
        <line x1="8" y1="34" x2="82" y2="34" stroke={OG} strokeWidth="1" opacity="0.4" />
        <line x1="8" y1="44" x2="60" y2="44" stroke={OG} strokeWidth="1" opacity="0.4" />
        {/* score badge */}
        <rect x="52" y="48" width="30" height="14" rx="3" fill={OG} />
        <text x="67" y="58" fontFamily="monospace" fontSize="7" fill="white" textAnchor="middle" fontWeight="bold">9.5 / 10</text>
      </g>

      {/* ── floating feedback card top-right ── */}
      <g transform="translate(260, 10) rotate(6)">
        <rect width="88" height="72" rx="6" fill={OG} opacity="0.15" />
        <rect width="88" height="72" rx="6" fill="none" stroke={OG} strokeWidth="1.5" />
        <text x="8" y="18" fontFamily="monospace" fontSize="7" fill={OG} fontWeight="bold">FEEDBACK</text>
        <line x1="8" y1="24" x2="80" y2="24" stroke={OG} strokeWidth="1" opacity="0.4" />
        {/* checkmarks */}
        <path d="M10 36 L14 40 L22 30" stroke={OG} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M10 50 L14 54 L22 44" stroke={OG} strokeWidth="2" fill="none" strokeLinecap="round" />
        <line x1="28" y1="37" x2="78" y2="37" stroke={OG} strokeWidth="1" opacity="0.5" />
        <line x1="28" y1="51" x2="65" y2="51" stroke={OG} strokeWidth="1" opacity="0.5" />
        {/* X mark */}
        <path d="M10 62 L16 68 M16 62 L10 68" stroke={OG} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <line x1="22" y1="65" x2="50" y2="65" stroke={OG} strokeWidth="1" opacity="0.3" />
      </g>

      {/* ── central brain ── */}
      <g transform="translate(88, 82) scale(1.18)">
        <path d="M20 60 C6 55 3 43 6 33 C9 23 18 18 24 21 C25 13 32 8 40 11 C44 4 52 2 59 7 C64 2 73 2 77 8 C84 6 93 10 94 21 C101 23 106 31 103 43 C101 53 93 59 84 58 C78 64 70 66 62 62 C55 68 44 68 37 63 C28 68 21 67 20 60 Z" fill={OG} />
        <circle cx="26" cy="19" r="10" fill={OG} />
        <circle cx="42" cy="12" r="11" fill={OG} />
        <circle cx="59" cy="8"  r="11" fill={OG} />
        <circle cx="77" cy="9"  r="10" fill={OG} />
        <circle cx="91" cy="18" r="9"  fill={OG} />
        <path d="M58 8 L58 64" stroke={OG2} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M34 30 C39 25 45 30 50 25" stroke={OG2} strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M31 44 C37 38 44 44 50 38" stroke={OG2} strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M63 28 C68 23 74 28 79 23" stroke={OG2} strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M63 43 C68 38 74 43 80 38" stroke={OG2} strokeWidth="2" strokeLinecap="round" fill="none" />
        <rect x="50" y="63" width="14" height="14" rx="6" fill={OG} />
        {/* burst */}
        <path d="M121 35 L124 24 L127 35 L138 38 L127 41 L124 52 L121 41 L110 38 Z" fill={OG} />
        <circle cx="107" cy="24" r="3"   fill={OG} />
        <circle cx="140" cy="24" r="2.5" fill={OG} />
        <circle cx="143" cy="52" r="2"   fill={OG} />
        <circle cx="104" cy="50" r="2"   fill={OG} />
      </g>

      {/* ── variants card bottom-left ── */}
      <g transform="translate(4, 168) rotate(5)">
        <rect width="100" height="58" rx="6" fill={OG} opacity="0.15" />
        <rect width="100" height="58" rx="6" fill="none" stroke={OG} strokeWidth="1.5" />
        <text x="8" y="16" fontFamily="monospace" fontSize="6.5" fill={OG} fontWeight="bold">VARIANTE EXAMEN</text>
        <rect x="8"  y="22" width="26" height="14" rx="3" fill={OG} />
        <rect x="38" y="22" width="26" height="14" rx="3" fill={OG} opacity="0.4" />
        <rect x="68" y="22" width="26" height="14" rx="3" fill={OG} opacity="0.4" />
        <text x="21" y="32" fontFamily="monospace" fontSize="6" fill="white" textAnchor="middle">A</text>
        <text x="51" y="32" fontFamily="monospace" fontSize="6" fill={OG} textAnchor="middle">B</text>
        <text x="81" y="32" fontFamily="monospace" fontSize="6" fill={OG} textAnchor="middle">C</text>
        <line x1="8" y1="44" x2="92" y2="44" stroke={OG} strokeWidth="1" opacity="0.3" />
        <text x="8" y="54" fontFamily="monospace" fontSize="6" fill={OG} opacity="0.6">alocare automată · random</text>
      </g>

      {/* ── analytics chip bottom-right ── */}
      <g transform="translate(248, 172) rotate(-4)">
        <rect width="106" height="58" rx="6" fill={OG} opacity="0.15" />
        <rect width="106" height="58" rx="6" fill="none" stroke={OG} strokeWidth="1.5" />
        <text x="8" y="16" fontFamily="monospace" fontSize="6.5" fill={OG} fontWeight="bold">STATISTICI</text>
        {/* bar chart */}
        <rect x="8"  y="40" width="12" height="12" rx="1" fill={OG} />
        <rect x="24" y="32" width="12" height="20" rx="1" fill={OG} />
        <rect x="40" y="26" width="12" height="26" rx="1" fill={OG} />
        <rect x="56" y="34" width="12" height="18" rx="1" fill={OG} opacity="0.7" />
        <rect x="72" y="22" width="12" height="30" rx="1" fill={OG} />
        <rect x="88" y="30" width="12" height="22" rx="1" fill={OG} opacity="0.6" />
        <line x1="6" y1="53" x2="100" y2="53" stroke={OG} strokeWidth="1" opacity="0.4" />
      </g>

      {/* ── small decorative sparkles ── */}
      <path d="M80 14 L82 8 L84 14 L90 16 L84 18 L82 24 L80 18 L74 16 Z" fill={OG} opacity="0.5" />
      <path d="M278 140 L280 134 L282 140 L288 142 L282 144 L280 150 L278 144 L272 142 Z" fill={OG} opacity="0.4" />
      <circle cx="250" cy="70"  r="4" fill={OG} opacity="0.3" />
      <circle cx="106" cy="170" r="3" fill={OG} opacity="0.3" />
      <circle cx="346" cy="100" r="3" fill={OG} opacity="0.25" />
    </svg>
  )
}

// ─── Thin horizontal rule ─────────────────────────────────────────────────────
function Rule({ color }) {
  return <div style={{ height: 1, background: color, opacity: 0.2 }} />
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const { login, register, theme, toggleTheme } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlResetToken = searchParams.get('reset')

  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole]         = useState('student')
  const [authError, setAuthError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [resetNewPassword,    setResetNewPassword]    = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')

  const isDark    = theme === 'dark'
  const pageBg    = isDark ? '#120d06' : '#e8dece'
  const innerBg   = isDark ? '#1a1108' : '#F7F0E3'
  const textMain  = isDark ? '#f5efe0' : '#1a0c00'
  const textMuted = isDark ? '#a89880' : '#6b5040'
  const cardBg    = isDark ? '#221508' : '#fdf7ef'

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault(); setAuthError(''); setIsLoading(true)
    try { await login(email, password); toast.success('Autentificare reușită!') }
    catch (err) { setAuthError(err.message) }
    finally { setIsLoading(false) }
  }

  const handleRegister = async (e) => {
    e.preventDefault(); setAuthError(''); setIsLoading(true)
    try {
      await register({ email, password, fullName, role })
      setAuthMode('login'); toast.success('Cont creat! Te poți autentifica.')
      setEmail(''); setPassword(''); setFullName('')
    } catch (err) { setAuthError(err.message) }
    finally { setIsLoading(false) }
  }

  const handleForgotSubmit = async (e) => {
    e.preventDefault(); setAuthError(''); setIsLoading(true)
    try {
      const res  = await authApi.forgotPassword(email.trim())
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Cererea a eșuat.')
      toast.success(data.message || 'Verifică email-ul.')
    } catch (err) { setAuthError(err.message) }
    finally { setIsLoading(false) }
  }

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault(); setAuthError('')
    if (resetNewPassword.length < 6)                    { setAuthError('Parola trebuie să aibă cel puțin 6 caractere.'); return }
    if (resetNewPassword !== resetConfirmPassword)       { setAuthError('Parolele nu coincid.'); return }
    setIsLoading(true)
    try {
      const res  = await authApi.resetPassword(urlResetToken, resetNewPassword)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Resetarea a eșuat.')
      setSearchParams({}); setResetNewPassword(''); setResetConfirmPassword('')
      setAuthMode('login'); toast.success(data.message || 'Parola a fost actualizată.')
    } catch (err) { setAuthError(err.message) }
    finally { setIsLoading(false) }
  }

  return (
    <div className="flex min-h-screen" style={{ background: pageBg }}>

      {/* ═══════════════════════════════════════════════════════════════════
          LEFT PANEL — illustration (hidden on small screens)
      ═══════════════════════════════════════════════════════════════════ */}
      <div
        className="relative hidden flex-1 lg:flex"
        style={{ background: OG }}
      >
        {/* "RUBRIX" vertical text on the far-left strip */}
        <div className="absolute inset-y-0 left-0 z-10 flex w-11 items-center justify-center" style={{ background: OG }}>
          <span
            className="select-none font-mono text-xs font-bold uppercase tracking-[0.42em] text-white"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            RUBRIX
          </span>
        </div>

        {/* Inner cream/dark area */}
        <div className="ml-11 flex flex-1 flex-col" style={{ background: innerBg }}>
          <LeftScene innerBg={innerBg} textMuted={textMuted} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT PANEL — login / register form
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex w-full flex-col items-center justify-between py-8 lg:w-[420px] lg:shrink-0">

        {/* Theme toggle */}
        <div className="flex w-full justify-end px-8">
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="rounded-full p-2 transition-opacity hover:opacity-80"
            style={{ background: OG, color: '#fff' }}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Centre: the card */}
        <div className="flex w-full flex-1 items-center justify-center px-8">
          <div className="w-full max-w-sm">
            {/* Card */}
            <div
              className="overflow-hidden rounded-sm shadow-lg"
              style={{ border: `2px solid ${OG}`, background: cardBg }}
            >
              {/* Orange top stripe */}
              <div className="px-6 py-2" style={{ background: OG }}>
                <span className="font-mono text-xs font-medium tracking-widest text-white">
                  {urlResetToken ? 'resetare parolă' : authMode === 'register' ? 'cont nou' : 'autentificare'}
                </span>
              </div>

              <div className="px-6 py-6">
                {urlResetToken ? (
                  /* ── Reset password ───────────────────────────── */
                  <form onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-4">
                    <p className="font-mono text-xs" style={{ color: textMuted }}>
                      Alege o parolă nouă pentru contul tău.
                    </p>
                    <FF label="Parolă nouă" color={textMain}>
                      <Input type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" />
                    </FF>
                    <FF label="Confirmă parola" color={textMain}>
                      <Input type="password" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" />
                    </FF>
                    {authError && <FE>{authError}</FE>}
                    <FB disabled={isLoading}>{isLoading ? 'Se salvează...' : 'Salvează parola'}</FB>
                    <BackLink color={textMuted} onClick={() => { setSearchParams({}); setAuthMode('login'); setAuthError('') }}>
                      ← Înapoi la autentificare
                    </BackLink>
                  </form>
                ) : (
                  <>
                    {/* Tab switcher */}
                    <div className="mb-5 flex overflow-hidden rounded" style={{ border: `1.5px solid ${OG}` }}>
                      {[['login', 'Intră în cont'], ['register', 'Cont nou']].map(([id, lbl]) => (
                        <button key={id} type="button"
                          className="flex-1 py-2 font-mono text-xs font-semibold transition-colors"
                          style={{
                            background: (authMode === id || (id === 'login' && authMode === 'forgot')) ? OG : 'transparent',
                            color:      (authMode === id || (id === 'login' && authMode === 'forgot')) ? '#fff' : OG,
                          }}
                          onClick={() => { setAuthMode(id); setAuthError('') }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>

                    {authMode === 'forgot' ? (
                      <form onSubmit={handleForgotSubmit} className="flex flex-col gap-4">
                        <p className="font-mono text-xs" style={{ color: textMuted }}>
                          Introdu email-ul. Vei primi un link de resetare.
                        </p>
                        <FF label="Email" color={textMain}>
                          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@universitate.ro" required autoComplete="email" />
                        </FF>
                        {authError && <FE>{authError}</FE>}
                        <FB disabled={isLoading}>{isLoading ? 'Se trimite...' : 'Trimite link'}</FB>
                        <BackLink color={textMuted} onClick={() => { setAuthMode('login'); setAuthError('') }}>
                          ← Înapoi
                        </BackLink>
                      </form>
                    ) : authMode === 'register' ? (
                      <form onSubmit={handleRegister} className="flex flex-col gap-4">
                        <FF label="Nume complet" color={textMain}>
                          <Input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ion Popescu" autoComplete="name" />
                        </FF>
                        <FF label="Rol" color={textMain}>
                          <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-full rounded-md border px-3 text-sm">
                            <option value="student">Student</option>
                            <option value="professor">Profesor</option>
                          </select>
                        </FF>
                        <FF label="Email" color={textMain}>
                          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@universitate.ro" required autoComplete="email" />
                        </FF>
                        <FF label="Parolă" color={textMain}>
                          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" />
                        </FF>
                        {authError && <FE>{authError}</FE>}
                        <FB disabled={isLoading}>{isLoading ? 'Se procesează...' : 'Creează cont'}</FB>
                      </form>
                    ) : (
                      <form onSubmit={handleLogin} className="flex flex-col gap-4">
                        <FF label="Email" color={textMain}>
                          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@universitate.ro" required autoComplete="email" />
                        </FF>
                        <FF label="Parolă" color={textMain}>
                          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="current-password" />
                        </FF>
                        <div className="flex justify-end">
                          <button type="button" className="font-mono text-[11px] underline underline-offset-2" style={{ color: textMuted }}
                            onClick={() => { setAuthMode('forgot'); setAuthError('') }}>
                            Ai uitat parola?
                          </button>
                        </div>
                        {authError && <FE>{authError}</FE>}
                        <FB disabled={isLoading}>{isLoading ? 'Se procesează...' : 'Intră în cont'}</FB>
                        <p className="mt-1 text-center font-mono text-[9px] leading-snug opacity-60" style={{ color: textMuted }}>
                          <a
                            href="https://drive.google.com/drive/folders/1-Dp8ouWQTaciF0wYYXxBx0NJqzU0WVfi?usp=sharing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-1 hover:opacity-100"
                          >
                            Drive
                          </a>
                          <span aria-hidden> · </span>
                          <a
                            href="https://drive.google.com/drive/folders/1rda-CPkGRp9eu_5kv0OB6uKBo6lwArIc?usp=drive_link"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-1 hover:opacity-100"
                          >
                            Drive 2
                          </a>
                        </p>
                      </form>
                    )}
                  </>
                )}
              </div>

              {/* Bottom brain strip */}
              <Rule color={textMain} />
              <div className="flex justify-center py-3">
                <BrainSVG w={120} h={64} />
              </div>
            </div>

            {/* Below-card footer */}
            <div className="mt-4 flex justify-between px-1">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: OG }}>Spune salut</p>
                <p className="font-mono text-[10px]" style={{ color: textMuted }}>Sugestii sau probleme?</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px]" style={{ color: textMuted }}>rubrix · platformă educațională</p>
                <p className="font-mono text-[10px]" style={{ color: textMuted }}>evaluare & feedback automat</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom spacer to balance the top toggle row */}
        <div className="h-10" />
      </div>
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function FF({ label, color, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</Label>
      {children}
    </div>
  )
}

function FE({ children }) {
  return (
    <p className="rounded px-2.5 py-2 font-mono text-xs" style={{ background: 'rgba(229,91,32,0.12)', color: OG, border: `1px solid ${OG}` }}>
      {children}
    </p>
  )
}

function FB({ children, disabled }) {
  return (
    <button type="submit" disabled={disabled}
      className="mt-1 w-full py-2.5 font-mono text-xs font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: OG }}>
      {children}
    </button>
  )
}

function BackLink({ children, color, onClick }) {
  return (
    <button type="button" className="font-mono text-xs underline underline-offset-2" style={{ color }} onClick={onClick}>
      {children}
    </button>
  )
}
