import { useCallback, useEffect, useState } from 'react'
import './App.css'

const API_PREFIX = '/api/v1'

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

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}${API_PREFIX}/evaluations/public/${linkId}`)
      if (!res.ok) {
        setLoadError('Link invalid sau evaluarea nu este activă.')
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

  const handleSubmitAnswer = async (questionId, answerText) => {
    const name = guestName.trim()
    if (!name) {
      setSubmitError('Introdu numele înainte de a trimite.')
      return
    }
    if (!answerText?.trim()) {
      setSubmitError('Introdu un răspuns.')
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
          guest_name: name,
          guest_class: guestClass.trim(),
          mode: feedbackMode,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Eroare la trimitere')
      }
      const data = await res.json()
      setFeedbackResults((prev) => ({
        ...prev,
        [questionId]: {
          score: data.score,
          feedback: data.feedback || [],
        },
      }))
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

  const questions = evalData.questions || []
  const canAnswer = guestName.trim().length > 0

  return (
    <div className="public-exam-page">
      <div className="public-exam-header">
        <h1>{evalData.title}</h1>
        {evalData.subject && <p className="public-exam-subject">{evalData.subject}</p>}
        {evalData.description && <p className="text-muted">{evalData.description}</p>}
        <p className="text-muted">Durată indicativă: {evalData.duration} minute</p>
      </div>

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
          />
        </label>
      </div>

      <div className="public-exam-card">
        <span className="public-exam-label">Mod feedback</span>
        <select
          value={feedbackMode}
          onChange={(e) => setFeedbackMode(e.target.value)}
          className="public-exam-input"
          disabled={!canAnswer}
        >
          <option value="ai">AI</option>
          <option value="rule_based">Reguli simple</option>
        </select>
      </div>

      {submitError && <div className="notification error public-exam-notice">{submitError}</div>}

      {questions.map((q, idx) => {
        const fb = feedbackResults[q.id]
        const isDisabled = !canAnswer || isGenerating || fb
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
                {isGenerating ? 'Se procesează...' : (
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
