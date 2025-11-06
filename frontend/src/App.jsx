import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const API_PREFIX = '/api/v1'

const initialAuthState = {
  email: '',
  password: '',
  fullName: '',
  role: 'student'
}

function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem('auth_token') ?? '')
  const [user, setUser] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState(initialAuthState)

  const [answer, setAnswer] = useState('')
  const [evaluationId, setEvaluationId] = useState('')
  const [mode, setMode] = useState('rule_based')
  const [rubricText, setRubricText] = useState('')
  const [feedback, setFeedback] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (token) {
      window.localStorage.setItem('auth_token', token)
    } else {
      window.localStorage.removeItem('auth_token')
    }
  }, [token])

  const fetchProfile = useCallback(async () => {
    if (!token) {
      setUser(null)
      return
    }
    try {
      const response = await fetch(`${API_URL}${API_PREFIX}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!response.ok) {
        throw new Error('Nu am putut încărca profilul.')
      }
      const data = await response.json()
      setUser(data)
    } catch (err) {
      setUser(null)
      setAuthError(err.message)
      setToken('')
    }
  }, [token])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const rubricList = useMemo(() => {
    return rubricText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }, [rubricText])

  const handleAuthChange = (field) => (event) => {
    setAuthForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthError('')
    setIsAuthLoading(true)

    try {
      if (authMode === 'register') {
        const response = await fetch(`${API_URL}${API_PREFIX}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authForm.email,
            password: authForm.password,
            full_name: authForm.fullName,
            role: authForm.role
          })
        })

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}))
          throw new Error(errorPayload.detail ?? 'Înregistrarea a eșuat.')
        }
        setStatus('Cont creat cu succes. Te poți autentifica.')
        setAuthMode('login')
        return
      }

      const body = new URLSearchParams({
        username: authForm.email,
        password: authForm.password
      })

      const response = await fetch(`${API_URL}${API_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.detail ?? 'Autentificarea a eșuat.')
      }
      const data = await response.json()
      setToken(data.access_token)
      setStatus('Autentificare reușită.')
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
    setFeedback([])
    setStatus('Ai fost deconectat.')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!token) {
      setFeedbackError('Trebuie să fii autentificat pentru a genera feedback.')
      return
    }
    setIsSubmitting(true)
    setFeedbackError('')
    setStatus('')
    setFeedback([])

    try {
      const payload = {
        answer,
        mode,
        evaluation_id: evaluationId ? Number(evaluationId) : null,
        rubric: rubricList.length > 0 ? rubricList : null
      }

      const response = await fetch(`${API_URL}${API_PREFIX}/feedback/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        if (response.status === 401) {
          setToken('')
          setUser(null)
          throw new Error('Sesiune expirată. Autentifică-te din nou.')
        }
        const errorPayload = await response.json().catch(() => ({}))
        throw new Error(errorPayload.detail ?? 'A apărut o eroare la generarea feedback-ului.')
      }

      const data = await response.json()
      setFeedback(data.feedback ?? [])
      setStatus('Feedback generat cu succes.')
    } catch (err) {
      setFeedbackError(err.message || 'Nu am putut prelua feedback-ul.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = answer.trim().length > 0 && !isSubmitting
  const canReset = answer.trim().length > 0 || feedback.length > 0 || Boolean(feedbackError) || Boolean(status)
  const isAuthenticated = Boolean(token && user)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Evaluator Inteligent</h1>
        <p>
          Platformă demonstrativă pentru evaluare cu persistență în baza de date, autentificare și feedback asistat de
          AI.
        </p>
      </header>

      <main className="app-main">
        <section className="auth-card">
          <div className="auth-header">
            <h2>{isAuthenticated ? 'Contul tău' : 'Autentificare / Înregistrare'}</h2>
            {status ? <span className="status success">{status}</span> : null}
          </div>

          {isAuthenticated ? (
            <div className="auth-profile">
              <p>
                <strong>{user.full_name ?? user.email}</strong>
              </p>
              <p className="badge">{user.role}</p>
              <button type="button" className="secondary" onClick={handleLogout}>
                Deloghează-te
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <div className="auth-tabs">
                <button
                  type="button"
                  className={authMode === 'login' ? 'active' : ''}
                  onClick={() => {
                    setAuthMode('login')
                    setAuthError('')
                  }}
                >
                  Login
                </button>
                <button
                  type="button"
                  className={authMode === 'register' ? 'active' : ''}
                  onClick={() => {
                    setAuthMode('register')
                    setAuthError('')
                  }}
                >
                  Register
                </button>
              </div>

              {authMode === 'register' ? (
                <>
                  <label>
                    Nume complet
                    <input
                      type="text"
                      value={authForm.fullName}
                      onChange={handleAuthChange('fullName')}
                      placeholder="ex: Ana Ionescu"
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
              ) : null}

              <label>
                Email
                <input
                  type="email"
                  value={authForm.email}
                  onChange={handleAuthChange('email')}
                  placeholder="nume@universitate.ro"
                  required
                />
              </label>
              <label>
                Parolă
                <input
                  type="password"
                  value={authForm.password}
                  onChange={handleAuthChange('password')}
                  placeholder="minim 6 caractere"
                  required
                />
              </label>

              <button type="submit" disabled={isAuthLoading}>
                {isAuthLoading ? 'Se procesează...' : authMode === 'login' ? 'Intră în cont' : 'Creează cont'}
              </button>
              {authError ? <p className="status error">{authError}</p> : null}
            </form>
          )}
        </section>

        <section className="input-card">
          <header className="card-header">
            <h2>Generează feedback</h2>
            <div className="mode-toggle">
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="rule_based"
                  checked={mode === 'rule_based'}
                  onChange={() => setMode('rule_based')}
                />
                Rule-based
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="ai"
                  checked={mode === 'ai'}
                  onChange={() => setMode('ai')}
                />
                NLP (OpenAI/Hugging Face)
              </label>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="feedback-form">
            <label htmlFor="answer">Răspunsul tău</label>
            <textarea
              id="answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={8}
              placeholder="Ex: Explică utilitatea evaluării formative în procesul didactic."
            />

            <div className="form-grid">
              <label>
                ID evaluare (opțional)
                <input
                  type="number"
                  min="1"
                  value={evaluationId}
                  onChange={(event) => setEvaluationId(event.target.value)}
                  placeholder="ex: 12"
                />
              </label>

              <label>
                Rubrică (listă, una pe linie)
                <textarea
                  value={rubricText}
                  onChange={(event) => setRubricText(event.target.value)}
                  rows={4}
                  placeholder="Claritate\nArgumentare\nExemple relevante"
                />
              </label>
            </div>

            <div className="actions">
              <button type="submit" disabled={!canSubmit || !isAuthenticated}>
                {isSubmitting ? 'Se generează...' : 'Generează feedback'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setAnswer('')
                  setFeedback([])
                  setFeedbackError('')
                  setStatus('')
                  setRubricText('')
                  setEvaluationId('')
                }}
                disabled={isSubmitting || !canReset}
              >
                Resetează
              </button>
            </div>
            {!isAuthenticated ? (
              <p className="status muted">Autentifică-te pentru a putea trimite răspunsuri.</p>
            ) : null}
            {feedbackError ? <p className="status error">{feedbackError}</p> : null}
          </form>
        </section>

        <section className="feedback-card" aria-live="polite">
          <h2>Feedback generat</h2>
          {feedback.length === 0 && !feedbackError ? (
            <p className="status muted">Completează un răspuns și trimite-l pentru a primi feedback.</p>
          ) : null}
          <ul>
            {feedback.map((item, index) => (
              <li key={`${item.category}-${index}`}>
                <div className="item-header">
                  <span className="badge">{item.category}</span>
                  <span className="source">{item.source ?? 'rule_based'}</span>
                </div>
                <p>{item.message}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="app-footer">
        <small>
          MVP licență &bull; FastAPI + PostgreSQL (SQLAlchemy) &bull; Autentificare JWT &bull; AI via OpenAI /
          Hugging&nbsp;Face
        </small>
      </footer>
    </div>
  )
}

export default App
