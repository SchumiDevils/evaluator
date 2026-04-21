import { useCallback, useEffect, useState } from 'react'
import AnimeTimer from './AnimeTimer'

const API_PREFIX = '/api/v1'
const sessionKey = (linkId) => `rubrix_public_session_${linkId}`
const feedbackStorageKey = (linkId, sessionToken) =>
  `rubrix_public_feedback_${linkId}_${sessionToken}`

function formatCountdownToStart(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime() - Date.now()
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
  const [scheduleTick, setScheduleTick] = useState(0)
  const [gateSecondsLeft, setGateSecondsLeft] = useState(null)
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
      const data = await res.json()
      setLoadError('')
      try {
        if (data.lifecycle_status === 'scheduled' || (data.schedule_access_blocked === true && data.schedule_block_kind === 'before_start')) {
          sessionStorage.removeItem(sessionKey(linkId))
        }
      } catch { /* ignore */ }
      setEvalData(data)
      if (data.seconds_until_start != null) {
        setGateSecondsLeft(data.seconds_until_start)
      } else {
        setGateSecondsLeft(null)
      }
    } catch {
      setLoadError('Nu s-a putut încărca evaluarea.')
    }
  }, [apiUrl, linkId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const startSession = useCallback(async () => {
    setStartError('')
    setSessionReady(false)
    setSessionQuestions(null)
    let stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(sessionKey(linkId)) : null
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
          const raw = typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem(feedbackStorageKey(linkId, data.session_token))
            : null
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') setFeedbackResults(parsed)
          } else {
            setFeedbackResults({})
          }
        } catch { setFeedbackResults({}) }
        const rem = Math.max(0, data.seconds_remaining ?? 0)
        const durCap = Math.max(60, (data.duration_minutes || 30) * 60)
        setTotalSeconds(rem > 0 ? rem : durCap)
        setTimeRemaining(rem)
        setTimerExpired(rem <= 0)
        setSessionReady(true)
        return
      }
    } catch (e) {
      setStartError(e.message || 'Eroare la inițializare.')
    }
  }, [apiUrl, linkId])

  const publicScheduleBlocked =
    evalData &&
    (evalData.lifecycle_status ? evalData.lifecycle_status !== 'active' : evalData.schedule_access_blocked === true)

  useEffect(() => {
    if (!evalData || publicScheduleBlocked) return
    startSession()
  }, [evalData, publicScheduleBlocked, startSession])

  const waitForStart =
    evalData?.lifecycle_status === 'scheduled' ||
    (evalData?.schedule_access_blocked === true && evalData?.schedule_block_kind === 'before_start')

  useEffect(() => {
    if (!waitForStart) return
    const id = setInterval(() => setScheduleTick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [waitForStart])

  useEffect(() => {
    if (!waitForStart) return
    const id = setInterval(() => {
      setGateSecondsLeft((s) => (s != null && s > 0 ? s - 1 : s))
    }, 1000)
    return () => clearInterval(id)
  }, [waitForStart])

  useEffect(() => {
    if (!waitForStart) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [waitForStart, load])

  useEffect(() => {
    if (!sessionReady || timerExpired) return
    const id = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev == null || prev <= 0) { setTimerExpired(true); return 0 }
        const next = prev - 1
        if (next <= 0) setTimerExpired(true)
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [sessionReady, timerExpired])

  const handleSubmitAnswer = async (questionId, answerText) => {
    if (feedbackResults[questionId]) return
    const name = guestName.trim()
    if (!name) { setSubmitError('Introdu numele înainte de a trimite.'); return }
    if (!answerText?.trim()) { setSubmitError('Introdu un răspuns.'); return }
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
        const next = { ...prev, [questionId]: { score: data.score, feedback: data.feedback || [] } }
        try {
          if (typeof sessionStorage !== 'undefined' && sessionToken) {
            sessionStorage.setItem(feedbackStorageKey(linkId, sessionToken), JSON.stringify(next))
          }
        } catch { /* ignore */ }
        return next
      })
    } catch (e) {
      setSubmitError(e.message || 'Eroare')
    } finally {
      setIsGenerating(false)
    }
  }

  /* ── Wrapper helpers ── */
  const PageShell = ({ children }) => (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {children}
      </div>
    </div>
  )

  const Card = ({ children, className = '' }) => (
    <div className={`rounded-lg border border-border bg-card p-6 shadow-sm ${className}`}>
      {children}
    </div>
  )

  const ErrorBanner = ({ children }) => (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      {children}
    </div>
  )

  const PrimaryBtn = ({ children, disabled, onClick, className = '' }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )

  const SecondaryBtn = ({ children, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </button>
  )

  const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2 disabled:opacity-50'

  /* ── Error / Loading states ── */
  if (loadError) {
    return (
      <PageShell>
        <Card><p className="text-destructive font-medium">{loadError}</p></Card>
      </PageShell>
    )
  }

  if (!evalData) {
    return (
      <PageShell>
        <Card><p className="text-muted-foreground">Se încarcă...</p></Card>
      </PageShell>
    )
  }

  const startIsoPub = evalData.start_at || evalData.scheduled_starts_at
  const gateLabelPub = gateSecondsLeft != null ? formatSecondsCountdown(gateSecondsLeft) : formatCountdownToStart(startIsoPub)

  /* ── Wait for schedule ── */
  if (waitForStart) {
    const nq = evalData.question_count ?? 0
    return (
      <PageShell>
        <Card>
          <h1 className="text-2xl font-bold">{evalData.title}</h1>
          {evalData.subject && <p className="mt-1 text-sm font-medium text-muted-foreground">{evalData.subject}</p>}
          {evalData.description && <p className="mt-2 text-sm text-muted-foreground">{evalData.description}</p>}
          <p className="mt-2 text-sm text-muted-foreground">
            Stare (server): <strong>{evalData.lifecycle_status || 'scheduled'}</strong>
          </p>

          <h2 className="mt-6 text-lg font-semibold text-amber-500">
            Fereastra nu e deschisă — evaluarea e programată
          </h2>
          <p className="mt-2 text-base" key={scheduleTick} aria-live="polite">
            Rămâne până la start: <strong className="text-primary">{gateLabelPub}</strong>
          </p>

          {evalData.server_now && (
            <p className="mt-2 text-sm text-muted-foreground">
              Timp server: {new Date(evalData.server_now).toLocaleString('ro-RO')}
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Start fereastră:{' '}
            {startIsoPub ? new Date(startIsoPub).toLocaleString('ro-RO', { dateStyle: 'full', timeStyle: 'short' }) : '—'}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            În fereastra activă ai maxim {evalData.duration} minute pentru completare după ce începi.
            {nq > 0 ? ` ${nq} exerciții.` : ''} Pagina se actualizează singură.
          </p>

          <div className="mt-4">
            <SecondaryBtn onClick={() => load()}>Reîmprospătează acum</SecondaryBtn>
          </div>
        </Card>
      </PageShell>
    )
  }

  /* ── Closed ── */
  const showClosedPublic =
    evalData.lifecycle_status === 'closed' ||
    (evalData.schedule_access_blocked === true && evalData.schedule_block_kind === 'after_end')

  if (showClosedPublic) {
    return (
      <PageShell>
        <Card>
          <h1 className="text-2xl font-bold">{evalData.title}</h1>
          <h2 className="mt-4 text-lg font-semibold text-destructive">Fereastra s-a încheiat</h2>
          <p className="mt-2 text-sm text-muted-foreground">{evalData.schedule_block_message}</p>
          <p className="mt-1 text-sm text-muted-foreground">Nu mai poți începe sau continua această evaluare prin acest link.</p>
        </Card>
      </PageShell>
    )
  }

  if (publicScheduleBlocked) {
    return (
      <PageShell>
        <Card>
          <h1 className="text-2xl font-bold">{evalData.title}</h1>
          <p className="mt-2 text-destructive font-medium">{evalData.schedule_block_message || 'Evaluarea nu este disponibilă acum.'}</p>
          <div className="mt-4">
            <SecondaryBtn onClick={() => load()}>Reîncearcă</SecondaryBtn>
          </div>
        </Card>
      </PageShell>
    )
  }

  if (startError) {
    return (
      <PageShell>
        <Card>
          <p className="text-destructive font-medium">{startError}</p>
          <div className="mt-4">
            <PrimaryBtn onClick={() => startSession()}>Reîncearcă</PrimaryBtn>
          </div>
        </Card>
      </PageShell>
    )
  }

  if (!sessionReady || sessionToken == null || timeRemaining == null) {
    return (
      <PageShell>
        <Card><p className="text-muted-foreground">Se pregătește sesiunea și cronometrul...</p></Card>
      </PageShell>
    )
  }

  /* ── Main exam view ── */
  const questions = sessionQuestions ?? []
  const canAnswer = guestName.trim().length > 0 && !timerExpired && timeRemaining > 0
  const timerBlock = timerExpired || timeRemaining <= 0

  return (
    <PageShell>
      {/* Header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-1">
            <h1 className="text-2xl font-bold">{evalData.title}</h1>
            {evalData.subject && <p className="text-sm font-medium text-muted-foreground">{evalData.subject}</p>}
            {evalData.description && <p className="text-sm text-muted-foreground">{evalData.description}</p>}
            {(evalData.start_at || evalData.end_at || evalData.scheduled_starts_at || evalData.scheduled_ends_at) && (
              <p className="text-xs text-muted-foreground">
                Fereastră:{' '}
                {(evalData.start_at || evalData.scheduled_starts_at)
                  ? new Date(evalData.start_at || evalData.scheduled_starts_at).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })
                  : '—'}
                {' → '}
                {(evalData.end_at || evalData.scheduled_ends_at)
                  ? new Date(evalData.end_at || evalData.scheduled_ends_at).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })
                  : '—'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              După început: maxim {evalData.duration} minute pentru completare (și nu după end_at). Stare:{' '}
              <strong>{evalData.lifecycle_status || 'active'}</strong>.
            </p>
          </div>
          <div className="flex-shrink-0">
            <AnimeTimer timeRemaining={timeRemaining} totalDuration={totalSeconds} timerExpired={timerExpired} />
          </div>
        </div>
      </Card>

      {/* Timer expired banner */}
      {timerBlock && (evalData.lifecycle_status === 'active' || !evalData.lifecycle_status) && (
        <ErrorBanner>
          Timpul pentru completare în această sesiune a expirat. Nu mai poți trimite răspunsuri noi.
        </ErrorBanner>
      )}

      {/* Guest info */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold">Date participant</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nume complet *</label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Ex: Ion Popescu"
              className={inputCls}
              disabled={timerBlock}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Clasă / grup</label>
            <input
              type="text"
              value={guestClass}
              onChange={(e) => setGuestClass(e.target.value)}
              placeholder="Ex: 10A"
              className={inputCls}
              disabled={timerBlock}
            />
          </div>
        </div>
      </Card>

      {/* Feedback mode */}
      <Card>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Mod feedback</label>
        <select
          value={feedbackMode}
          onChange={(e) => setFeedbackMode(e.target.value)}
          className={inputCls}
          disabled={!canAnswer || timerBlock}
        >
          <option value="ai">AI</option>
          <option value="rule_based">Reguli simple</option>
        </select>
      </Card>

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      {questions.length === 0 && (
        <Card><p className="text-muted-foreground">Această evaluare nu conține exerciții.</p></Card>
      )}

      {/* Questions */}
      {questions.map((q, idx) => {
        const fb = feedbackResults[q.id]
        const isDisabled = !canAnswer || isGenerating || fb || timerBlock
        return (
          <Card key={q.id}>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Întrebarea {idx + 1}</h3>
              <span className="text-xs text-muted-foreground">({q.points} pct.)</span>
            </div>
            <p className="mb-4 text-sm">{q.text}</p>

            {/* Multiple choice */}
            {q.question_type === 'multiple_choice' && q.options && (
              <div className="mb-4 space-y-2">
                {q.options.map((opt, oi) => (
                  <label
                    key={oi}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                      answers[q.id] === opt
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/50'
                    } ${isDisabled ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`pq-${q.id}`}
                      value={opt}
                      checked={answers[q.id] === opt}
                      disabled={isDisabled}
                      onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt }))}
                      className="accent-primary"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Checkboxes */}
            {q.question_type === 'checkboxes' && q.options && (
              <div className="mb-4 space-y-2">
                {q.options.map((opt, oi) => {
                  const selected = (answers[q.id] || '').split('||')
                  const isChecked = selected.includes(opt)
                  return (
                    <label
                      key={oi}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors ${
                        isChecked ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
                      } ${isDisabled ? 'pointer-events-none opacity-60' : ''}`}
                    >
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
                        className="accent-primary"
                      />
                      <span>{opt}</span>
                    </label>
                  )
                })}
              </div>
            )}

            {/* Short answer */}
            {q.question_type === 'short_answer' && (
              <input
                type="text"
                className={`mb-4 ${inputCls}`}
                value={answers[q.id] || ''}
                disabled={isDisabled}
                onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                placeholder="Răspuns..."
              />
            )}

            {/* Long answer */}
            {(q.question_type === 'long_answer' || !q.question_type) && (
              <textarea
                className={`mb-4 min-h-[120px] ${inputCls}`}
                rows={5}
                value={answers[q.id] || ''}
                disabled={isDisabled}
                onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                placeholder="Scrie răspunsul aici..."
              />
            )}

            {/* Feedback display */}
            {fb && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                {fb.score != null && (
                  <p className="mb-2 text-sm font-semibold">
                    Scor: <span className="text-primary">{fb.score}</span>
                  </p>
                )}
                {fb.feedback?.map((item, i) => (
                  <div key={i} className="mt-2 text-sm">
                    <strong className="text-xs uppercase text-muted-foreground">{item.category}</strong>
                    <p className="mt-0.5">{item.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Submit button */}
            {!fb && (
              <PrimaryBtn disabled={isDisabled} onClick={() => handleSubmitAnswer(q.id, answers[q.id])}>
                {isGenerating ? (
                  'Se procesează...'
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                    Trimite răspunsul
                  </>
                )}
              </PrimaryBtn>
            )}
          </Card>
        )
      })}
    </PageShell>
  )
}
