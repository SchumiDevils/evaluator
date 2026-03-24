import { useCallback, useEffect, useState } from 'react'
import AnimeTimer from './components/AnimeTimer'
import './App.css'

const API_PREFIX = '/api/v1'
const sessionKey = (linkId) => `rubrix_public_session_${linkId}`
const feedbackStorageKey = (linkId, sessionToken) =>
  `rubrix_public_feedback_${linkId}_${sessionToken}`

const Icons = {
  Send: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  ),
}

export default function PublicExam({ linkId, apiUrl }) {
  const [evalData, setEvalData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestClass, setGuestClass] = useState('')
  const [answers, setAnswers] = useState({})
  const [feedbackResults, setFeedbackResults] = useState({})
  const [feedbackMode, setFeedbackMode] = useState('ai')
  const [isGenerating, setIsGenerating] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [sessionToken, setSessionToken] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [timerExpired, setTimerExpired] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [startError, setStartError] = useState('')
  /** Întrebări în ordine amestecată per sesiune (de la POST /start, nu din GET public). */
  const [sessionQuestions, setSessionQuestions] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}${API_PREFIX}/evaluations/public/${linkId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setLoadError(
          typeof err.detail === 'string'
            ? err.detail
            : 'Link invalid sau evaluarea nu este activă.'
        )
        return
      }
      setEvalData(await res.json())
    } catch {
      setLoadError('Nu s-a putut încărca evaluarea.')
    }
  }, [apiUrl, linkId])

  useEffect(() => {
    load()
  }, [load])

  const startSession = useCallback(async () => {
    setStartError('')
    setSessionReady(false)
    setSessionQuestions(null)
    let stored =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(sessionKey(linkId)) : null
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const body = stored ? { session_token: stored } : {}
        const res = await fetch(`${apiUrl}${API_PREFIX}/evaluations/public/${linkId}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.status === 404 && stored && attempt === 0) {
          sessionStorage.removeItem(sessionKey(linkId))
          stored = null
          continue
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail ?? 'Nu s-a putut porni sesiunea.')
        }
        const data = await res.json()
        setSessionToken(data.session_token)
        sessionStorage.setItem(sessionKey(linkId), data.session_token)
        setSessionQuestions(Array.isArray(data.questions) ? data.questions : [])
        try {
          const raw =
            typeof sessionStorage !== 'undefined'
              ? sessionStorage.getItem(feedbackStorageKey(linkId, data.session_token))
              : null
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') {
              setFeedbackResults(parsed)
            }
          } else {
            setFeedbackResults({})
          }
        } catch {
          setFeedbackResults({})
        }
        const total = Math.max(60, (data.duration_minutes || 30) * 60)
        setTotalSeconds(total)
        const sec = Math.min(data.seconds_remaining ?? 0, total)
        setTimeRemaining(sec)
        setTimerExpired(sec <= 0)
        setSessionReady(true)
        return
      }
    } catch (e) {
      setStartError(e.message || 'Eroare la inițializare.')
    }
  }, [apiUrl, linkId])

  useEffect(() => {
    if (!evalData) return
    startSession()
  }, [evalData, startSession])

  useEffect(() => {
    if (!sessionReady || timerExpired) return
    const id = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev == null || prev <= 0) {
          setTimerExpired(true)
          return 0
        }
        const next = prev - 1
        if (next <= 0) setTimerExpired(true)
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [sessionReady, timerExpired])

  const handleSubmitAnswer = async (questionId, answerText) => {
    if (feedbackResults[questionId]) {
      return
    }
    const name = guestName.trim()
    if (!name) {
      setSubmitError('Introdu numele înainte de a trimite.')
      return
    }
    if (!answerText?.trim()) {
      setSubmitError('Introdu un răspuns.')
      return
    }
    if (!sessionToken || timerExpired || (timeRemaining != null && timeRemaining <= 0)) {
      setSubmitError('Timpul a expirat; nu mai poți trimite răspunsuri.')
      return
    }
    setSubmitError('')
    setIsGenerating(true)
    try {
      const res = await fetch(`${apiUrl}${API_PREFIX}/evaluations/public/${linkId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          answer: answerText,
          session_token: sessionToken,
          guest_name: name,
          guest_class: guestClass.trim(),
          mode: feedbackMode,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err.detail ?? 'Eroare la trimitere'
        if (res.status === 403 && String(msg).toLowerCase().includes('expirat')) {
          setTimerExpired(true)
          setTimeRemaining(0)
        }
        throw new Error(msg)
      }
      const data = await res.json()
      setFeedbackResults((prev) => {
        const next = {
          ...prev,
          [questionId]: {
            score: data.score,
            feedback: data.feedback || [],
          },
        }
        try {
          if (typeof sessionStorage !== 'undefined' && sessionToken) {
            sessionStorage.setItem(feedbackStorageKey(linkId, sessionToken), JSON.stringify(next))
          }
        } catch {
          /* ignore quota / private mode */
        }
        return next
      })
    } catch (e) {
      setSubmitError(e.message || 'Eroare')
    } finally {
      setIsGenerating(false)
    }
  }

  if (loadError) {
    return (
      <div className="public-exam-page">
        <div className="public-exam-card">
          <p className="error-msg">{loadError}</p>
        </div>
      </div>
    )
  }

  if (!evalData) {
    return (
      <div className="public-exam-page">
        <div className="public-exam-card">
          <p className="text-muted">Se încarcă...</p>
        </div>
      </div>
    )
  }

  if (startError) {
    return (
      <div className="public-exam-page">
        <div className="public-exam-card">
          <p className="error-msg">{startError}</p>
          <button type="button" className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => startSession()}>
            Reîncearcă
          </button>
        </div>
      </div>
    )
  }

  if (!sessionReady || sessionToken == null || timeRemaining == null) {
    return (
      <div className="public-exam-page">
        <div className="public-exam-card">
          <p className="text-muted">Se pregătește sesiunea și cronometrul...</p>
        </div>
      </div>
    )
  }

  const questions = sessionQuestions ?? []
  const canAnswer = guestName.trim().length > 0 && !timerExpired && timeRemaining > 0
  const timerBlock = timerExpired || timeRemaining <= 0

  return (
    <div className="public-exam-page">
      <div className="public-exam-header">
        <div className="public-exam-header-row">
          <div className="public-exam-header-text">
            <h1>{evalData.title}</h1>
            {evalData.subject && <p className="public-exam-subject">{evalData.subject}</p>}
            {evalData.description && <p className="text-muted">{evalData.description}</p>}
            <p className="text-muted public-exam-timer-hint">
              Timp limită: {evalData.duration} minute (blochează trimiterea la expirare).
            </p>
          </div>
          <div className="public-exam-timer-wrap">
            <AnimeTimer
              timeRemaining={timeRemaining}
              totalDuration={totalSeconds}
              timerExpired={timerExpired}
            />
          </div>
        </div>
      </div>

      {timerBlock && (
        <div className="notification error public-exam-notice">
          Timpul alocat evaluării a expirat. Nu mai poți trimite răspunsuri noi.
        </div>
      )}

      <div className="public-exam-card">
        <h3>Date participant</h3>
        <label className="public-exam-label">
          Nume complet *
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Ex: Ion Popescu"
            className="public-exam-input"
            disabled={timerBlock}
          />
        </label>
        <label className="public-exam-label">
          Clasă / grup
          <input
            type="text"
            value={guestClass}
            onChange={(e) => setGuestClass(e.target.value)}
            placeholder="Ex: 10A"
            className="public-exam-input"
            disabled={timerBlock}
          />
        </label>
      </div>

      <div className="public-exam-card">
        <span className="public-exam-label">Mod feedback</span>
        <select
          value={feedbackMode}
          onChange={(e) => setFeedbackMode(e.target.value)}
          className="public-exam-input"
          disabled={!canAnswer || timerBlock}
        >
          <option value="ai">AI</option>
          <option value="rule_based">Reguli simple</option>
        </select>
      </div>

      {submitError && <div className="notification error public-exam-notice">{submitError}</div>}

      {questions.length === 0 && (
        <div className="public-exam-card">
          <p className="text-muted">Această evaluare nu conține exerciții.</p>
        </div>
      )}

      {questions.map((q, idx) => {
        const fb = feedbackResults[q.id]
        const isDisabled = !canAnswer || isGenerating || fb || timerBlock
        return (
          <div className="public-exam-card question-card-public" key={q.id}>
            <h3>
              Întrebarea {idx + 1} <span className="question-points">({q.points} pct.)</span>
            </h3>
            <p className="question-text">{q.text}</p>

            {q.question_type === 'multiple_choice' && q.options && (
              <div className="question-options">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="option-label">
                    <input
                      type="radio"
                      name={`pq-${q.id}`}
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

            {q.question_type === 'checkboxes' && q.options && (
              <div className="question-options">
                {q.options.map((opt, oi) => {
                  const selected = (answers[q.id] || '').split('||')
                  const isChecked = selected.includes(opt)
                  return (
                    <label key={oi} className="option-label">
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
                value={answers[q.id] || ''}
                disabled={isDisabled}
                onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                placeholder="Răspuns..."
              />
            )}

            {(q.question_type === 'long_answer' || !q.question_type) && (
              <textarea
                className="question-textarea"
                rows={5}
                value={answers[q.id] || ''}
                disabled={isDisabled}
                onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                placeholder="Scrie răspunsul aici..."
              />
            )}

            {fb && (
              <div className="feedback-box">
                {fb.score != null && <p className="score-line">Scor: {fb.score}</p>}
                {fb.feedback?.map((item, i) => (
                  <div key={i} className="feedback-item">
                    <strong>{item.category}</strong>
                    <p>{item.message}</p>
                  </div>
                ))}
              </div>
            )}

            {!fb && (
              <button
                type="button"
                className="btn-primary"
                disabled={isDisabled}
                onClick={() => handleSubmitAnswer(q.id, answers[q.id])}
              >
                {isGenerating ? (
                  'Se procesează...'
                ) : (
                  <>
                    <Icons.Send /> Trimite răspunsul
                  </>
                )}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
