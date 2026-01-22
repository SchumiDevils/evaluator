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

  // Auth state
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(initialAuthState)
  const [authError, setAuthError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)

  // New assessment form
  const [newAssessment, setNewAssessment] = useState({
    title: '',
    subject: '',
    description: '',
    duration: 30,
    status: 'draft'
  })

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token)
    } else {
      localStorage.removeItem('auth_token')
    }
  }, [token])

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
      // silently fail
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
          throw new Error(err.detail ?? 'Registration failed')
        }
        setAuthMode('login')
        setAuthError('')
        return
      }

      const res = await fetch(`${API_URL}${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: authForm.email, password: authForm.password })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Login failed')
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

  const handleCreateAssessment = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/evaluations/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newAssessment)
      })
      if (res.ok) {
        setNewAssessment({ title: '', subject: '', description: '', duration: 30, status: 'draft' })
        setView('dashboard')
        fetchAssessments()
      }
    } catch {
      // handle error
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
                    Full Name
                    <input
                      type="text"
                      value={authForm.fullName}
                      onChange={handleAuthChange('fullName')}
                      placeholder="John Doe"
                    />
                  </label>
                  <label>
                    Role
                    <select value={authForm.role} onChange={handleAuthChange('role')}>
                      <option value="student">Student</option>
                      <option value="professor">Professor</option>
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
                  placeholder="you@university.edu"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={authForm.password}
                  onChange={handleAuthChange('password')}
                  placeholder="••••••••"
                  required
                />
              </label>
              {authError && <p className="error-msg">{authError}</p>}
              <button type="submit" className="btn-primary" disabled={isAuthLoading}>
                {isAuthLoading ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // New Assessment view
  if (view === 'new') {
    return (
      <div className="app-layout">
        <header className="navbar">
          <div className="nav-brand">
            <div className="logo-icon">
              <Icons.Logo />
            </div>
            <span>AI Student Evaluator</span>
          </div>
          <nav className="nav-links">
            <button onClick={() => setView('dashboard')}>
              <Icons.Dashboard />
              Dashboard
            </button>
            <button className="active">
              <Icons.Plus />
              New Assessment
            </button>
            <button className="icon-only" onClick={handleLogout} title="Logout">
              <Icons.Logout />
            </button>
          </nav>
        </header>

        <main className="main-content">
          <div className="page-header">
            <div>
              <h1>New Assessment</h1>
              <p>Create a new assessment for your students</p>
            </div>
          </div>

          <form className="assessment-form" onSubmit={handleCreateAssessment}>
            <label>
              Title *
              <input
                type="text"
                value={newAssessment.title}
                onChange={(e) => setNewAssessment((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g., Chapter 3: Cell Biology Quiz"
                required
              />
            </label>
            <label>
              Subject
              <input
                type="text"
                value={newAssessment.subject}
                onChange={(e) => setNewAssessment((p) => ({ ...p, subject: e.target.value }))}
                placeholder="e.g., Biology"
              />
            </label>
            <label>
              Description
              <textarea
                value={newAssessment.description}
                onChange={(e) => setNewAssessment((p) => ({ ...p, description: e.target.value }))}
                placeholder="Describe what this assessment covers..."
                rows={4}
              />
            </label>
            <div className="form-row">
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="5"
                  value={newAssessment.duration}
                  onChange={(e) => setNewAssessment((p) => ({ ...p, duration: Number(e.target.value) }))}
                />
              </label>
              <label>
                Status
                <select
                  value={newAssessment.status}
                  onChange={(e) => setNewAssessment((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setView('dashboard')}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Create Assessment
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
      <header className="navbar">
        <div className="nav-brand">
          <div className="logo-icon">
            <Icons.Logo />
          </div>
          <span>AI Student Evaluator</span>
        </div>
        <nav className="nav-links">
          <button className="active">
            <Icons.Dashboard />
            Dashboard
          </button>
          <button onClick={() => setView('new')}>
            <Icons.Plus />
            New Assessment
          </button>
          <button className="icon-only" onClick={handleLogout} title="Logout">
            <Icons.Logout />
          </button>
        </nav>
      </header>

      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Dashboard</h1>
            <p>Manage your assessments and track student progress</p>
          </div>
          <button className="btn-primary" onClick={() => setView('new')}>
            <Icons.Plus />
            New Assessment
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-info">
              <span className="stat-label">TOTAL ASSESSMENTS</span>
              <span className="stat-value">{stats.total}</span>
            </div>
            <div className="stat-icon blue">
              <Icons.Document />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span className="stat-label">ACTIVE NOW</span>
              <span className="stat-value">{stats.active}</span>
            </div>
            <div className="stat-icon green">
              <Icons.Clock />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span className="stat-label">TOTAL RESPONSES</span>
              <span className="stat-value">{stats.responses}</span>
            </div>
            <div className="stat-icon orange">
              <Icons.People />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <span className="stat-label">AVG. SCORE</span>
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
              placeholder="Search assessments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-tabs">
            {['all', 'draft', 'active', 'closed'].map((f) => (
              <button
                key={f}
                className={filter === f ? 'active' : ''}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'all' && 's'}
              </button>
            ))}
          </div>
        </div>

        <div className="assessments-grid">
          {isLoading ? (
            <p className="loading">Loading assessments...</p>
          ) : filteredAssessments.length === 0 ? (
            <div className="empty-state">
              <Icons.Document />
              <p>No assessments found</p>
              <button className="btn-primary" onClick={() => setView('new')}>
                Create your first assessment
              </button>
            </div>
          ) : (
            filteredAssessments.map((assessment) => (
              <div className="assessment-card" key={assessment.id}>
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
                  {assessment.description || 'No description provided'}
                </p>
                <div className="card-footer">
                  <div className="card-meta">
                    <span>
                      <Icons.People />
                      {assessment.response_count ?? 0} responses
                    </span>
                    <span>
                      <Icons.Clock />
                      {assessment.duration ?? 30} min
                    </span>
                  </div>
                  <button className="btn-icon">
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
