import { useCallback, useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const API_PREFIX = '/api/v1'

// Icons as simple SVG components
const Icons = {
  Logo: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
      <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z"/>
    </svg>
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
    status: 'draft'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Assessment detail view
  const [selectedAssessment, setSelectedAssessment] = useState(null)
  const [studentAnswer, setStudentAnswer] = useState('')
  const [feedbackResult, setFeedbackResult] = useState(null)
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false)

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

  const resetAssessmentForm = () => {
    setAssessmentForm({ title: '', subject: '', description: '', duration: 30, status: 'draft' })
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
      
      const res = await fetch(url, {
        method: editingAssessment ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(assessmentForm)
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
      status: assessment.status
    })
    setView('new')
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

  const handleOpenAssessment = (assessment) => {
    setSelectedAssessment(assessment)
    setStudentAnswer('')
    setFeedbackResult(null)
    setView('detail')
  }

  const handleSubmitAnswer = async (e) => {
    e.preventDefault()
    if (!studentAnswer.trim()) {
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
          answer: studentAnswer,
          evaluation_id: selectedAssessment.id,
          mode: 'rule_based'
        })
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Nu s-a putut genera feedback-ul.')
      }
      
      const data = await res.json()
      setFeedbackResult(data)
      fetchAssessments() // Refresh to update response count
    } catch (err) {
      setError(err.message)
    } finally {
      setIsGeneratingFeedback(false)
    }
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
        <div className="auth-container">
          <div className="auth-logo">
            <div className="logo-icon">
              <Icons.Logo />
            </div>
            <h1>AI Student Evaluator</h1>
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
        <span>AI Student Evaluator</span>
      </div>
      <nav className="nav-links">
        <button 
          className={view === 'dashboard' ? 'active' : ''} 
          onClick={() => { setView('dashboard'); resetAssessmentForm(); setSelectedAssessment(null); }}
        >
          <Icons.Dashboard />
          <span>Dashboard</span>
        </button>
        <button 
          className={view === 'new' ? 'active' : ''} 
          onClick={() => { setView('new'); resetAssessmentForm(); }}
        >
          <Icons.Plus />
          <span>New Assessment</span>
        </button>
        <button className="icon-only" onClick={handleLogout} title="Logout">
          <Icons.Logout />
        </button>
      </nav>
    </header>
  )

  // Notification component
  const Notifications = () => (
    <>
      {error && <div className="notification error">{error}</div>}
      {success && <div className="notification success">{success}</div>}
    </>
  )

  // Assessment Detail view
  if (view === 'detail' && selectedAssessment) {
    return (
      <div className="app-layout">
        <Navbar />
        <Notifications />
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
              {user?.role === 'professor' && (
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

          <div className="detail-grid">
            <div className="detail-info">
              <div className="info-card">
                <h3>Descriere</h3>
                <p>{selectedAssessment.description || 'Nicio descriere disponibilă.'}</p>
              </div>
              <div className="info-card">
                <h3>Detalii</h3>
                <div className="info-row">
                  <span><Icons.Clock /> Durată:</span>
                  <strong>{selectedAssessment.duration} minute</strong>
                </div>
                <div className="info-row">
                  <span><Icons.People /> Răspunsuri:</span>
                  <strong>{selectedAssessment.response_count}</strong>
                </div>
              </div>
            </div>

            <div className="answer-section">
              <div className="info-card">
                <h3>Trimite răspunsul tău</h3>
                <form onSubmit={handleSubmitAnswer}>
                  <textarea
                    value={studentAnswer}
                    onChange={(e) => setStudentAnswer(e.target.value)}
                    placeholder="Scrie răspunsul tău aici..."
                    rows={8}
                    disabled={isGeneratingFeedback}
                  />
                  <button 
                    type="submit" 
                    className="btn-primary" 
                    disabled={isGeneratingFeedback || !studentAnswer.trim()}
                  >
                    {isGeneratingFeedback ? 'Se generează feedback...' : (
                      <>
                        <Icons.Send />
                        Trimite și primește feedback
                      </>
                    )}
                  </button>
                </form>
              </div>

              {feedbackResult && (
                <div className="info-card feedback-card">
                  <h3>Feedback primit</h3>
                  <ul className="feedback-list">
                    {feedbackResult.feedback?.map((item, index) => (
                      <li key={index}>
                        <span className="badge">{item.category}</span>
                        <p>{item.message}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    )
  }

  // New/Edit Assessment view
  if (view === 'new') {
    return (
      <div className="app-layout">
        <Navbar />
        <Notifications />
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
                rows={4}
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
      <Notifications />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Dashboard</h1>
            <p>Gestionează evaluările și urmărește progresul studenților</p>
          </div>
          <button className="btn-primary" onClick={() => setView('new')}>
            <Icons.Plus />
            Evaluare nouă
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-info">
              <span className="stat-label">TOTAL EVALUĂRI</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            <div className="stat-icon blue">
              <Icons.Document />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span className="stat-label">ACTIVE</span>
              <span className="stat-value">{stats.active}</span>
            </div>
            <div className="stat-icon green">
              <Icons.Clock />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span className="stat-label">TOTAL RĂSPUNSURI</span>
              <span className="stat-value">{stats.responses}</span>
            </div>
            <div className="stat-icon orange">
              <Icons.People />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span className="stat-label">SCOR MEDIU</span>
              <span className="stat-value">{stats.avgScore}%</span>
            </div>
            <div className="stat-icon pink">
              <Icons.Trend />
            </div>
          </div>
        </div>

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
          <div className="filter-tabs">
            <button
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              Toate
            </button>
            <button
              className={filter === 'draft' ? 'active' : ''}
              onClick={() => setFilter('draft')}
            >
              Draft
            </button>
            <button
              className={filter === 'active' ? 'active' : ''}
              onClick={() => setFilter('active')}
            >
              Active
            </button>
            <button
              className={filter === 'closed' ? 'active' : ''}
              onClick={() => setFilter('closed')}
            >
              Închise
            </button>
          </div>
        </div>

        <div className="assessments-grid">
          {isLoading ? (
            <p className="loading">Se încarcă evaluările...</p>
          ) : filteredAssessments.length === 0 ? (
            <div className="empty-state">
              <Icons.Document />
              <p>Nu există evaluări{filter !== 'all' ? ` cu statusul "${filter}"` : ''}</p>
              <button className="btn-primary" onClick={() => setView('new')}>
                Creează prima evaluare
              </button>
            </div>
          ) : (
            filteredAssessments.map((assessment) => (
              <div 
                className="assessment-card" 
                key={assessment.id}
                onClick={() => handleOpenAssessment(assessment)}
              >
                <div className="card-header">
                  <div className="card-icon">
                    <Icons.Document />
                  </div>
                  <div className="card-title">
                    <h3>{assessment.title}</h3>
                    <span className="subject">{assessment.subject || 'General'}</span>
                  </div>
                  <span className={`status-badge ${assessment.status}`}>{assessment.status}</span>
                </div>
                <p className="card-description">
                  {assessment.description || 'Nicio descriere disponibilă'}
                </p>
                <div className="card-footer">
                  <div className="card-meta">
                    <span>
                      <Icons.People />
                      {assessment.response_count ?? 0} răspunsuri
                    </span>
                    <span>
                      <Icons.Clock />
                      {assessment.duration ?? 30} min
                    </span>
                  </div>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleOpenAssessment(assessment); }}>
                    <Icons.Arrow />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}

export default App
