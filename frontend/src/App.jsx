import { useCallback, useEffect, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts'
import Silk from './components/Silk'
import AnimeTimer from './components/AnimeTimer'
import { ParticleCard, GlobalSpotlight, useMobileDetection } from './components/MagicBento'
import rubrixLogo from './assets/rubrix-logo.svg'
import PublicExam from './PublicExam.jsx'
import './App.css'

/** datetime-local (ora locală) → ISO UTC pentru API */
function localDatetimeInputToIso(localStr) {
  if (!localStr || !String(localStr).trim()) return null
  const d = new Date(localStr)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function isoToDatetimeLocalValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Etichetă scurtă pentru carduri (profesor): starea ferestrei de programare */
function getEvaluationQuestionCount(a) {
  if (a == null) return 0
  if (typeof a.question_count === 'number') return a.question_count
  return (a.questions || []).length
}

/** Text dinamic: „peste 2 min 15s” până la ISO start */
function formatCountdownToStart(iso) {
  if (!iso) return ''
  const end = new Date(iso).getTime()
  const t = end - Date.now()
  if (t <= 0) return 'Se deschide acum…'
  const s = Math.floor(t / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d} zile, ${h} h`
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${sec} s`
  return `${sec} s`
}

/** Countdown din secunde (ex. răspuns server `seconds_until_start`). */
function formatSecondsCountdown(totalSec) {
  if (totalSec == null || totalSec < 0) return '—'
  const s = Math.floor(totalSec)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d} zile, ${h} h`
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${sec} s`
  return `${sec} s`
}

function studentCardScheduleLine(a) {
  const st = a.start_at || a.scheduled_starts_at
  if (a.lifecycle_status === 'scheduled' && st) {
    return `Programată — începe la ${new Date(st).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}`
  }
  if (a.lifecycle_status === 'closed') {
    return 'Închisă (fereastră sau manual)'
  }
  if (a.schedule_access_blocked) {
    if (a.schedule_block_kind === 'before_start' && st) {
      return `Începe la ${new Date(st).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}`
    }
    if (a.schedule_block_kind === 'after_end') {
      return 'Perioada de acces s-a încheiat'
    }
    return a.schedule_block_message || null
  }
  return null
}

function formatEvaluationScheduleLabel({ status, scheduled_starts_at, scheduled_ends_at, start_at, end_at }) {
  const startIso = start_at || scheduled_starts_at
  const endIso = end_at || scheduled_ends_at
  if (status !== 'active') return null
  if (!startIso && !endIso) return null
  const fmt = (iso) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })
  }
  const now = Date.now()
  const startMs = startIso ? new Date(startIso).getTime() : null
  const endMs = endIso ? new Date(endIso).getTime() : null
  if (startMs != null && !Number.isNaN(startMs) && now < startMs) {
    return `Începe ${fmt(startIso)}`
  }
  if (endMs != null && !Number.isNaN(endMs) && now > endMs) {
    return 'Fereastra s-a încheiat'
  }
  const parts = []
  if (startIso) parts.push(`de la ${fmt(startIso)}`)
  if (endIso) parts.push(`până la ${fmt(endIso)}`)
  return parts.length ? `Acces studenți: ${parts.join(' ')}` : null
}

/** minute în română pentru mesaje de formular */
function formatMinutesRo(n) {
  const x = Math.floor(Number(n))
  if (x === 1) return '1 minut'
  return `${x} minute`
}

/** Avertizare non-blocking: fereastra de acces mai scurtă decât durata evaluării */
function accessWindowShorterThanDurationWarning(durationMinutes, scheduledStartsAtLocal, scheduledEndsAtLocal) {
  const dm = Number(durationMinutes)
  if (!dm || dm <= 0) return null
  const a = String(scheduledStartsAtLocal || '').trim()
  const b = String(scheduledEndsAtLocal || '').trim()
  if (!a || !b) return null
  const s = new Date(a).getTime()
  const e = new Date(b).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
  const windowMinutes = Math.floor((e - s) / 60000)
  if (windowMinutes <= 0 || windowMinutes >= dm) return null
  return { windowMinutes, durationMinutes: dm }
}

/** Un singur badge: draft / programată / activă / încheiată / închis (listă + detaliu) */
function unifiedEvalStatusBadge(assessment) {
  if (assessment.status === 'draft') {
    return { className: 'status-badge draft', label: 'draft' }
  }
  if (assessment.status === 'closed') {
    return { className: 'status-badge closed', label: 'închis' }
  }
  const life = assessment.lifecycle_status
  if (life === 'scheduled') {
    return { className: 'status-badge lifecycle-scheduled', label: 'programată' }
  }
  if (life === 'closed') {
    return { className: 'status-badge lifecycle-closed', label: 'încheiată' }
  }
  if (life === 'active') {
    return { className: 'status-badge lifecycle-active', label: 'activă' }
  }
  return { className: 'status-badge active', label: 'activă' }
}

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
      }
    })
  }, [])

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 230 60"
      className="rubrix-draw-title"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="rubrixStrokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="50%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id="rubrixFillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
        <filter id="rubrixGlow">
          <feGaussianBlur stdDeviation="2" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* R */}
      <path className="rubrix-letter" d="M10 50 L10 10 L30 10 Q42 10 42 22 Q42 34 30 34 L10 34 M30 34 L44 50"
        stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />

      {/* u */}
      <path className="rubrix-letter" d="M58 22 L58 40 Q58 50 68 50 L76 50 Q86 50 86 40 L86 22"
        stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />

      {/* b */}
      <path className="rubrix-letter" d="M100 8 L100 50 L100 40 Q100 22 115 22 Q130 22 130 36 Q130 50 115 50 L100 50"
        stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />

      {/* r */}
      <path className="rubrix-letter rubrix-stroke-only" d="M146 50 L146 30 Q146 22 156 22 L162 22"
        stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />

      {/* i */}
      <path className="rubrix-letter rubrix-stroke-only" d="M178 50 L178 22 M176 11 Q178 7 180 11 Q178 15 176 11"
        stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />

      {/* x */}
      <path className="rubrix-letter" d="M196 22 L220 50 M220 22 L196 50"
        stroke="url(#rubrixStrokeGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="transparent" filter="url(#rubrixGlow)" />
    </svg>
  )
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const API_PREFIX = '/api/v1'

// Icons as simple SVG components
const Icons = {
  Logo: () => (
    <img src={rubrixLogo} alt="Rubrix" width="28" height="28" />
  ),
  Dashboard: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/>
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
    </svg>
  ),
  Logout: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
    </svg>
  ),
  Document: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
    </svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
    </svg>
  ),
  People: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
    </svg>
  ),
  Trend: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
    </svg>
  ),
  Search: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
    </svg>
  ),
  Arrow: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
    </svg>
  ),
  Back: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
    </svg>
  ),
  Edit: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  ),
  Delete: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  ),
  Send: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  ),
  Chart: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/>
    </svg>
  ),
  Pdf: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </svg>
  ),
  Sun: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M12 7a5 5 0 100 10 5 5 0 000-10zM2 13h2v-2H2v2zm18 0h2v-2h-2v2zm-8 8h2v-2h-2v2zm0-18h2V2h-2v2zm7.07 3.93l1.41-1.41-1.79-1.79-1.41 1.41 1.79 1.79zM4.22 19.78l1.41-1.41-1.79-1.79-1.41 1.41 1.79 1.79zm15.56 0l1.79-1.79-1.41-1.41-1.79 1.79 1.41 1.41zM4.22 4.22l1.79-1.79 1.41 1.41-1.79 1.79-1.41-1.41z"/>
    </svg>
  ),
  Moon: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M12.34 2.02C6.59 1.82 2 6.62 2 12.26c0 5.52 4.48 10 10 10 3.71 0 6.93-2.02 8.66-5.02-8.56-.5-15.36-7.29-15.92-15.96-.03-.1-.04-.19-.4-.26z"/>
    </svg>
  ),
  User: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
    </svg>
  )
}

const initialAuthState = { email: '', password: '', fullName: '', role: 'student' }

function parsePublicLinkFromPath() {
  if (typeof window === 'undefined') return null
  const m = window.location.pathname.match(/^\/public\/([a-f0-9-]{36})\/?$/i)
  return m ? m[1] : null
}

/** Token din linkul din email: /?reset=... */
function parseResetTokenFromUrl() {
  if (typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search).get('reset')
  return q && q.length >= 10 ? q : null
}

function App() {
  const [publicLinkId] = useState(parsePublicLinkFromPath)
  const [urlResetToken, setUrlResetToken] = useState(parseResetTokenFromUrl)
  const [token, setToken] = useState(() => localStorage.getItem('auth_token') ?? '')
  const [user, setUser] = useState(null)
  const [view, setView] = useState('dashboard')
  const [assessments, setAssessments] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, responses: 0, avgScore: 0 })
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Auth state
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(initialAuthState)
  const [authError, setAuthError] = useState('')
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetConfirmPassword, setResetConfirmPassword] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)

  // Assessment form state
  const [editingAssessment, setEditingAssessment] = useState(null)
  const [assessmentForm, setAssessmentForm] = useState({
    title: '',
    subject: '',
    description: '',
    duration: 30,
    status: 'draft',
    scheduled_starts_at: '',
    scheduled_ends_at: '',
    questions: []
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Assessment detail view
  const [selectedAssessment, setSelectedAssessment] = useState(null)
  const [answers, setAnswers] = useState({})
  const [feedbackResults, setFeedbackResults] = useState({})
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false)
  const [feedbackMode, setFeedbackMode] = useState('ai')
  const [studentResponses, setStudentResponses] = useState([])
  const [myResponses, setMyResponses] = useState([])
  const [myAllResponses, setMyAllResponses] = useState([])
  const [analyticsData, setAnalyticsData] = useState(null)
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false)
  const [isMyResponsesLoading, setIsMyResponsesLoading] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [profileAvatarFile, setProfileAvatarFile] = useState(null)
  const [profileLocalAvatarUrl, setProfileLocalAvatarUrl] = useState(null)
  const [profileRemoteAvatarUrl, setProfileRemoteAvatarUrl] = useState(null)
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const profileAvatarInputRef = useRef(null)
  const [detailTab, setDetailTab] = useState('questions')
  const [reevalForm, setReevalForm] = useState({})
  const [expandedStudents, setExpandedStudents] = useState({})
  const [joinCode, setJoinCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [evalAnalytics, setEvalAnalytics] = useState(null)

  const [theme, setTheme] = useState(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem('rubrix-theme') === 'light'
      ? 'light'
      : 'dark'
  )

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [timerExpired, setTimerExpired] = useState(false)
  /** Re-render pentru countdown „începe în X” pe pagina de detaliu */
  const [scheduleTick, setScheduleTick] = useState(0)
  /** Countdown până la start_at, sincron cu server (seconds_until_start), decrement local */
  const [gateSecondsLeft, setGateSecondsLeft] = useState(null)
  const timerRef = useRef(null)
  const autoSubmitRef = useRef(false)

  const dashboardGridRef = useRef(null)
  const isProfessor = user?.role === 'professor'
  const isMobile = useMobileDetection()

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token)
    } else {
      localStorage.removeItem('auth_token')
    }
  }, [token])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light')
      localStorage.setItem('rubrix-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
      localStorage.removeItem('rubrix-theme')
    }
  }, [theme])

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('')
        setSuccess('')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || timerExpired) return
    if (timeRemaining <= 0) {
      setTimerExpired(true)
      clearInterval(timerRef.current)
      if (!autoSubmitRef.current) {
        autoSubmitRef.current = true
      }
      return
    }
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setTimerExpired(true)
          if (!autoSubmitRef.current) {
            autoSubmitRef.current = true
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [timeRemaining, timerExpired])

  // Auto-submit when timer expires
  useEffect(() => {
    const examWin =
      !selectedAssessment?.lifecycle_status || selectedAssessment.lifecycle_status === 'active'
    if (
      timerExpired &&
      autoSubmitRef.current &&
      selectedAssessment &&
      examWin &&
      !selectedAssessment.schedule_access_blocked
    ) {
      autoSubmitRef.current = false
      const questions = selectedAssessment.questions || []
      const hasAnyAnswer = questions.some((q) => answers[q.id]?.trim())
      if (hasAnyAnswer) {
        (async () => {
          for (const q of questions) {
            if (feedbackResults[q.id]) continue
            const ans = answers[q.id]
            if (ans?.trim()) {
              await handleSubmitAnswer(q.id, ans)
            }
          }
          setSuccess('Timpul a expirat! Răspunsurile au fost trimise automat.')
        })()
      } else {
        setError('Timpul a expirat! Nu ai completat niciun răspuns.')
      }
    }
  }, [timerExpired])

  useEffect(() => {
    if (selectedAssessment?.seconds_until_start != null) {
      setGateSecondsLeft(selectedAssessment.seconds_until_start)
    } else {
      setGateSecondsLeft(null)
    }
  }, [selectedAssessment?.id, selectedAssessment?.seconds_until_start])

  useEffect(() => {
    const isScheduled =
      selectedAssessment?.lifecycle_status === 'scheduled' ||
      (selectedAssessment?.schedule_access_blocked && selectedAssessment?.schedule_block_kind === 'before_start')
    if (view !== 'detail' || !isScheduled) {
      return
    }
    const id = setInterval(() => setScheduleTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [view, selectedAssessment?.id, selectedAssessment?.lifecycle_status, selectedAssessment?.schedule_access_blocked, selectedAssessment?.schedule_block_kind])

  useEffect(() => {
    const isScheduled =
      selectedAssessment?.lifecycle_status === 'scheduled' ||
      (selectedAssessment?.schedule_access_blocked && selectedAssessment?.schedule_block_kind === 'before_start')
    if (view !== 'detail' || !isScheduled) return
    const id = setInterval(() => {
      setGateSecondsLeft((s) => (s != null && s > 0 ? s - 1 : s))
    }, 1000)
    return () => clearInterval(id)
  }, [
    view,
    selectedAssessment?.id,
    selectedAssessment?.lifecycle_status,
    selectedAssessment?.schedule_access_blocked,
    selectedAssessment?.schedule_block_kind,
  ])

  useEffect(() => {
    if (view !== 'detail' || user?.role === 'professor' || !token || !selectedAssessment) return
    const isScheduled =
      selectedAssessment.lifecycle_status === 'scheduled' ||
      (selectedAssessment.schedule_access_blocked && selectedAssessment.schedule_block_kind === 'before_start')
    if (!isScheduled) {
      return
    }
    const evalId = selectedAssessment.id
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${evalId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (!data.schedule_access_blocked) {
          setSelectedAssessment(data)
          setError('')
          try {
            const srRes = await fetch(`${API_URL}${API_PREFIX}/evaluations/${evalId}/start`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            })
            if (srRes.ok) {
              const { seconds_remaining } = await srRes.json()
              if (seconds_remaining <= 0) {
                setTimeRemaining(0)
                setTimerExpired(true)
              } else {
                setTimeRemaining(seconds_remaining)
                setTimerExpired(false)
              }
            }
          } catch {
            /* ignore */
          }
          autoSubmitRef.current = false
        }
      } catch {
        /* ignore */
      }
    }
    const id = setInterval(poll, 4000)
    poll()
    const onVis = () => {
      if (document.visibilityState === 'visible') poll()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [
    view,
    user?.role,
    token,
    selectedAssessment?.id,
    selectedAssessment?.schedule_access_blocked,
    selectedAssessment?.schedule_block_kind,
  ])

  const fetchProfile = useCallback(async () => {
    if (!token) {
      setUser(null)
      return
    }
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error()
      setUser(await res.json())
    } catch {
      setUser(null)
      setToken('')
    }
  }, [token])

  const fetchAssessments = useCallback(async () => {
    if (!token) return
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAssessments(data.evaluations ?? [])
        setStats(data.stats ?? { total: 0, active: 0, responses: 0, avgScore: 0 })
      }
    } catch {
      setError('Nu s-au putut încărca evaluările.')
    } finally {
      setIsLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  useEffect(() => {
    if (user) fetchAssessments()
  }, [user, fetchAssessments])

  useEffect(() => {
    if (!token || !user?.has_avatar) {
      setProfileRemoteAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return undefined
    }
    let cancelled = false
    ;(async () => {
      const res = await fetch(`${API_URL}${API_PREFIX}/auth/me/avatar`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok || cancelled) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (cancelled) {
        URL.revokeObjectURL(url)
        return
      }
      setProfileRemoteAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    })()
    return () => {
      cancelled = true
    }
  }, [token, user?.has_avatar])

  useEffect(() => {
    if (view !== 'profile' || !user) return
    setProfileForm({
      fullName: user.full_name || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
    setProfileAvatarFile(null)
    setProfileLocalAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    if (profileAvatarInputRef.current) profileAvatarInputRef.current.value = ''
  }, [view, user?.id])

  const handleAuthChange = (field) => (e) => {
    setAuthForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setIsAuthLoading(true)
    try {
      if (authMode === 'register') {
        const res = await fetch(`${API_URL}${API_PREFIX}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password,
            full_name: authForm.fullName,
            role: authForm.role
          })
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail ?? 'Înregistrarea a eșuat')
        }
        setAuthMode('login')
        setAuthError('')
        setAuthForm(initialAuthState)
        return
      }

      const res = await fetch(`${API_URL}${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: authForm.email, password: authForm.password })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Autentificarea a eșuat')
      }
      const data = await res.json()
      setToken(data.access_token)
      setAuthForm(initialAuthState)
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsAuthLoading(false)
    }
  }

  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setForgotPasswordMessage('')
    setIsAuthLoading(true)
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authForm.email.trim() })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data.detail
        throw new Error(typeof d === 'string' ? d : 'Cererea a eșuat.')
      }
      setForgotPasswordMessage(data.message ?? '')
      setAuthForm((p) => ({ ...p, password: '' }))
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsAuthLoading(false)
    }
  }

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setForgotPasswordMessage('')
    if (resetNewPassword.length < 6) {
      setAuthError('Parola trebuie să aibă cel puțin 6 caractere.')
      return
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setAuthError('Parolele nu coincid.')
      return
    }
    if (!urlResetToken) {
      setAuthError('Linkul de resetare lipsește. Deschide din nou linkul din email.')
      return
    }
    setIsAuthLoading(true)
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: urlResetToken, new_password: resetNewPassword })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data.detail
        throw new Error(typeof d === 'string' ? d : 'Resetarea a eșuat.')
      }
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href)
        u.searchParams.delete('reset')
        const tail = u.search ? u.search + u.hash : u.hash
        window.history.replaceState({}, '', u.pathname + tail)
      }
      setUrlResetToken(null)
      setResetNewPassword('')
      setResetConfirmPassword('')
      setAuthMode('login')
      setForgotPasswordMessage(data.message ?? 'Parola a fost actualizată.')
      setAuthForm((p) => ({ ...p, password: '' }))
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setIsAuthLoading(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    setUser(null)
    setAssessments([])
    setView('dashboard')
    setProfileRemoteAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const handleProfileAvatarPick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setProfileLocalAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
    setProfileAvatarFile(f)
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
      setError('Parolele noi nu coincid.')
      return
    }
    if (profileForm.newPassword && profileForm.newPassword.length < 6) {
      setError('Parola nouă trebuie să aibă cel puțin 6 caractere.')
      return
    }
    setIsProfileSaving(true)
    try {
      const patchBody = {}
      const nameTrim = profileForm.fullName.trim()
      if (nameTrim !== (user.full_name || '')) {
        patchBody.full_name = nameTrim || null
      }
      if (profileForm.newPassword) {
        if (!profileForm.currentPassword) {
          setError('Introdu parola curentă pentru a schimba parola.')
          setIsProfileSaving(false)
          return
        }
        patchBody.current_password = profileForm.currentPassword
        patchBody.new_password = profileForm.newPassword
      }
      if (Object.keys(patchBody).length > 0) {
        const res = await fetch(`${API_URL}${API_PREFIX}/auth/me`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(patchBody)
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(typeof err.detail === 'string' ? err.detail : 'Nu s-a putut salva profilul.')
        }
      }
      if (profileAvatarFile) {
        const fd = new FormData()
        fd.append('file', profileAvatarFile)
        const res = await fetch(`${API_URL}${API_PREFIX}/auth/me/avatar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(typeof err.detail === 'string' ? err.detail : 'Încărcarea avatarului a eșuat.')
        }
      }
      if (Object.keys(patchBody).length === 0 && !profileAvatarFile) {
        setSuccess('Nicio modificare de salvat.')
        setIsProfileSaving(false)
        return
      }
      await fetchProfile()
      setProfileForm((p) => ({
        ...p,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }))
      setProfileAvatarFile(null)
      setProfileLocalAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      if (profileAvatarInputRef.current) profileAvatarInputRef.current.value = ''
      setSuccess('Profil salvat.')
    } catch (err) {
      setError(err.message || 'Eroare la salvare.')
    } finally {
      setIsProfileSaving(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/auth/me/avatar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(typeof err.detail === 'string' ? err.detail : 'Nu s-a putut elimina avatarul.')
      }
      await fetchProfile()
      setProfileAvatarFile(null)
      setProfileLocalAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      if (profileAvatarInputRef.current) profileAvatarInputRef.current.value = ''
      setSuccess('Avatar eliminat.')
    } catch (err) {
      setError(err.message || 'Eroare.')
    }
  }

  const QUESTION_TYPES = [
    { value: 'long_answer', label: 'Răspuns lung' },
    { value: 'short_answer', label: 'Răspuns scurt' },
    { value: 'multiple_choice', label: 'Alegere singulară' },
    { value: 'checkboxes', label: 'Checkbox-uri' },
  ]

  const emptyQuestion = () => ({
    _key: Date.now() + Math.random(),
    question_type: 'long_answer',
    text: '',
    options: null,
    correct_answer: '',
    points: 10,
  })

  const resetAssessmentForm = () => {
    setAssessmentForm({
      title: '',
      subject: '',
      description: '',
      duration: 30,
      status: 'draft',
      scheduled_starts_at: '',
      scheduled_ends_at: '',
      questions: [],
    })
    setEditingAssessment(null)
  }

  const handleSaveAssessment = async (e) => {
    e.preventDefault()
    if (!assessmentForm.title.trim()) {
      setError('Titlul este obligatoriu.')
      return
    }
    
    setIsSubmitting(true)
    setError('')
    
    try {
      const url = editingAssessment
        ? `${API_URL}${API_PREFIX}/evaluations/${editingAssessment.id}`
        : `${API_URL}${API_PREFIX}/evaluations/`
      
      const { questions: qList, scheduled_starts_at: _ss, scheduled_ends_at: _se, ...formRest } = assessmentForm
      const payload = {
        ...formRest,
        start_at: localDatetimeInputToIso(assessmentForm.scheduled_starts_at),
        end_at: localDatetimeInputToIso(assessmentForm.scheduled_ends_at),
        questions: qList.map(({ _key, ...rest }, idx) => ({
          ...rest,
          order: idx,
        })),
      }
      const res = await fetch(url, {
        method: editingAssessment ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'A apărut o eroare.')
      }
      
      setSuccess(editingAssessment ? 'Evaluare actualizată!' : 'Evaluare creată cu succes!')
      resetAssessmentForm()
      setView('dashboard')
      fetchAssessments()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditAssessment = (assessment) => {
    setEditingAssessment(assessment)
    setAssessmentForm({
      title: assessment.title,
      subject: assessment.subject || '',
      description: assessment.description || '',
      duration: assessment.duration,
      status: assessment.status,
      scheduled_starts_at: isoToDatetimeLocalValue(assessment.start_at || assessment.scheduled_starts_at),
      scheduled_ends_at: isoToDatetimeLocalValue(assessment.end_at || assessment.scheduled_ends_at),
      questions: (assessment.questions || []).map((q) => ({
        ...q,
        _key: q.id || Date.now() + Math.random(),
        options: q.options || null,
        correct_answer: q.correct_answer || '',
      })),
    })
    setView('new')
  }

  const addQuestion = () => {
    setAssessmentForm((p) => ({
      ...p,
      questions: [...p.questions, emptyQuestion()],
    }))
  }

  const updateQuestion = (index, field, value) => {
    setAssessmentForm((p) => {
      const questions = [...p.questions]
      questions[index] = { ...questions[index], [field]: value }
      if (field === 'question_type') {
        if (value === 'multiple_choice' || value === 'checkboxes') {
          if (!questions[index].options || questions[index].options.length === 0) {
            questions[index].options = ['', '', '', '']
          }
        } else {
          questions[index].options = null
        }
        questions[index].correct_answer = ''
      }
      return { ...p, questions }
    })
  }

  const updateOption = (qIndex, optIndex, value) => {
    setAssessmentForm((p) => {
      const questions = [...p.questions]
      const q = { ...questions[qIndex] }
      const oldValue = (q.options || [])[optIndex]
      const options = [...(q.options || [])]
      options[optIndex] = value
      q.options = options

      if (q.question_type === 'multiple_choice' && q.correct_answer === oldValue) {
        q.correct_answer = value
      } else if (q.question_type === 'checkboxes' && q.correct_answer) {
        const parts = q.correct_answer.split('||').map(s => s.trim())
        const fi = parts.indexOf(oldValue)
        if (fi !== -1) {
          parts[fi] = value
          q.correct_answer = parts.join('||')
        }
      }

      questions[qIndex] = q
      return { ...p, questions }
    })
  }

  const addOption = (qIndex) => {
    setAssessmentForm((p) => {
      const questions = [...p.questions]
      const options = [...(questions[qIndex].options || []), '']
      questions[qIndex] = { ...questions[qIndex], options }
      return { ...p, questions }
    })
  }

  const removeOption = (qIndex, optIndex) => {
    setAssessmentForm((p) => {
      const questions = [...p.questions]
      const q = { ...questions[qIndex] }
      const removedValue = (q.options || [])[optIndex]
      q.options = (q.options || []).filter((_, i) => i !== optIndex)

      if (q.question_type === 'multiple_choice' && q.correct_answer === removedValue) {
        q.correct_answer = ''
      } else if (q.question_type === 'checkboxes' && q.correct_answer) {
        const parts = q.correct_answer.split('||').map(s => s.trim()).filter(s => s !== removedValue)
        q.correct_answer = parts.join('||')
      }

      questions[qIndex] = q
      return { ...p, questions }
    })
  }

  const removeQuestion = (index) => {
    setAssessmentForm((p) => ({
      ...p,
      questions: p.questions.filter((_, i) => i !== index),
    }))
  }

  const moveQuestion = (index, direction) => {
    setAssessmentForm((p) => {
      const questions = [...p.questions]
      const target = index + direction
      if (target < 0 || target >= questions.length) return p
      ;[questions[index], questions[target]] = [questions[target], questions[index]]
      return { ...p, questions }
    })
  }

  const handleDeleteAssessment = async (id) => {
    if (!window.confirm('Sigur vrei să ștergi această evaluare?')) return
    
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) throw new Error('Ștergerea a eșuat.')
      
      setSuccess('Evaluare ștearsă!')
      fetchAssessments()
      if (selectedAssessment?.id === id) {
        setSelectedAssessment(null)
        setView('dashboard')
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleOpenAssessment = async (assessment) => {
    setError('')
    setSelectedAssessment(assessment)
    setAnswers({})
    setFeedbackResults({})
    setMyResponses([])
    setDetailTab('questions')
    setStudentResponses([])
    setReevalForm({})
    setExpandedStudents({})
    setEvalAnalytics(null)
    setView('detail')

    const isOwner = user?.role === 'professor' && assessment.author_id === user?.id

    if (isOwner) {
      setTimeRemaining(null)
      setTimerExpired(false)
      autoSubmitRef.current = false
      await fetchStudentResponses(assessment.id)
      return
    }

    let latest = assessment
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${assessment.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        latest = await res.json()
        setSelectedAssessment(latest)
      }
    } catch {
      /* păstrăm snapshot-ul din listă */
    }

    if (latest.schedule_access_blocked) {
      setTimeRemaining(null)
      setTimerExpired(false)
      autoSubmitRef.current = false
    } else if (latest.duration) {
      try {
        const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${latest.id}/start`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const { seconds_remaining } = await res.json()
          if (seconds_remaining <= 0) {
            setTimeRemaining(0)
            setTimerExpired(true)
          } else {
            setTimeRemaining(seconds_remaining)
            setTimerExpired(false)
          }
        } else {
          setTimeRemaining(null)
          setTimerExpired(false)
        }
      } catch {
        setTimeRemaining(null)
        setTimerExpired(false)
      }
      autoSubmitRef.current = false
    } else {
      setTimeRemaining(null)
      setTimerExpired(false)
      autoSubmitRef.current = false
    }

    const loadedResponses = await fetchMyResponses(assessment.id)
    if (loadedResponses?.length) {
      const latestByQuestion = loadedResponses.reduce((acc, response) => {
        if (!response.question_id) return acc
        if (!acc[response.question_id]) {
          acc[response.question_id] = response
        }
        return acc
      }, {})

      const existingAnswers = {}
      const existingFeedback = {}
      for (const [questionId, response] of Object.entries(latestByQuestion)) {
        existingAnswers[questionId] = response.answer_text || ''
        existingFeedback[questionId] = {
          response_id: response.id,
          score: response.score,
          is_correct: response.is_correct,
          feedback: response.feedback || [],
        }
      }

      setAnswers(existingAnswers)
      setFeedbackResults(existingFeedback)

      const totalQuestions = getEvaluationQuestionCount(latest)
      const submittedCount = Object.keys(existingFeedback).length
      if (submittedCount >= totalQuestions && totalQuestions > 0) {
        clearInterval(timerRef.current)
        setTimeRemaining(null)
      }
    }
  }

  const handleSubmitAnswer = async (questionId, answerText) => {
    if (feedbackResults[questionId]) {
      return
    }
    if (!answerText?.trim()) {
      setError('Introdu un răspuns.')
      return
    }
    
    setIsGeneratingFeedback(true)
    setError('')
    
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/feedback/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          answer: answerText,
          evaluation_id: selectedAssessment.id,
          question_id: questionId,
          mode: feedbackMode
        })
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Nu s-a putut genera feedback-ul.')
      }
      
      const data = await res.json()
      setFeedbackResults((prev) => ({ ...prev, [questionId]: data }))
      fetchAssessments()
      if (selectedAssessment && user?.role === 'student') {
        await fetchMyResponses(selectedAssessment.id)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsGeneratingFeedback(false)
    }
  }

  const handleSubmitAllAnswers = async (e) => {
    e.preventDefault()
    const questions = selectedAssessment.questions || []
    if (questions.length === 0) return

    const unanswered = questions.filter((q) => !answers[q.id]?.trim())
    if (unanswered.length > 0) {
      setError(`Trebuie să răspunzi la toate întrebările înainte de a trimite. Mai ai ${unanswered.length} întrebare${unanswered.length > 1 ? 'i' : ''} fără răspuns.`)
      return
    }

    const questionsToSubmit = questions.filter((q) => !feedbackResults[q.id])
    if (questionsToSubmit.length === 0) {
      setSuccess('Ai trimis deja toate răspunsurile pentru această evaluare.')
      return
    }

    for (const q of questionsToSubmit) {
      const ans = answers[q.id]
      if (ans?.trim()) {
        await handleSubmitAnswer(q.id, ans)
      }
    }
    // Stop timer after successful submission
    clearInterval(timerRef.current)
    setTimeRemaining(null)
    setSuccess('Toate răspunsurile au fost trimise!')
  }

  const fetchStudentResponses = async (evaluationId) => {
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${evaluationId}/responses`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setStudentResponses(data)
        return data
      }
    } catch {
      setError('Nu s-au putut încărca răspunsurile studenților.')
    }
    return []
  }

  const fetchEvalAnalytics = async (evaluationId) => {
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${evaluationId}/analytics`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setEvalAnalytics(data)
        return data
      }
    } catch {
      setError('Nu s-au putut încărca datele analitice.')
    }
    return null
  }

  const handleExportPdf = async () => {
    if (!selectedAssessment?.id) return
    setIsExportingPdf(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${selectedAssessment.id}/export/pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Exportul PDF a eșuat.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `evaluare-${selectedAssessment.id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setSuccess('PDF-ul a fost descărcat.')
    } catch (err) {
      setError(err.message || 'Exportul PDF a eșuat.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  const fetchMyResponses = async (evaluationId) => {
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${evaluationId}/my-responses`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMyResponses(data)
        return data
      }
    } catch {
      setError('Nu s-au putut încărca răspunsurile tale anterioare.')
    }
    return []
  }

  const fetchMyAllResponses = async () => {
    setIsMyResponsesLoading(true)
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/my-responses`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMyAllResponses(data)
        return data
      }
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Nu s-au putut încărca răspunsurile tale.')
    } catch (err) {
      setError(err.message || 'Nu s-au putut încărca răspunsurile tale.')
      return []
    } finally {
      setIsMyResponsesLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    setIsAnalyticsLoading(true)
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/analytics/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setAnalyticsData(await res.json())
      }
    } catch {
      setError('Nu s-au putut încărca analizele.')
    } finally {
      setIsAnalyticsLoading(false)
    }
  }

  const handleOpenAnalytics = () => {
    setView('analytics')
    fetchAnalytics()
  }

  const handleOpenMyResponses = async () => {
    await fetchMyAllResponses()
    setView('my-responses')
  }

  const handleJoinByCode = async () => {
    const code = joinCode.trim().toUpperCase()
    if (!code) {
      setError('Introdu un cod de acces.')
      return
    }
    setIsJoining(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Cod invalid.')
      }
      setJoinCode('')
      setSuccess('Te-ai înscris la evaluare! O găsești mai jos.')
      await fetchAssessments()
    } catch (e) {
      setError(e.message || 'Nu s-a putut folosi codul.')
    } finally {
      setIsJoining(false)
    }
  }

  const handleRegenerateAccessCode = async () => {
    if (!selectedAssessment?.id) return
    try {
      const res = await fetch(
        `${API_URL}${API_PREFIX}/evaluations/${selectedAssessment.id}/regenerate-access-code`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        setSelectedAssessment(await res.json())
        setSuccess('Codul de acces a fost regenerat.')
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.detail ?? 'Eroare')
      }
    } catch {
      setError('Eroare la regenerare.')
    }
  }

  const handleTogglePublicLink = async (enabled) => {
    if (!selectedAssessment?.id) return
    try {
      const res = await fetch(
        `${API_URL}${API_PREFIX}/evaluations/${selectedAssessment.id}/public-link`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ enabled }),
        }
      )
      if (res.ok) {
        setSelectedAssessment(await res.json())
        setSuccess(enabled ? 'Link public activat.' : 'Link public dezactivat.')
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.detail ?? 'Eroare')
      }
    } catch {
      setError('Eroare.')
    }
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess('Copiat în clipboard.')
    } catch {
      setError('Nu s-a putut copia.')
    }
  }

  const handleReevaluate = async (responseId) => {
    const form = reevalForm[responseId]
    if (!form?.score && !form?.feedback_message) return

    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/responses/${responseId}/feedback`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          score: form.score != null ? Number(form.score) : undefined,
          feedback_message: form.feedback_message || undefined,
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Reevaluarea a eșuat.')
      }
      setSuccess('Reevaluare salvată!')
      setReevalForm((p) => ({ ...p, [responseId]: {} }))
      if (selectedAssessment) fetchStudentResponses(selectedAssessment.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const toggleStudent = (userId) => {
    setExpandedStudents((prev) => ({ ...prev, [userId]: !prev[userId] }))
  }

  const filteredAssessments = assessments.filter((a) => {
    const matchesFilter = filter === 'all' || a.status === filter
    const matchesSearch =
      !search ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.subject?.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const isAuthenticated = Boolean(token && user)

  if (publicLinkId) {
    return <PublicExam linkId={publicLinkId} apiUrl={API_URL} />
  }

  // Auth screen
  if (!isAuthenticated) {
    return (
      <div className="auth-page">
        <button
          type="button"
          className="auth-theme-toggle"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          title={theme === 'dark' ? 'Temă deschisă' : 'Temă întunecată'}
          aria-label={theme === 'dark' ? 'Activează tema deschisă' : 'Activează tema întunecată'}
        >
          {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
        </button>
        <div className="auth-silk-bg">
          <Silk
            speed={5}
            scale={1}
            color={theme === 'light' ? '#9b7fd4' : '#6521a1'}
            noiseIntensity={1.5}
            rotation={0}
          />
        </div>
        <div className="auth-container">
          <div className="auth-logo">
            <div className="logo-icon">
              <Icons.Logo />
            </div>
            <RubrixDrawTitle />
          </div>
          <div className="auth-card">
            {urlResetToken ? (
              <>
                <h2 className="auth-card-title">Parolă nouă</h2>
                <p className="text-muted auth-card-intro">
                  Alege o parolă nouă pentru contul tău. După salvare te poți autentifica cu ea.
                </p>
                <form onSubmit={handleResetPasswordSubmit}>
                  <label>
                    Parolă nouă
                    <input
                      type="password"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Confirmă parola
                    <input
                      type="password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </label>
                  {authError && <p className="error-msg">{authError}</p>}
                  {forgotPasswordMessage && <p className="auth-success-msg">{forgotPasswordMessage}</p>}
                  <button type="submit" className="btn-primary" disabled={isAuthLoading}>
                    {isAuthLoading ? 'Se salvează...' : 'Salvează parola'}
                  </button>
                  <div className="auth-form-extras" style={{ justifyContent: 'flex-start', marginTop: '1rem' }}>
                    <button
                      type="button"
                      className="auth-text-link"
                      onClick={() => {
                        setUrlResetToken(null)
                        setAuthError('')
                        setForgotPasswordMessage('')
                        if (typeof window !== 'undefined') {
                          const u = new URL(window.location.href)
                          u.searchParams.delete('reset')
                          const tail = u.search ? u.search + u.hash : u.hash
                          window.history.replaceState({}, '', u.pathname + tail)
                        }
                        setAuthMode('login')
                      }}
                    >
                      ← Înapoi la autentificare
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="auth-tabs">
                  <button
                    type="button"
                    className={authMode === 'login' ? 'active' : ''}
                    onClick={() => {
                      setAuthMode('login')
                      setAuthError('')
                      setForgotPasswordMessage('')
                    }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className={authMode === 'register' ? 'active' : ''}
                    onClick={() => {
                      setAuthMode('register')
                      setAuthError('')
                      setForgotPasswordMessage('')
                    }}
                  >
                    Sign Up
                  </button>
                </div>
                {authMode === 'forgot' ? (
                  <form onSubmit={handleForgotSubmit}>
                    <p className="text-muted auth-card-intro" style={{ marginTop: 0 }}>
                      Introdu adresa de email a contului. Dacă există un utilizator înregistrat, vei primi un mesaj cu un
                      link pentru resetarea parolei.
                    </p>
                    <label>
                      Email
                      <input
                        type="email"
                        value={authForm.email}
                        onChange={handleAuthChange('email')}
                        placeholder="email@universitate.ro"
                        required
                        autoComplete="email"
                      />
                    </label>
                    {authError && <p className="error-msg">{authError}</p>}
                    {forgotPasswordMessage && <p className="auth-success-msg">{forgotPasswordMessage}</p>}
                    <button type="submit" className="btn-primary" disabled={isAuthLoading}>
                      {isAuthLoading ? 'Se trimite...' : 'Trimite link de resetare'}
                    </button>
                    <div className="auth-form-extras" style={{ justifyContent: 'flex-start', marginTop: '1rem' }}>
                      <button
                        type="button"
                        className="auth-text-link"
                        onClick={() => {
                          setAuthMode('login')
                          setAuthError('')
                          setForgotPasswordMessage('')
                        }}
                      >
                        ← Înapoi la autentificare
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleAuthSubmit}>
                    {authMode === 'register' && (
                      <>
                        <label>
                          Nume complet
                          <input
                            type="text"
                            value={authForm.fullName}
                            onChange={handleAuthChange('fullName')}
                            placeholder="Ion Popescu"
                          />
                        </label>
                        <label>
                          Rol
                          <select value={authForm.role} onChange={handleAuthChange('role')}>
                            <option value="student">Student</option>
                            <option value="professor">Profesor</option>
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      Email
                      <input
                        type="email"
                        value={authForm.email}
                        onChange={handleAuthChange('email')}
                        placeholder="email@universitate.ro"
                        required
                        autoComplete="email"
                      />
                    </label>
                    <label>
                      Parolă
                      <input
                        type="password"
                        value={authForm.password}
                        onChange={handleAuthChange('password')}
                        placeholder="••••••••"
                        required
                        minLength={6}
                        autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      />
                    </label>
                    {authMode === 'login' && (
                      <div className="auth-form-extras">
                        <button
                          type="button"
                          className="auth-text-link"
                          onClick={() => {
                            setAuthMode('forgot')
                            setAuthError('')
                            setForgotPasswordMessage('')
                          }}
                        >
                          Ai uitat parola?
                        </button>
                      </div>
                    )}
                    {authError && <p className="error-msg">{authError}</p>}
                    {forgotPasswordMessage && authMode === 'login' && (
                      <p className="auth-success-msg">{forgotPasswordMessage}</p>
                    )}
                    <button type="submit" className="btn-primary" disabled={isAuthLoading}>
                      {isAuthLoading ? 'Se procesează...' : authMode === 'login' ? 'Intră în cont' : 'Creează cont'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Navbar component
  const Navbar = () => (
    <header className="navbar">
      <div className="nav-brand" onClick={() => { setView('dashboard'); resetAssessmentForm(); setSelectedAssessment(null); }} style={{ cursor: 'pointer' }}>
        <div className="logo-icon">
          <Icons.Logo />
        </div>
        <span>Rubrix</span>
      </div>
      <nav className="nav-links">
        <button 
          className={view === 'dashboard' ? 'active' : ''} 
          onClick={() => { setView('dashboard'); resetAssessmentForm(); setSelectedAssessment(null); }}
        >
          <Icons.Dashboard />
          <span>Dashboard</span>
        </button>
        {user?.role === 'professor' && (
          <button 
            className={view === 'new' ? 'active' : ''} 
            onClick={() => { setView('new'); resetAssessmentForm(); }}
          >
            <Icons.Plus />
            <span>New Assessment</span>
          </button>
        )}
        <button
          className={view === 'analytics' ? 'active' : ''}
          onClick={handleOpenAnalytics}
        >
          <Icons.Chart />
          <span>Analize</span>
        </button>
        {user?.role === 'student' && (
          <button
            className={view === 'my-responses' ? 'active' : ''}
            onClick={handleOpenMyResponses}
          >
            <Icons.People />
            <span>Răspunsurile mele</span>
          </button>
        )}
        <button
          type="button"
          className={view === 'profile' ? 'active' : ''}
          onClick={() => {
            setView('profile')
            setSelectedAssessment(null)
          }}
        >
          <Icons.User />
          <span>Profil</span>
        </button>
        <button
          type="button"
          className="icon-only"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          title={theme === 'dark' ? 'Temă deschisă' : 'Temă întunecată'}
          aria-label={theme === 'dark' ? 'Activează tema deschisă' : 'Activează tema întunecată'}
        >
          {theme === 'dark' ? <Icons.Sun /> : <Icons.Moon />}
        </button>
        <button className="icon-only" onClick={handleLogout} title="Logout">
          <Icons.Logout />
        </button>
      </nav>
    </header>
  )

  const notifications = (
    <>
      {error && <div className="notification error">{error}</div>}
      {success && <div className="notification success">{success}</div>}
    </>
  )

  // Chart constants (shared between detail-analytics and global analytics views)
  const CHART_COLORS = ['#8B5CF6', '#A78BFA', '#7C3AED', '#6D28D9', '#C4B5FD', '#DDD6FE']
  const chartTooltipStyle = {
    contentStyle: {
      background: 'var(--chart-tooltip-bg)',
      border: '1px solid var(--chart-tooltip-border)',
      borderRadius: 8,
      color: 'var(--chart-tooltip-fg)',
    },
    labelStyle: { color: 'var(--chart-axis)' },
    itemStyle: { color: 'var(--chart-tooltip-fg)' },
  }

  // Assessment Detail view
  if (view === 'detail' && selectedAssessment) {
    const isOwner = user?.role === 'professor' && selectedAssessment.author_id === user?.id
    const scheduleBlocked = Boolean(
      !isOwner &&
        (selectedAssessment.lifecycle_status
          ? selectedAssessment.lifecycle_status !== 'active'
          : selectedAssessment.schedule_access_blocked)
    )
    const canAnswer = !isOwner && !scheduleBlocked
    const startIso = selectedAssessment.start_at || selectedAssessment.scheduled_starts_at
    const endIso = selectedAssessment.end_at || selectedAssessment.scheduled_ends_at
    const showScheduledGate =
      scheduleBlocked &&
      (selectedAssessment.lifecycle_status === 'scheduled' ||
        (!selectedAssessment.lifecycle_status && selectedAssessment.schedule_block_kind === 'before_start'))
    const showClosedGate =
      scheduleBlocked &&
      (selectedAssessment.lifecycle_status === 'closed' ||
        (!selectedAssessment.lifecycle_status && selectedAssessment.schedule_block_kind === 'after_end'))
    const examWindowActive =
      !selectedAssessment.lifecycle_status || selectedAssessment.lifecycle_status === 'active'
    const gateCountdownLabel =
      gateSecondsLeft != null ? formatSecondsCountdown(gateSecondsLeft) : formatCountdownToStart(startIso)
    const totalQuestions = getEvaluationQuestionCount(selectedAssessment)
    const submittedQuestionsCount = Object.keys(feedbackResults).length
    const allQuestionsSubmitted = totalQuestions > 0 && submittedQuestionsCount >= totalQuestions

    const groupedByStudent = studentResponses.reduce((acc, r) => {
      const key =
        r.user_id != null
          ? `u-${r.user_id}`
          : `g-${(r.guest_name || '').trim()}|${(r.guest_class || '').trim()}`
      if (!acc[key]) acc[key] = { name: r.user_name || r.guest_name || 'Participant', responses: [] }
      acc[key].responses.push(r)
      return acc
    }, {})

    const questionsMap = (selectedAssessment.questions || []).reduce((m, q) => {
      m[q.id] = q
      return m
    }, {})

    const feedbackSourceLabel = (source) => {
      if (source === 'auto') return 'Auto'
      if (source === 'professor') return 'Profesor'
      if (source?.startsWith('ai:')) return 'AI'
      return 'Reguli'
    }
    const feedbackSourceClass = (source) => {
      if (source === 'auto') return 'auto'
      if (source === 'professor') return 'professor'
      if (source?.startsWith('ai:')) return 'ai'
      return 'rule'
    }

    return (
      <div className="app-layout">
        <Navbar />
        {notifications}
        <main className="main-content">
          <div className="page-header">
            <div>
              <button className="btn-back" onClick={() => setView('dashboard')}>
                <Icons.Back />
                Înapoi
              </button>
              <h1>{selectedAssessment.title}</h1>
              <p>{selectedAssessment.subject || 'Evaluare generală'}</p>
            </div>
            <div className="header-actions">
              {(() => {
                const st = unifiedEvalStatusBadge(selectedAssessment)
                return <span className={st.className}>{st.label}</span>
              })()}
              {isOwner && (
                <>
                  <button className="btn-secondary" onClick={() => handleEditAssessment(selectedAssessment)}>
                    <Icons.Edit />
                    Editează
                  </button>
                  <button className="btn-danger" onClick={() => handleDeleteAssessment(selectedAssessment.id)}>
                    <Icons.Delete />
                    Șterge
                  </button>
                </>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="detail-tabs">
              <button className={detailTab === 'questions' ? 'active' : ''} onClick={() => setDetailTab('questions')}>
                <Icons.Document />
                Exerciții
              </button>
              <button className={detailTab === 'responses' ? 'active' : ''} onClick={() => { setDetailTab('responses'); fetchStudentResponses(selectedAssessment.id) }}>
                <Icons.People />
                Răspunsuri studenți ({studentResponses.length})
              </button>
              <button className={detailTab === 'analytics' ? 'active' : ''} onClick={() => { setDetailTab('analytics'); fetchEvalAnalytics(selectedAssessment.id) }}>
                <Icons.Chart />
                Analiză
              </button>
            </div>
          )}

          {detailTab === 'questions' && (
            <div className="detail-layout">
              <div className="detail-sidebar">
                <ParticleCard className="info-card magic-bento-card magic-bento-card--border-glow" disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                  <h3>Descriere</h3>
                  <p>{selectedAssessment.description || 'Nicio descriere disponibilă.'}</p>
                </ParticleCard>
                {showScheduledGate && (
                  <ParticleCard className="info-card magic-bento-card magic-bento-card--border-glow schedule-countdown-card" disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                    <h3>Programată — începe în curând</h3>
                    <p className="schedule-countdown-large" key={scheduleTick}>
                      {gateCountdownLabel}
                    </p>
                    {selectedAssessment.server_now && (
                      <p className="text-muted schedule-server-now">
                        Timp server: {new Date(selectedAssessment.server_now).toLocaleString('ro-RO')}
                      </p>
                    )}
                    <p className="text-muted schedule-countdown-sub">
                      După deschiderea ferestrei vei putea vedea întrebările. Ai maxim {selectedAssessment.duration}{' '}
                      minute pentru completare după ce începi (și nu poți depăși închiderea ferestrei).
                      Pagina se actualizează singură la deschidere.
                    </p>
                  </ParticleCard>
                )}
                {showClosedGate && (
                  <ParticleCard className="info-card magic-bento-card magic-bento-card--border-glow schedule-ended-sidebar-card" disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                    <h3>Fereastra s-a încheiat</h3>
                    <p className="text-muted">{selectedAssessment.schedule_block_message}</p>
                  </ParticleCard>
                )}
                {canAnswer && timeRemaining !== null && (
                  <ParticleCard className="info-card magic-bento-card magic-bento-card--border-glow" disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                    <AnimeTimer
                      timeRemaining={timeRemaining}
                      totalDuration={selectedAssessment.duration * 60}
                      timerExpired={timerExpired}
                    />
                  </ParticleCard>
                )}
                <ParticleCard className="info-card magic-bento-card magic-bento-card--border-glow" disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                  <h3>Detalii</h3>
                  <div className="info-row">
                    <span><Icons.Clock /> Durată:</span>
                    <strong>{selectedAssessment.duration} minute</strong>
                  </div>
                  <div className="info-row">
                    <span><Icons.People /> Răspunsuri:</span>
                    <strong>{selectedAssessment.response_count}</strong>
                  </div>
                  {((startIso || endIso) || (!isOwner && scheduleBlocked)) && (
                    <div className="info-row info-row--block">
                      <span>Perioadă acces (început → sfârșit):</span>
                      <strong className="schedule-detail">
                        {startIso
                          ? new Date(startIso).toLocaleString('ro-RO', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                        {' → '}
                        {endIso
                          ? new Date(endIso).toLocaleString('ro-RO', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </strong>
                      {!isOwner && scheduleBlocked && selectedAssessment.schedule_block_message && (
                        <p className="text-muted schedule-row-hint">{selectedAssessment.schedule_block_message}</p>
                      )}
                      {selectedAssessment.lifecycle_status && (
                        <p className="text-muted schedule-row-hint">
                          Ciclu viață (server, UTC): <strong>{selectedAssessment.lifecycle_status}</strong>
                          {selectedAssessment.seconds_until_end != null && selectedAssessment.lifecycle_status === 'active'
                            ? ` · până la end_at: ${formatSecondsCountdown(selectedAssessment.seconds_until_end)}`
                            : ''}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="info-row">
                    <span><Icons.Document /> Exerciții:</span>
                    <strong>{totalQuestions}</strong>
                  </div>
                  {canAnswer && (
                    <div className="info-row">
                      <span><Icons.Send /> Trimise:</span>
                      <strong>{submittedQuestionsCount}/{totalQuestions}</strong>
                    </div>
                  )}
                </ParticleCard>
                {isOwner && (
                  <ParticleCard className="info-card magic-bento-card magic-bento-card--border-glow access-card" disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                    <h3>Acces studenți</h3>
                    <p className="text-muted access-card-hint">Distribuie codul sau link-ul public. Studenții cu cont introduc codul pe dashboard.</p>
                    <div className="access-code-row">
                      <span className="access-code-value">{selectedAssessment.access_code || '—'}</span>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => selectedAssessment.access_code && copyToClipboard(selectedAssessment.access_code)}>
                        Copiază cod
                      </button>
                      <button type="button" className="btn-secondary btn-sm" onClick={handleRegenerateAccessCode}>
                        Cod nou
                      </button>
                    </div>
                    <div className="public-link-row">
                      <label className="public-link-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedAssessment.public_link_id)}
                          onChange={(e) => handleTogglePublicLink(e.target.checked)}
                        />
                        <span>Link public (fără cont)</span>
                      </label>
                      {selectedAssessment.public_link_id && (
                        <div className="public-url-box">
                          <code className="public-url-text">
                            {`${window.location.origin}/public/${selectedAssessment.public_link_id}`}
                          </code>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() =>
                              copyToClipboard(`${window.location.origin}/public/${selectedAssessment.public_link_id}`)
                            }
                          >
                            Copiază link
                          </button>
                        </div>
                      )}
                    </div>
                  </ParticleCard>
                )}
              </div>

              <div className="detail-questions">
                {totalQuestions === 0 ? (
                  <div className="info-card">
                    <p className="text-muted">Această evaluare nu conține exerciții.</p>
                  </div>
                ) : showScheduledGate ? (
                  <div className="info-card schedule-main-wait">
                    <h2>Evaluarea este programată — nu a început încă</h2>
                    <p className="schedule-main-countdown" aria-live="polite" key={scheduleTick}>
                      Rămâne până la deschiderea ferestrei: <strong>{gateCountdownLabel}</strong>
                    </p>
                    <p className="text-muted">
                      Start fereastră (server):{' '}
                      {startIso
                        ? new Date(startIso).toLocaleString('ro-RO', {
                            dateStyle: 'full',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </p>
                    <p className="text-muted">
                      Această evaluare are {totalQuestions} exerciții. Întrebările vor apărea aici automat la începutul ferestrei
                      (nu este nevoie să reîncarci manual pagina).
                    </p>
                  </div>
                ) : showClosedGate ? (
                  <div className="info-card schedule-main-ended">
                    <h2>Fereastra evaluării s-a încheiat</h2>
                    <p className="text-muted">{selectedAssessment.schedule_block_message}</p>
                    <p className="text-muted">Nu mai poți trimite răspunsuri noi pentru această sesiune.</p>
                  </div>
                ) : scheduleBlocked ? (
                  <div className="info-card">
                    <p className="text-muted">{selectedAssessment.schedule_block_message || 'Evaluarea nu este disponibilă în acest moment.'}</p>
                  </div>
                ) : canAnswer ? (
                  <form onSubmit={handleSubmitAllAnswers}>
                    {allQuestionsSubmitted && (
                      <div className="submitted-info-banner">
                        Ai trimis deja toate răspunsurile. Mai jos poți vedea răspunsurile tale și orice reevaluare făcută de profesor.
                      </div>
                    )}
                    {timerExpired && examWindowActive && Object.keys(feedbackResults).length === 0 && (
                      <div className="timer-expired-banner">
                        Timpul pentru completare ({selectedAssessment.duration} minute de la începutul încercării, în limita
                        ferestrei) a expirat. Nu mai poți modifica sau trimite răspunsuri.
                      </div>
                    )}
                    {selectedAssessment.questions.map((q, idx) => {
                      const isDisabled = timerExpired || !!feedbackResults[q.id]
                      return (
                      <ParticleCard className="question-card magic-bento-card magic-bento-card--border-glow" key={q.id} disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                        <div className="question-header">
                          <span className="question-number">Exercițiul {idx + 1}</span>
                          <span className="question-points">{q.points} puncte</span>
                        </div>
                        <p className="question-text">{q.text}</p>

                        {(q.question_type === 'multiple_choice') && q.options && (
                          <div className="question-options">
                            {q.options.map((opt, oi) => (
                              <label key={oi} className={`option-label ${isDisabled ? 'disabled' : ''}`}>
                                <input
                                  type="radio"
                                  name={`q-${q.id}`}
                                  value={opt}
                                  checked={answers[q.id] === opt}
                                  disabled={isDisabled}
                                  onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt }))}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {(q.question_type === 'checkboxes') && q.options && (
                          <div className="question-options">
                            {q.options.map((opt, oi) => {
                              const selected = (answers[q.id] || '').split('||')
                              const isChecked = selected.includes(opt)
                              return (
                                <label key={oi} className={`option-label ${isDisabled ? 'disabled' : ''}`}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={() => {
                                      const next = isChecked
                                        ? selected.filter((s) => s !== opt)
                                        : [...selected.filter(Boolean), opt]
                                      setAnswers((p) => ({ ...p, [q.id]: next.join('||') }))
                                    }}
                                  />
                                  <span>{opt}</span>
                                </label>
                              )
                            })}
                          </div>
                        )}

                        {q.question_type === 'short_answer' && (
                          <input
                            type="text"
                            className="question-input"
                            placeholder="Răspunsul tău..."
                            value={answers[q.id] || ''}
                            disabled={isDisabled}
                            onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                          />
                        )}

                        {q.question_type === 'long_answer' && (
                          <textarea
                            className="question-textarea"
                            placeholder="Scrie răspunsul tău aici..."
                            rows={5}
                            value={answers[q.id] || ''}
                            disabled={isDisabled}
                            onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                          />
                        )}

                        {!answers[q.id]?.trim() && !feedbackResults[q.id] && !timerExpired && (
                          <p className="unanswered-hint">* Răspuns obligatoriu</p>
                        )}

                        {feedbackResults[q.id] && (
                          <div className={`question-feedback ${feedbackResults[q.id].is_correct === true ? 'correct' : feedbackResults[q.id].score > 0 && !feedbackResults[q.id].is_correct ? 'partial' : feedbackResults[q.id].is_correct === false ? 'incorrect' : ''}`}>
                            {feedbackResults[q.id].score != null && (
                              <div className="auto-score">
                                <span className={`score-badge ${feedbackResults[q.id].is_correct ? 'correct' : feedbackResults[q.id].score > 0 ? 'partial' : 'incorrect'}`}>
                                  {feedbackResults[q.id].is_correct ? '✓' : feedbackResults[q.id].score > 0 ? '~' : '✗'} {feedbackResults[q.id].score}/{q.points} puncte
                                </span>
                              </div>
                            )}
                            <h4>Feedback</h4>
                            <ul className="feedback-list">
                              {feedbackResults[q.id].feedback?.map((item, fi) => (
                                <li key={fi}>
                                  <span className="badge">{item.category}</span>
                                  <span className={`badge source-badge ${feedbackSourceClass(item.source)}`}>
                                    {feedbackSourceLabel(item.source)}
                                  </span>
                                  <p>{item.message}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </ParticleCard>
                      )
                    })}
                    {!timerExpired && !allQuestionsSubmitted && (
                    <div className="submit-bar">
                      <div className="feedback-mode-selector">
                        <label>Mod feedback:</label>
                        <select value={feedbackMode} onChange={(e) => setFeedbackMode(e.target.value)}>
                          <option value="ai">AI (Groq)</option>
                          <option value="rule_based">Reguli simple</option>
                        </select>
                      </div>
                      <button 
                        type="submit" 
                        className="btn-primary submit-all-btn"
                        disabled={isGeneratingFeedback || timerExpired}
                      >
                        {isGeneratingFeedback ? 'Se generează feedback...' : (
                          <>
                            <Icons.Send />
                            Trimite toate răspunsurile
                          </>
                        )}
                      </button>
                    </div>
                    )}
                  </form>
                ) : (
                  <div>
                    {selectedAssessment.questions.map((q, idx) => (
                      <ParticleCard className="question-card magic-bento-card magic-bento-card--border-glow" key={q.id} disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                        <div className="question-header">
                          <span className="question-number">Exercițiul {idx + 1}</span>
                          <span className="question-points">{q.points} puncte</span>
                        </div>
                        <p className="question-text">{q.text}</p>
                        {q.options && (
                          <div className="question-options preview">
                            {q.options.map((opt, oi) => (
                              <span key={oi} className="option-preview">{q.question_type === 'multiple_choice' ? '○' : '☐'} {opt}</span>
                            ))}
                          </div>
                        )}
                        {q.correct_answer && (
                          <p className="correct-answer-preview">Răspuns corect: <strong>{q.correct_answer}</strong></p>
                        )}
                      </ParticleCard>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {detailTab === 'analytics' && isOwner && (
            <div className="eval-analytics-view">
              {!evalAnalytics ? (
                <div className="empty-state">
                  <Icons.Chart />
                  <p>Se încarcă datele analitice...</p>
                </div>
              ) : evalAnalytics.summary.total_participants === 0 ? (
                <div className="empty-state">
                  <Icons.Chart />
                  <p>Nu există date suficiente pentru analiză. Niciun student nu a răspuns încă.</p>
                </div>
              ) : (
                <>
                  <div className="eval-analytics-grid">
                    <div className="eval-stat-card">
                      <span className="eval-stat-value">{evalAnalytics.summary.total_participants}</span>
                      <span className="eval-stat-label">Participanți</span>
                    </div>
                    <div className="eval-stat-card">
                      <span className="eval-stat-value">{evalAnalytics.summary.avg_score_percent}%</span>
                      <span className="eval-stat-label">Media clasei</span>
                    </div>
                    <div className="eval-stat-card">
                      <span className="eval-stat-value">{evalAnalytics.summary.max_score_percent}%</span>
                      <span className="eval-stat-label">Cel mai mare scor</span>
                    </div>
                    <div className="eval-stat-card">
                      <span className="eval-stat-value">{evalAnalytics.summary.min_score_percent}%</span>
                      <span className="eval-stat-label">Cel mai mic scor</span>
                    </div>
                  </div>

                  <div className="analytics-card">
                    <h3>Distribuția Scorurilor</h3>
                    <p className="analytics-subtitle">Câți studenți per interval de scor</p>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={evalAnalytics.score_distribution} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="range" stroke="var(--chart-axis)" fontSize={12} />
                        <YAxis stroke="var(--chart-axis)" fontSize={12} allowDecimals={false} />
                        <Tooltip {...chartTooltipStyle} />
                        <Bar dataKey="count" name="Studenți" radius={[6, 6, 0, 0]}>
                          {evalAnalytics.score_distribution.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {evalAnalytics.question_success.length > 0 && (
                    <div className="analytics-card">
                      <h3>Rata de Succes per Întrebare</h3>
                      <p className="analytics-subtitle">Procentul mediu obținut la fiecare întrebare</p>
                      <ResponsiveContainer width="100%" height={Math.max(300, evalAnalytics.question_success.length * 50)}>
                        <BarChart data={evalAnalytics.question_success} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                          <XAxis type="number" stroke="var(--chart-axis)" fontSize={12} domain={[0, 100]} unit="%" />
                          <YAxis type="category" dataKey="question_text" stroke="var(--chart-axis)" fontSize={11} width={200} tick={{ fill: 'var(--chart-tick-fill)' }} />
                          <Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} />
                          <Bar dataKey="avg_percent" name="Media %" radius={[0, 6, 6, 0]}>
                            {evalAnalytics.question_success.map((entry, i) => (
                              <Cell key={i} fill={entry.avg_percent >= 70 ? '#22c55e' : entry.avg_percent >= 40 ? '#f59e0b' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {evalAnalytics.student_scores.length > 0 && (
                    <div className="analytics-card">
                      <h3>Clasamentul Studenților</h3>
                      <p className="analytics-subtitle">Scorurile totale ale studenților, ordonate descrescător</p>
                      <ResponsiveContainer width="100%" height={Math.max(300, evalAnalytics.student_scores.length * 45)}>
                        <BarChart data={evalAnalytics.student_scores} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                          <XAxis type="number" stroke="var(--chart-axis)" fontSize={12} domain={[0, 100]} unit="%" />
                          <YAxis type="category" dataKey="name" stroke="var(--chart-axis)" fontSize={11} width={160} tick={{ fill: 'var(--chart-tick-fill)' }} />
                          <Tooltip
                            {...chartTooltipStyle}
                            formatter={(value, _name, props) => [`${props.payload.total_score}/${props.payload.max_points} (${value}%)`, 'Scor']}
                          />
                          <Bar dataKey="percent" name="Scor %" radius={[0, 6, 6, 0]}>
                            {evalAnalytics.student_scores.map((entry, i) => (
                              <Cell key={i} fill={entry.percent >= 70 ? '#22c55e' : entry.percent >= 40 ? '#f59e0b' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {detailTab === 'responses' && isOwner && (
            <div className="responses-view">
              <div className="responses-export-bar">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                >
                  <Icons.Pdf />
                  {isExportingPdf ? 'Se generează PDF…' : 'Exportă PDF'}
                </button>
              </div>
              {Object.keys(groupedByStudent).length === 0 ? (
                <div className="empty-state">
                  <Icons.People />
                  <p>Niciun student nu a răspuns încă la această evaluare.</p>
                </div>
              ) : (
                Object.entries(groupedByStudent).map(([userId, { name, responses }]) => {
                  const isExpanded = !!expandedStudents[userId]
                  const totalScore = responses.reduce((sum, r) => sum + (r.score ?? 0), 0)
                  const maxScore = responses.reduce((sum, r) => {
                    const q = questionsMap[r.question_id]
                    return sum + (q?.points ?? 0)
                  }, 0)
                  return (
                  <ParticleCard className="student-response-card magic-bento-card magic-bento-card--border-glow" key={userId} disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                    <div className="student-response-header collapsible" onClick={() => toggleStudent(userId)}>
                      <Icons.People />
                      <h3>{name}</h3>
                      <span className="response-count">{responses.length} răspunsuri</span>
                      {maxScore > 0 && (
                        <span className="student-total-score">{totalScore}/{maxScore} puncte</span>
                      )}
                      <span className={`collapse-icon ${isExpanded ? 'expanded' : ''}`}>
                        <Icons.Arrow />
                      </span>
                    </div>
                    {isExpanded && (
                    <div className="student-answers-list">
                      {responses.map((r) => {
                        const q = questionsMap[r.question_id]
                        return (
                          <div className="student-answer-item" key={r.id}>
                            <div className="sa-question">
                              <span className="sa-label">{q ? `Ex. ${(selectedAssessment.questions || []).indexOf(q) + 1}` : `#${r.question_id || '?'}`}</span>
                              <span className="sa-question-text">{q?.text || 'Întrebare necunoscută'}</span>
                            </div>
                            <div className="sa-answer">
                              <span className="sa-label">Răspuns:</span>
                              <p>{r.answer_text}</p>
                            </div>
                            {r.score != null && (
                              <div className="sa-score">
                                Scor: <strong>{r.score}/{q?.points || '?'}</strong>
                              </div>
                            )}
                            {r.feedback && r.feedback.length > 0 && (
                              <div className="sa-feedback">
                                <span className="sa-label">Feedback existent:</span>
                                <ul className="feedback-list">
                                  {r.feedback.map((fb, fi) => (
                                    <li key={fi}>
                                      <span className="badge">{fb.category}</span>
                                      <span className={`badge source-badge ${feedbackSourceClass(fb.source)}`}>
                                        {feedbackSourceLabel(fb.source)}
                                      </span>
                                      <p>{fb.message}</p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="sa-reevaluate">
                              <div className="reeval-row">
                                <label>
                                  Scor
                                  <input
                                    type="number"
                                    min="0"
                                    max={q?.points || 100}
                                    placeholder={r.score != null ? String(r.score) : '—'}
                                    value={reevalForm[r.id]?.score ?? ''}
                                    onChange={(e) => setReevalForm((p) => ({ ...p, [r.id]: { ...p[r.id], score: e.target.value } }))}
                                  />
                                </label>
                                <label className="reeval-feedback-label">
                                  Feedback profesor
                                  <input
                                    type="text"
                                    placeholder="Adaugă feedback..."
                                    value={reevalForm[r.id]?.feedback_message ?? ''}
                                    onChange={(e) => setReevalForm((p) => ({ ...p, [r.id]: { ...p[r.id], feedback_message: e.target.value } }))}
                                  />
                                </label>
                              </div>
                              <button className="btn-secondary btn-sm" onClick={() => handleReevaluate(r.id)}>
                                Reevaluează
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    )}
                  </ParticleCard>
                  )
                })
              )}
            </div>
          )}
        </main>
      </div>
    )
  }

  if (view === 'my-responses' && user?.role === 'student') {
    const groupedMyResponses = myAllResponses.reduce((acc, response) => {
      const key = response.evaluation_id || 'unknown'
      if (!acc[key]) {
        acc[key] = {
          evaluationTitle: response.evaluation_title || 'Evaluare necunoscută',
          responses: []
        }
      }
      acc[key].responses.push(response)
      return acc
    }, {})

    const feedbackSourceLabel = (source) => {
      if (source === 'auto') return 'Auto'
      if (source === 'professor') return 'Profesor'
      if (source?.startsWith('ai:')) return 'AI'
      return 'Reguli'
    }

    const feedbackSourceClass = (source) => {
      if (source === 'auto') return 'auto'
      if (source === 'professor') return 'professor'
      if (source?.startsWith('ai:')) return 'ai'
      return 'rule'
    }

    const toggleMyEval = (evalId) => {
      setExpandedStudents((prev) => ({ ...prev, [evalId]: !prev[evalId] }))
    }

    return (
      <div className="app-layout">
        <Navbar />
        {notifications}
        <main className="main-content">
          <div className="page-header">
            <div>
              <h1>Răspunsurile mele</h1>
              <p>Vezi toate răspunsurile trimise și feedback-ul primit (inclusiv reevaluările profesorului).</p>
            </div>
            <button className="btn-secondary" onClick={() => setView('dashboard')}>
              <Icons.Back />
              Înapoi la dashboard
            </button>
          </div>

          {isMyResponsesLoading ? (
            <p className="loading">Se încarcă răspunsurile tale...</p>
          ) : Object.keys(groupedMyResponses).length === 0 ? (
            <div className="empty-state">
              <Icons.Document />
              <p>Nu ai trimis încă niciun răspuns.</p>
            </div>
          ) : (
            <div className="responses-view">
              {Object.entries(groupedMyResponses).map(([evaluationId, group]) => {
                const isExpanded = !!expandedStudents[evaluationId]
                const totalScore = group.responses.reduce((sum, r) => sum + (r.score ?? 0), 0)
                const maxScore = group.responses.reduce((sum, r) => sum + (r.question_points ?? 0), 0)
                return (
                <ParticleCard
                  className="student-response-card magic-bento-card magic-bento-card--border-glow"
                  key={evaluationId}
                  disableAnimations={isMobile}
                  particleCount={6}
                  glowColor="132, 0, 255"
                  enableTilt={false}
                  clickEffect
                >
                  <div className="student-response-header collapsible" onClick={() => toggleMyEval(evaluationId)}>
                    <Icons.Document />
                    <h3>{group.evaluationTitle}</h3>
                    <span className="response-count">{group.responses.length} răspunsuri</span>
                    {maxScore > 0 && (
                      <span className="student-total-score">{totalScore}/{maxScore} puncte</span>
                    )}
                    <span className={`collapse-icon ${isExpanded ? 'expanded' : ''}`}>
                      <Icons.Arrow />
                    </span>
                  </div>
                  {isExpanded && (
                  <div className="student-answers-list">
                    {group.responses.map((r, idx) => (
                      <div className="student-answer-item" key={r.id}>
                        <div className="sa-question">
                          <span className="sa-label">Ex. {idx + 1}</span>
                          <span className="sa-question-text">{r.question_text || 'Întrebare necunoscută'}</span>
                        </div>
                        <div className="sa-answer">
                          <span className="sa-label">Răspuns:</span>
                          <p>{r.answer_text}</p>
                        </div>
                        {r.score != null && (
                          <div className="sa-score">
                            Scor: <strong>{r.score}/{r.question_points || '?'}</strong>
                          </div>
                        )}
                        {r.feedback && r.feedback.length > 0 && (
                          <div className="sa-feedback">
                            <span className="sa-label">Feedback:</span>
                            <ul className="feedback-list">
                              {r.feedback.map((fb, fi) => (
                                <li key={fi}>
                                  <span className="badge">{fb.category}</span>
                                  <span className={`badge source-badge ${feedbackSourceClass(fb.source)}`}>
                                    {feedbackSourceLabel(fb.source)}
                                  </span>
                                  <p>{fb.message}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  )}
                </ParticleCard>
                )
              })}
            </div>
          )}
        </main>
      </div>
    )
  }

  // Profile view
  if (view === 'profile' && user) {
    const avatarDisplayUrl = profileLocalAvatarUrl || profileRemoteAvatarUrl
    const initials = (user.full_name || user.email || '?')
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

    return (
      <div className="app-layout">
        <Navbar />
        {notifications}
        <main className="main-content">
          <div className="page-header">
            <div>
              <button type="button" className="btn-back" onClick={() => setView('dashboard')}>
                <Icons.Back />
                Înapoi
              </button>
              <h1>Profil</h1>
              <p>Actualizează numele afișat, parola și fotografia de profil.</p>
            </div>
          </div>

          <ParticleCard
            className="profile-card magic-bento-card magic-bento-card--border-glow"
            disableAnimations={isMobile}
            particleCount={8}
            glowColor="132, 0, 255"
            enableTilt={false}
            clickEffect
          >
            <div className="profile-avatar-block">
              <div className="profile-avatar-circle">
                {avatarDisplayUrl ? (
                  <img src={avatarDisplayUrl} alt="" className="profile-avatar-img" />
                ) : (
                  <span className="profile-avatar-initials">{initials}</span>
                )}
              </div>
              <div className="profile-avatar-actions">
                <label className="btn-secondary btn-sm profile-avatar-upload-label">
                  <input
                    ref={profileAvatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="profile-avatar-file-input"
                    onChange={handleProfileAvatarPick}
                  />
                  Schimbă imaginea
                </label>
                {user.has_avatar && (
                  <button type="button" className="btn-secondary btn-sm" onClick={handleRemoveAvatar}>
                    Elimină avatar
                  </button>
                )}
              </div>
            </div>

            <form className="profile-form assessment-form" onSubmit={handleProfileSave}>
              <label>
                Nume afișat
                <input
                  type="text"
                  value={profileForm.fullName}
                  onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="ex: Ion Popescu"
                  maxLength={255}
                />
              </label>
              <label>
                Email
                <input type="email" value={user.email} readOnly disabled className="input-readonly" />
              </label>
              <p className="profile-form-hint text-muted">Rol: {user.role === 'professor' ? 'Profesor' : 'Student'}</p>

              <h3 className="profile-section-title">Schimbă parola</h3>
              <p className="text-muted profile-form-hint">Lasă gol dacă nu vrei să modifici parola.</p>
              <label>
                Parola curentă
                <input
                  type="password"
                  autoComplete="current-password"
                  value={profileForm.currentPassword}
                  onChange={(e) => setProfileForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  placeholder="••••••••"
                />
              </label>
              <label>
                Parola nouă
                <input
                  type="password"
                  autoComplete="new-password"
                  value={profileForm.newPassword}
                  onChange={(e) => setProfileForm((p) => ({ ...p, newPassword: e.target.value }))}
                  placeholder="minim 6 caractere"
                />
              </label>
              <label>
                Confirmă parola nouă
                <input
                  type="password"
                  autoComplete="new-password"
                  value={profileForm.confirmPassword}
                  onChange={(e) => setProfileForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                  placeholder="repetă parola nouă"
                />
              </label>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setView('dashboard')}>
                  Anulează
                </button>
                <button type="submit" className="btn-primary" disabled={isProfileSaving}>
                  {isProfileSaving ? 'Se salvează…' : 'Salvează modificările'}
                </button>
              </div>
            </form>
          </ParticleCard>
        </main>
      </div>
    )
  }

  // Analytics view
  if (view === 'analytics') {
    const score_distribution = analyticsData?.score_distribution || []
    const question_success = analyticsData?.question_success || []
    const evaluation_averages = analyticsData?.evaluation_averages || []
    const student_evolution = analyticsData?.student_evolution || []
    return (
      <div className="app-layout">
        <Navbar />
        {notifications}
        <main className="main-content">
          <div className="page-header">
            <div>
              <button className="btn-back" onClick={() => setView('dashboard')}>
                <Icons.Back />
                Înapoi
              </button>
              <h1>Analize & Statistici</h1>
              <p>{isProfessor ? 'Vizualizează performanța studenților tăi' : 'Urmărește-ți progresul'}</p>
            </div>
          </div>

          {isAnalyticsLoading ? (
            <div className="loading-container"><div className="spinner" /><p>Se încarcă analizele...</p></div>
          ) : (
          <div className="analytics-grid">
            <div className="analytics-card">
              <h3>Distribuția Scorurilor</h3>
              <p className="analytics-subtitle">Câte răspunsuri per interval de scor</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={score_distribution} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="range" stroke="var(--chart-axis)" fontSize={12} />
                  <YAxis stroke="var(--chart-axis)" fontSize={12} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="count" name="Răspunsuri" radius={[6, 6, 0, 0]}>
                    {score_distribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="analytics-card">
              <h3>{isProfessor ? 'Media per Evaluare' : 'Scorul tău vs. Media Clasei'}</h3>
              <p className="analytics-subtitle">
                {isProfessor ? 'Scorul mediu al clasei per evaluare' : 'Compară performanța ta cu restul clasei'}
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={evaluation_averages} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="evaluation_title" stroke="var(--chart-axis)" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="var(--chart-axis)" fontSize={12} domain={[0, 100]} unit="%" />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} />
                  <Legend wrapperStyle={{ color: 'var(--text-primary)', fontSize: 12 }} />
                  <Bar dataKey="class_avg_percent" name="Media clasei" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                  {!isProfessor && (
                    <Bar dataKey="student_avg_percent" name="Scorul tău" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="analytics-card">
              <h3>Rata de Succes per Întrebare</h3>
              <p className="analytics-subtitle">Procentul mediu obținut la fiecare întrebare</p>
              {question_success.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(300, question_success.length * 45)}>
                  <BarChart data={question_success} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis type="number" stroke="var(--chart-axis)" fontSize={12} domain={[0, 100]} unit="%" />
                    <YAxis type="category" dataKey="question_text" stroke="var(--chart-axis)" fontSize={11} width={200} tick={{ fill: 'var(--chart-tick-fill)' }} />
                    <Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} />
                    <Bar dataKey="avg_percent" name="Media %" fill="#A78BFA" radius={[0, 6, 6, 0]}>
                      {question_success.map((entry, i) => (
                        <Cell key={i} fill={entry.avg_percent >= 70 ? '#22c55e' : entry.avg_percent >= 40 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>Nu sunt date suficiente.</p>
              )}
            </div>

            {!isProfessor && student_evolution && student_evolution.length > 0 && (
              <div className="analytics-card">
                <h3>Evoluția Scorurilor Tale</h3>
                <p className="analytics-subtitle">Cum ai progresat de la o evaluare la alta</p>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={student_evolution} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="evaluation_title" stroke="var(--chart-axis)" fontSize={11} angle={-15} textAnchor="end" height={60} />
                    <YAxis stroke="var(--chart-axis)" fontSize={12} domain={[0, 100]} unit="%" />
                    <Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} />
                    <Line
                      type="monotone"
                      dataKey="score_percent"
                      name="Scor"
                      stroke="#8B5CF6"
                      strokeWidth={3}
                      dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 6 }}
                      activeDot={{ r: 8, fill: '#A78BFA' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          )}
        </main>
      </div>
    )
  }

  // New/Edit Assessment view
  if (view === 'new') {
    return (
      <div className="app-layout">
        <Navbar />
        {notifications}
        <main className="main-content">
          <div className="page-header">
            <div>
              <h1>{editingAssessment ? 'Editează evaluarea' : 'Evaluare nouă'}</h1>
              <p>{editingAssessment ? 'Modifică detaliile evaluării' : 'Creează o evaluare nouă pentru studenți'}</p>
            </div>
          </div>

          <form className="assessment-form" onSubmit={handleSaveAssessment}>
            <label>
              Titlu *
              <input
                type="text"
                value={assessmentForm.title}
                onChange={(e) => setAssessmentForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="ex: Capitolul 3: Quiz Biologie Celulară"
                required
              />
            </label>
            <label>
              Materie
              <input
                type="text"
                value={assessmentForm.subject}
                onChange={(e) => setAssessmentForm((p) => ({ ...p, subject: e.target.value }))}
                placeholder="ex: Biologie"
              />
            </label>
            <label>
              Descriere
              <textarea
                value={assessmentForm.description}
                onChange={(e) => setAssessmentForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descrie ce acoperă această evaluare..."
                rows={3}
              />
            </label>
            <div className="form-row">
              <label>
                Durată (minute)
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={assessmentForm.duration}
                  onChange={(e) => setAssessmentForm((p) => ({ ...p, duration: Number(e.target.value) }))}
                />
              </label>
              <label>
                Status
                <select
                  value={assessmentForm.status}
                  onChange={(e) => setAssessmentForm((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Activ</option>
                  <option value="closed">Închis</option>
                </select>
              </label>
            </div>
            <p className="text-muted form-hint-schedule">
              <strong>Început acces</strong> și <strong>Sfârșit acces</strong> sunt opționale și folosesc ora de pe
              dispozitivul tău. Dacă le completezi, elevii pot porni testul doar între aceste momente; în afara
              intervalului nu mai pot intra. <strong>Durată (minute)</strong> înseamnă cât timp maxim are fiecare elev{' '}
              <em>după ce a început</em> testul — nu de la momentul în care salvezi evaluarea — și nu poate depăși
              timpul rămas până la sfârșitul ferestrei. <strong>Dacă lași ambele câmpuri goale</strong>, nu există
              restricție de oră: atâta timp cât statusul este <strong>Activ</strong>, elevii pot intra când vor.
            </p>
            <div className="form-row">
              <label>
                Început acces
                <input
                  type="datetime-local"
                  value={assessmentForm.scheduled_starts_at}
                  onChange={(e) => setAssessmentForm((p) => ({ ...p, scheduled_starts_at: e.target.value }))}
                />
              </label>
              <label>
                Sfârșit acces
                <input
                  type="datetime-local"
                  value={assessmentForm.scheduled_ends_at}
                  onChange={(e) => setAssessmentForm((p) => ({ ...p, scheduled_ends_at: e.target.value }))}
                />
              </label>
            </div>
            {(() => {
              const w = accessWindowShorterThanDurationWarning(
                assessmentForm.duration,
                assessmentForm.scheduled_starts_at,
                assessmentForm.scheduled_ends_at
              )
              if (!w) return null
              return (
                <div className="form-schedule-duration-warning" role="status">
                  Atenție: intervalul dintre începutul și sfârșitul accesului este de{' '}
                  <strong>{formatMinutesRo(w.windowMinutes)}</strong>, mai mic decât durata evaluării de{' '}
                  <strong>{formatMinutesRo(w.durationMinutes)}</strong>. Evaluarea va funcționa, dar studenții pot avea
                  mai puțin timp disponibil pentru completare.
                </div>
              )
            })()}

            <div className="questions-builder">
              <div className="questions-header">
                <h3>Exerciții ({assessmentForm.questions.length})</h3>
                <button type="button" className="btn-secondary" onClick={addQuestion}>
                  <Icons.Plus />
                  Adaugă exercițiu
                </button>
              </div>

              {assessmentForm.questions.length === 0 && (
                <div className="questions-empty">
                  <p>Nu ai adăugat niciun exercițiu. Click pe &quot;Adaugă exercițiu&quot; pentru a începe.</p>
                </div>
              )}

              {assessmentForm.questions.map((q, idx) => (
                <div className="question-builder-card" key={q._key || q.id || idx}>
                  <div className="qb-header">
                    <span className="question-number">Exercițiul {idx + 1}</span>
                    <div className="qb-actions">
                      <button type="button" disabled={idx === 0} onClick={() => moveQuestion(idx, -1)} title="Mută sus">↑</button>
                      <button type="button" disabled={idx === assessmentForm.questions.length - 1} onClick={() => moveQuestion(idx, 1)} title="Mută jos">↓</button>
                      <button type="button" className="qb-delete" onClick={() => removeQuestion(idx)} title="Șterge">
                        <Icons.Delete />
                      </button>
                    </div>
                  </div>

                  <div className="qb-row">
                    <label className="qb-type">
                      Tip
                      <select value={q.question_type} onChange={(e) => updateQuestion(idx, 'question_type', e.target.value)}>
                        {QUESTION_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="qb-points">
                      Puncte
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={q.points}
                        onChange={(e) => updateQuestion(idx, 'points', Number(e.target.value))}
                      />
                    </label>
                  </div>

                  <label>
                    Întrebare *
                    <textarea
                      value={q.text}
                      onChange={(e) => updateQuestion(idx, 'text', e.target.value)}
                      placeholder="Scrie întrebarea / enunțul exercițiului..."
                      rows={2}
                      required
                    />
                  </label>

                  {(q.question_type === 'multiple_choice' || q.question_type === 'checkboxes') && (
                    <div className="qb-options">
                      <span className="qb-options-label">Opțiuni</span>
                      <span className="qb-options-hint">Selectează răspunsul corect din opțiunile de mai jos</span>
                      {(q.options || []).map((opt, oi) => (
                        <div className={`qb-option-row${
                          q.question_type === 'multiple_choice'
                            ? (q.correct_answer === opt && opt !== '' ? ' correct' : '')
                            : ((q.correct_answer || '').split('||').map(s => s.trim()).includes(opt) && opt !== '' ? ' correct' : '')
                        }`} key={oi}>
                          {q.question_type === 'multiple_choice' ? (
                            <input
                              type="radio"
                              name={`correct-${q._key || idx}`}
                              checked={q.correct_answer === opt && opt !== ''}
                              onChange={() => updateQuestion(idx, 'correct_answer', opt)}
                              className="qb-correct-input"
                              title="Marchează ca răspuns corect"
                              disabled={!opt}
                            />
                          ) : (
                            <input
                              type="checkbox"
                              checked={(q.correct_answer || '').split('||').map(s => s.trim()).includes(opt) && opt !== ''}
                              onChange={() => {
                                const parts = (q.correct_answer || '').split('||').map(s => s.trim()).filter(Boolean)
                                const fi = parts.indexOf(opt)
                                if (fi !== -1) parts.splice(fi, 1)
                                else parts.push(opt)
                                updateQuestion(idx, 'correct_answer', parts.join('||'))
                              }}
                              className="qb-correct-input"
                              title="Marchează ca răspuns corect"
                              disabled={!opt}
                            />
                          )}
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOption(idx, oi, e.target.value)}
                            placeholder={`Opțiunea ${oi + 1}`}
                          />
                          <button type="button" className="qb-option-remove" onClick={() => removeOption(idx, oi)} title="Șterge opțiune">×</button>
                        </div>
                      ))}
                      <button type="button" className="qb-add-option" onClick={() => addOption(idx)}>
                        + Adaugă opțiune
                      </button>
                    </div>
                  )}

                  {q.question_type !== 'multiple_choice' && q.question_type !== 'checkboxes' && (
                    <label>
                      Răspuns corect (opțional)
                      <input
                        type="text"
                        value={q.correct_answer}
                        onChange={(e) => updateQuestion(idx, 'correct_answer', e.target.value)}
                        placeholder="Folosit pentru corectare automată (opțional)"
                      />
                    </label>
                  )}
                </div>
              ))}
            </div>

            <div className="form-actions">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => { setView('dashboard'); resetAssessmentForm(); }}
              >
                Anulează
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Se salvează...' : editingAssessment ? 'Salvează modificările' : 'Creează evaluarea'}
              </button>
            </div>
          </form>
        </main>
      </div>
    )
  }

  // Dashboard view

  return (
    <div className="app-layout">
      <Navbar />
      {notifications}
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>{isProfessor ? 'Dashboard' : `Bine ai venit, ${user?.full_name?.split(' ')[0] || 'Student'}!`}</h1>
            <p>{isProfessor ? 'Gestionează evaluările și urmărește progresul studenților' : 'Evaluările tale disponibile sunt mai jos. Selectează una pentru a începe.'}</p>
          </div>
          {isProfessor && (
            <button className="btn-primary" onClick={() => setView('new')}>
              <Icons.Plus />
              Evaluare nouă
            </button>
          )}
        </div>

        {isProfessor && (
          <div className="stats-grid bento-section" ref={dashboardGridRef}>
            <GlobalSpotlight gridRef={dashboardGridRef} disableAnimations={isMobile} spotlightRadius={400} glowColor="132, 0, 255" />
            <ParticleCard className="stat-card magic-bento-card magic-bento-card--border-glow" disableAnimations={isMobile} particleCount={12} glowColor="132, 0, 255" enableTilt={false} clickEffect>
              <div className="stat-info">
                <span className="stat-label">TOTAL EVALUĂRI</span>
                <span className="stat-value">{stats.total}</span>
              </div>
              <div className="stat-icon blue">
                <Icons.Document />
              </div>
            </ParticleCard>
            <ParticleCard className="stat-card magic-bento-card magic-bento-card--border-glow" disableAnimations={isMobile} particleCount={12} glowColor="132, 0, 255" enableTilt={false} clickEffect>
              <div className="stat-info">
                <span className="stat-label">ACTIVE</span>
                <span className="stat-value">{stats.active}</span>
              </div>
              <div className="stat-icon green">
                <Icons.Clock />
              </div>
            </ParticleCard>
            <ParticleCard className="stat-card magic-bento-card magic-bento-card--border-glow" disableAnimations={isMobile} particleCount={12} glowColor="132, 0, 255" enableTilt={false} clickEffect>
              <div className="stat-info">
                <span className="stat-label">TOTAL RĂSPUNSURI</span>
                <span className="stat-value">{stats.responses}</span>
              </div>
              <div className="stat-icon orange">
                <Icons.People />
              </div>
            </ParticleCard>
            <ParticleCard className="stat-card magic-bento-card magic-bento-card--border-glow" disableAnimations={isMobile} particleCount={12} glowColor="132, 0, 255" enableTilt={false} clickEffect>
              <div className="stat-info">
                <span className="stat-label">SCOR MEDIU</span>
                <span className="stat-value">{stats.avgScore}%</span>
              </div>
              <div className="stat-icon pink">
                <Icons.Trend />
              </div>
            </ParticleCard>
          </div>
        )}

        {!isProfessor && (
          <div className="student-welcome-stats">
            <ParticleCard className="stat-card magic-bento-card magic-bento-card--border-glow student-stat-wide" disableAnimations={isMobile} particleCount={10} glowColor="132, 0, 255" enableTilt={false} clickEffect>
              <div className="stat-info">
                <span className="stat-label">EVALUĂRI DISPONIBILE</span>
                <span className="stat-value">{stats.total}</span>
              </div>
              <div className="stat-icon blue">
                <Icons.Document />
              </div>
            </ParticleCard>
            <div className="student-stat-clickable" onClick={handleOpenMyResponses} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleOpenMyResponses()}>
              <ParticleCard className="stat-card magic-bento-card magic-bento-card--border-glow student-stat-wide" disableAnimations={isMobile} particleCount={10} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                <div className="stat-info">
                  <span className="stat-label">RĂSPUNSURILE TALE</span>
                  <span className="stat-value">{stats.responses}</span>
                </div>
                <div className="stat-icon green">
                  <Icons.Trend />
                </div>
              </ParticleCard>
            </div>
            <ParticleCard className="stat-card magic-bento-card magic-bento-card--border-glow student-stat-wide" disableAnimations={isMobile} particleCount={10} glowColor="132, 0, 255" enableTilt={false} clickEffect>
              <div className="stat-info">
                <span className="stat-label">SCOR MEDIU</span>
                <span className="stat-value">{stats.avgScore}%</span>
              </div>
              <div className="stat-icon pink">
                <Icons.Trend />
              </div>
            </ParticleCard>
          </div>
        )}

        {!isProfessor && (
          <div className="join-code-bar">
            <div className="join-code-inner">
              <span className="join-code-label">Intră cu codul de la profesor</span>
              <div className="join-code-row">
                <input
                  type="text"
                  className="join-code-input"
                  placeholder="ex: ABC12XYZ"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={20}
                />
                <button type="button" className="btn-primary" onClick={handleJoinByCode} disabled={isJoining}>
                  {isJoining ? 'Se verifică...' : 'Înscrie-te'}
                </button>
              </div>
              <p className="text-muted join-code-hint">După înscriere, evaluarea apare în lista de mai jos.</p>
            </div>
          </div>
        )}

        <div className="filters-bar">
          <div className="search-box">
            <Icons.Search />
            <input
              type="text"
              placeholder="Caută evaluări..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isProfessor && (
            <div className="filter-tabs">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Toate</button>
              <button className={filter === 'draft' ? 'active' : ''} onClick={() => setFilter('draft')}>Draft</button>
              <button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Active</button>
              <button className={filter === 'closed' ? 'active' : ''} onClick={() => setFilter('closed')}>Închise</button>
            </div>
          )}
        </div>

        <div className="assessments-grid">
          {isLoading ? (
            <p className="loading">Se încarcă evaluările...</p>
          ) : filteredAssessments.length === 0 ? (
            <div className="empty-state">
              <Icons.Document />
              <p>{isProfessor
                ? `Nu există evaluări${filter !== 'all' ? ` cu statusul "${filter}"` : ''}`
                : 'Nu există evaluări disponibile momentan. Revino mai târziu!'
              }</p>
              {isProfessor && (
                <button className="btn-primary" onClick={() => setView('new')}>
                  Creează prima evaluare
                </button>
              )}
            </div>
          ) : (
            filteredAssessments.map((assessment) => {
              const scheduleHint = isProfessor ? formatEvaluationScheduleLabel(assessment) : null
              const studentScheduleLine = !isProfessor ? studentCardScheduleLine(assessment) : null
              return (
              <ParticleCard
                className="assessment-card magic-bento-card magic-bento-card--border-glow"
                key={assessment.id}
                disableAnimations={isMobile}
                particleCount={8}
                glowColor="132, 0, 255"
                enableTilt={false}
                clickEffect
                style={{ cursor: 'pointer' }}
              >
                <div onClick={() => handleOpenAssessment(assessment)} style={{ display: 'contents' }}>
                  <div className="card-header">
                    <div className="card-icon">
                      <Icons.Document />
                    </div>
                    <div className="card-title">
                      <h3>{assessment.title}</h3>
                      <span className="subject">{assessment.subject || 'General'}</span>
                    </div>
                    {isProfessor && (() => {
                      const st = unifiedEvalStatusBadge(assessment)
                      return <span className={st.className}>{st.label}</span>
                    })()}
                  </div>
                  {scheduleHint && (
                    <p className="card-schedule-hint text-muted">{scheduleHint}</p>
                  )}
                  {studentScheduleLine && (
                    <p className="card-schedule-student text-muted">{studentScheduleLine}</p>
                  )}
                  <p className="card-description">
                    {assessment.description || 'Nicio descriere disponibilă'}
                  </p>
                  {!isProfessor && assessment.author_name && (
                    <p className="card-author">Profesor: {assessment.author_name}</p>
                  )}
                  <div className="card-footer">
                    <div className="card-meta">
                      {isProfessor && (
                        <span>
                          <Icons.People />
                          {assessment.response_count ?? 0} răspunsuri
                        </span>
                      )}
                      <span>
                        <Icons.Clock />
                        {assessment.duration ?? 30} min
                      </span>
                      {!isProfessor && (
                        <span>
                          <Icons.Document />
                          {getEvaluationQuestionCount(assessment)} exerciții
                        </span>
                      )}
                    </div>
                    {isProfessor ? (
                      <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleOpenAssessment(assessment); }}>
                        <Icons.Arrow />
                      </button>
                    ) : (
                      <button className="btn-start" onClick={(e) => { e.stopPropagation(); handleOpenAssessment(assessment); }}>
                        Începe
                        <Icons.Arrow />
                      </button>
                    )}
                  </div>
                </div>
              </ParticleCard>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}

export default App
