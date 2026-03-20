import { useCallback, useEffect, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts'
import Silk from './components/Silk'
import { ParticleCard, GlobalSpotlight, useMobileDetection } from './components/MagicBento'
import rubrixLogo from './assets/rubrix-logo.svg'
import './App.css'

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

function AnimeTimer({ timeRemaining, totalDuration, timerExpired }) {
  const circleRef = useRef(null)
  const digitsRef = useRef(null)
  const glowRef = useRef(null)
  const prevTimeRef = useRef(timeRemaining)

  const radius = 54
  const circumference = 2 * Math.PI * radius
  const progress = totalDuration > 0 ? timeRemaining / totalDuration : 0
  const offset = circumference * (1 - progress)

  const minutes = Math.floor((timeRemaining || 0) / 60)
  const seconds = (timeRemaining || 0) % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  const isWarning = timeRemaining <= 300 && timeRemaining > 60
  const isDanger = timeRemaining <= 60

  useEffect(() => {
    if (!circleRef.current) return
    animate(circleRef.current, {
      strokeDashoffset: offset,
      duration: 900,
      ease: 'outQuad',
    })
  }, [offset])

  useEffect(() => {
    if (prevTimeRef.current !== timeRemaining && digitsRef.current) {
      const chars = digitsRef.current.querySelectorAll('.anime-digit')
      if (chars.length) {
        animate(chars, {
          scale: [1.18, 1],
          opacity: [0.6, 1],
          duration: 350,
          ease: 'outBack(2)',
          delay: stagger(40),
        })
      }
      prevTimeRef.current = timeRemaining
    }
  }, [timeRemaining])

  useEffect(() => {
    if (isDanger && glowRef.current && !timerExpired) {
      animate(glowRef.current, {
        opacity: [0.3, 0.8, 0.3],
        scale: [1, 1.08, 1],
        duration: 1200,
        loop: true,
        ease: 'inOutSine',
      })
    }
  }, [isDanger, timerExpired])

  const strokeColor = timerExpired
    ? '#F87171'
    : isDanger
    ? '#F87171'
    : isWarning
    ? '#FBBF24'
    : 'url(#timerGradient)'

  const textColor = timerExpired
    ? 'var(--danger)'
    : isDanger
    ? 'var(--danger)'
    : isWarning
    ? 'var(--warning)'
    : 'var(--text-primary)'

  return (
    <div className={`anime-timer ${timerExpired ? 'expired' : ''} ${isDanger ? 'danger' : ''} ${isWarning ? 'warning' : ''}`}>
      <div className="anime-timer-ring" ref={glowRef}>
        <svg viewBox="0 0 120 120" className="anime-timer-svg">
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="50%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            <linearGradient id="timerWarningGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#FBBF24" />
            </linearGradient>
            <linearGradient id="timerDangerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FCA5A5" />
              <stop offset="100%" stopColor="#F87171" />
            </linearGradient>
            <filter id="timerGlow">
              <feGaussianBlur stdDeviation="3" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="rgba(139, 92, 246, 0.1)"
            strokeWidth="6"
          />

          <circle
            ref={circleRef}
            cx="60" cy="60" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
            filter="url(#timerGlow)"
            style={{ transition: 'stroke 0.5s ease' }}
          />
        </svg>

        <div className="anime-timer-content" ref={digitsRef} style={{ color: textColor }}>
          {timerExpired ? (
            <span className="anime-timer-expired">Expirat</span>
          ) : (
            <div className="anime-timer-digits">
              <span className="anime-digit">{mm[0]}</span>
              <span className="anime-digit">{mm[1]}</span>
              <span className="anime-timer-sep">:</span>
              <span className="anime-digit">{ss[0]}</span>
              <span className="anime-digit">{ss[1]}</span>
            </div>
          )}
          {!timerExpired && <span className="anime-timer-label">rămase</span>}
        </div>
      </div>
    </div>
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
  )
}

const initialAuthState = { email: '', password: '', fullName: '', role: 'student' }

function App() {
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
  const [isAuthLoading, setIsAuthLoading] = useState(false)

  // Assessment form state
  const [editingAssessment, setEditingAssessment] = useState(null)
  const [assessmentForm, setAssessmentForm] = useState({
    title: '',
    subject: '',
    description: '',
    duration: 30,
    status: 'draft',
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
  const [detailTab, setDetailTab] = useState('questions')
  const [reevalForm, setReevalForm] = useState({})
  const [expandedStudents, setExpandedStudents] = useState({})

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [timerExpired, setTimerExpired] = useState(false)
  const timerRef = useRef(null)
  const autoSubmitRef = useRef(false)

  const dashboardGridRef = useRef(null)
  const isMobile = useMobileDetection()

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token)
    } else {
      localStorage.removeItem('auth_token')
    }
  }, [token])

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
    if (timerExpired && autoSubmitRef.current && selectedAssessment) {
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

  const handleLogout = () => {
    setToken('')
    setUser(null)
    setAssessments([])
    setView('dashboard')
  }

  const QUESTION_TYPES = [
    { value: 'long_answer', label: 'Răspuns lung' },
    { value: 'short_answer', label: 'Răspuns scurt' },
    { value: 'multiple_choice', label: 'Alegere multiplă' },
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
    setAssessmentForm({ title: '', subject: '', description: '', duration: 30, status: 'draft', questions: [] })
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
      
      const payload = {
        ...assessmentForm,
        questions: assessmentForm.questions.map(({ _key, ...rest }, idx) => ({
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
      }
      return { ...p, questions }
    })
  }

  const updateOption = (qIndex, optIndex, value) => {
    setAssessmentForm((p) => {
      const questions = [...p.questions]
      const options = [...(questions[qIndex].options || [])]
      options[optIndex] = value
      questions[qIndex] = { ...questions[qIndex], options }
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
      const options = (questions[qIndex].options || []).filter((_, i) => i !== optIndex)
      questions[qIndex] = { ...questions[qIndex], options }
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
    setSelectedAssessment(assessment)
    setAnswers({})
    setFeedbackResults({})
    setMyResponses([])
    setDetailTab('questions')
    setStudentResponses([])
    setReevalForm({})
    setExpandedStudents({})
    setView('detail')

    const isOwner = user?.role === 'professor' && assessment.author_id === user?.id

    if (!isOwner && assessment.duration) {
      try {
        const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/${assessment.id}/start`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const { seconds_remaining } = await res.json()
          if (seconds_remaining <= 0) {
            setTimeRemaining(0)
            setTimerExpired(true)
            autoSubmitRef.current = false
          } else {
            setTimeRemaining(seconds_remaining)
            setTimerExpired(false)
            autoSubmitRef.current = false
          }
        } else {
          setTimeRemaining(assessment.duration * 60)
          setTimerExpired(false)
          autoSubmitRef.current = false
        }
      } catch {
        setTimeRemaining(assessment.duration * 60)
        setTimerExpired(false)
        autoSubmitRef.current = false
      }
    } else {
      setTimeRemaining(null)
      setTimerExpired(false)
    }

    if (isOwner) {
      await fetchStudentResponses(assessment.id)
    } else {
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

        const totalQuestions = (assessment.questions || []).length
        const submittedCount = Object.keys(existingFeedback).length
        if (submittedCount >= totalQuestions && totalQuestions > 0) {
          clearInterval(timerRef.current)
          setTimeRemaining(null)
        }
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

  // Auth screen
  if (!isAuthenticated) {
    return (
      <div className="auth-page">
        <div className="auth-silk-bg">
          <Silk speed={5} scale={1} color="#6521a1" noiseIntensity={1.5} rotation={0} />
        </div>
        <div className="auth-container">
          <div className="auth-logo">
            <div className="logo-icon">
              <Icons.Logo />
            </div>
            <RubrixDrawTitle />
          </div>
          <div className="auth-card">
            <div className="auth-tabs">
              <button
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
              >
                Sign In
              </button>
              <button
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
              >
                Sign Up
              </button>
            </div>
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
                />
              </label>
              {authError && <p className="error-msg">{authError}</p>}
              <button type="submit" className="btn-primary" disabled={isAuthLoading}>
                {isAuthLoading ? 'Se procesează...' : authMode === 'login' ? 'Intră în cont' : 'Creează cont'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // Navbar component
  const Navbar = () => (
    <header className="navbar">
      <div className="nav-brand">
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

  // Assessment Detail view
  if (view === 'detail' && selectedAssessment) {
    const isOwner = user?.role === 'professor' && selectedAssessment.author_id === user?.id
    const canAnswer = !isOwner
    const totalQuestions = (selectedAssessment.questions || []).length
    const submittedQuestionsCount = Object.keys(feedbackResults).length
    const allQuestionsSubmitted = totalQuestions > 0 && submittedQuestionsCount >= totalQuestions

    const groupedByStudent = studentResponses.reduce((acc, r) => {
      const key = r.user_id || 'unknown'
      if (!acc[key]) acc[key] = { name: r.user_name || 'Student necunoscut', responses: [] }
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
              <span className={`status-badge ${selectedAssessment.status}`}>
                {selectedAssessment.status}
              </span>
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
            </div>
          )}

          {detailTab === 'questions' && (
            <div className="detail-layout">
              <div className="detail-sidebar">
                <ParticleCard className="info-card magic-bento-card magic-bento-card--border-glow" disableAnimations={isMobile} particleCount={6} glowColor="132, 0, 255" enableTilt={false} clickEffect>
                  <h3>Descriere</h3>
                  <p>{selectedAssessment.description || 'Nicio descriere disponibilă.'}</p>
                </ParticleCard>
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
                  <div className="info-row">
                    <span><Icons.Document /> Exerciții:</span>
                    <strong>{(selectedAssessment.questions || []).length}</strong>
                  </div>
                  {canAnswer && (
                    <div className="info-row">
                      <span><Icons.Send /> Trimise:</span>
                      <strong>{submittedQuestionsCount}/{totalQuestions}</strong>
                    </div>
                  )}
                </ParticleCard>
              </div>

              <div className="detail-questions">
                {(!selectedAssessment.questions || selectedAssessment.questions.length === 0) ? (
                  <div className="info-card">
                    <p className="text-muted">Această evaluare nu conține exerciții.</p>
                  </div>
                ) : canAnswer ? (
                  <form onSubmit={handleSubmitAllAnswers}>
                    {allQuestionsSubmitted && (
                      <div className="submitted-info-banner">
                        Ai trimis deja toate răspunsurile. Mai jos poți vedea răspunsurile tale și orice reevaluare făcută de profesor.
                      </div>
                    )}
                    {timerExpired && Object.keys(feedbackResults).length === 0 && (
                      <div className="timer-expired-banner">
                        Timpul a expirat! Nu mai poți modifica răspunsurile.
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

          {detailTab === 'responses' && isOwner && (
            <div className="responses-view">
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

  // Analytics view
  const CHART_COLORS = ['#8B5CF6', '#A78BFA', '#7C3AED', '#6D28D9', '#C4B5FD', '#DDD6FE']
  const chartTooltipStyle = {
    contentStyle: { background: '#1a1025', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8, color: '#e0d4ff' },
    labelStyle: { color: '#a78bfa' },
    itemStyle: { color: '#e0d4ff' },
  }

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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.15)" />
                  <XAxis dataKey="range" stroke="#a78bfa" fontSize={12} />
                  <YAxis stroke="#a78bfa" fontSize={12} allowDecimals={false} />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.15)" />
                  <XAxis dataKey="evaluation_title" stroke="#a78bfa" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="#a78bfa" fontSize={12} domain={[0, 100]} unit="%" />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} />
                  <Legend wrapperStyle={{ color: '#e0d4ff', fontSize: 12 }} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.15)" />
                    <XAxis type="number" stroke="#a78bfa" fontSize={12} domain={[0, 100]} unit="%" />
                    <YAxis type="category" dataKey="question_text" stroke="#a78bfa" fontSize={11} width={200} tick={{ fill: '#c4b5fd' }} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.15)" />
                    <XAxis dataKey="evaluation_title" stroke="#a78bfa" fontSize={11} angle={-15} textAnchor="end" height={60} />
                    <YAxis stroke="#a78bfa" fontSize={12} domain={[0, 100]} unit="%" />
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
                      {(q.options || []).map((opt, oi) => (
                        <div className="qb-option-row" key={oi}>
                          <span className="qb-option-bullet">{q.question_type === 'multiple_choice' ? '○' : '☐'}</span>
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

                  <label>
                    Răspuns corect (opțional)
                    <input
                      type="text"
                      value={q.correct_answer}
                      onChange={(e) => updateQuestion(idx, 'correct_answer', e.target.value)}
                      placeholder="Folosit pentru corectare automată (opțional)"
                    />
                  </label>
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
  const isProfessor = user?.role === 'professor'

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
            filteredAssessments.map((assessment) => (
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
                    {isProfessor && (
                      <span className={`status-badge ${assessment.status}`}>{assessment.status}</span>
                    )}
                  </div>
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
                          {(assessment.questions || []).length} exerciții
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
            ))
          )}
        </div>
      </main>
    </div>
  )
}

export default App
