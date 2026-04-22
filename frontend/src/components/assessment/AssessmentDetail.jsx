import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { evaluations as evalApi, feedback as feedbackApi } from '@/lib/api'
import {
  getEvaluationQuestionCount,
  formatCountdownToStart,
  formatSecondsCountdown,
  unifiedEvalStatusBadge,
  feedbackSourceLabel,
  feedbackSourceVariant,
  CHART_COLORS,
  chartTooltipStyle,
} from '@/lib/helpers'
import RightSidebar from '@/components/layout/RightSidebar'
import AnimeTimer from '@/components/AnimeTimer'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  ArrowLeft,
  FileText,
  Users,
  BarChart3,
  Clock,
  Send,
  Edit,
  Trash2,
  Copy,
  RefreshCw,
  Link as LinkIcon,
  Download,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

export default function AssessmentDetail() {
  const { user, isProfessor } = useApp()
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()

  const [assessment, setAssessment] = useState(location.state?.assessment || null)
  const [detailTab, setDetailTab] = useState('questions')
  const [answers, setAnswers] = useState({})
  const [feedbackResults, setFeedbackResults] = useState({})
  const [feedbackMode, setFeedbackMode] = useState('ai')
  const [isGenerating, setIsGenerating] = useState(false)
  const [studentResponses, setStudentResponses] = useState([])
  const [expandedStudents, setExpandedStudents] = useState({})
  const [reevalForm, setReevalForm] = useState({})
  const [evalAnalytics, setEvalAnalytics] = useState(null)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [viewVariantId, setViewVariantId] = useState(null)
  const [variantQuestionsById, setVariantQuestionsById] = useState({})
  const [responsesVariantFilter, setResponsesVariantFilter] = useState('all')
  const [analyticsVariantFilter, setAnalyticsVariantFilter] = useState('all')

  const [timeRemaining, setTimeRemaining] = useState(null)
  const [timerExpired, setTimerExpired] = useState(false)
  const [scheduleTick, setScheduleTick] = useState(0)
  const [gateSecondsLeft, setGateSecondsLeft] = useState(null)
  const timerRef = useRef(null)
  const autoSubmitRef = useRef(false)

  const isOwner = isProfessor && assessment?.author_id === user?.id

  const loadAssessment = useCallback(async () => {
    try {
      const res = await evalApi.get(id)
      if (res.ok) {
        const data = await res.json()
        setAssessment(data)
        return data
      }
    } catch { /* ignore */ }
    return null
  }, [id])

  useEffect(() => {
    if (!assessment) loadAssessment()
  }, [assessment, loadAssessment])

  useEffect(() => {
    if (!assessment || isOwner) return
    const initExam = async () => {
      const latest = await loadAssessment() || assessment
      if (latest.schedule_access_blocked) {
        setTimeRemaining(null)
        setTimerExpired(false)
        autoSubmitRef.current = false
      } else if (latest.duration) {
        try {
          const res = await evalApi.start(latest.id)
          if (res.ok) {
            const startData = await res.json()
            const { seconds_remaining, variant_id } = startData
            setTimeRemaining(seconds_remaining <= 0 ? 0 : seconds_remaining)
            setTimerExpired(seconds_remaining <= 0)
            // Reîncarcă evaluarea pentru a obține întrebările variantei atribuite.
            if (variant_id && latest.requires_start) {
              const reloaded = await loadAssessment()
              if (reloaded) Object.assign(latest, reloaded)
            }
          }
        } catch { /* ignore */ }
        autoSubmitRef.current = false
      }
      const myRes = await evalApi.myResponses(latest.id)
      if (myRes.ok) {
        const data = await myRes.json()
        if (data?.length) {
          const byQ = data.reduce((acc, r) => {
            if (r.question_id && !acc[r.question_id]) acc[r.question_id] = r
            return acc
          }, {})
          const existingAnswers = {}
          const existingFeedback = {}
          for (const [qid, r] of Object.entries(byQ)) {
            existingAnswers[qid] = r.answer_text || ''
            existingFeedback[qid] = { response_id: r.id, score: r.score, is_correct: r.is_correct, feedback: r.feedback || [] }
          }
          setAnswers(existingAnswers)
          setFeedbackResults(existingFeedback)
          if (Object.keys(existingFeedback).length >= getEvaluationQuestionCount(latest) && getEvaluationQuestionCount(latest) > 0) {
            setTimeRemaining(null)
          }
        }
      }
    }
    initExam()
  }, [id])

  useEffect(() => {
    if (isOwner && assessment) {
      fetchStudentResponses()
    }
  }, [isOwner, assessment?.id])

  useEffect(() => {
    if (!isOwner || !assessment?.variants?.length) return
    if (viewVariantId && assessment.variants.some((v) => v.id === viewVariantId)) return
    setViewVariantId(assessment.variants[0].id)
  }, [isOwner, assessment?.id, assessment?.variants])

  useEffect(() => {
    if (!isOwner || !viewVariantId || !assessment?.id) return
    if (variantQuestionsById[viewVariantId]) return
    ;(async () => {
      try {
        const res = await evalApi.getVariant(assessment.id, viewVariantId)
        if (res.ok) {
          const data = await res.json()
          setVariantQuestionsById((p) => ({ ...p, [viewVariantId]: data.questions || [] }))
        }
      } catch { /* ignore */ }
    })()
  }, [isOwner, viewVariantId, assessment?.id, variantQuestionsById])

  // Prefetch toate variantele pentru owner (pentru tab-urile Răspunsuri și Analiză).
  useEffect(() => {
    if (!isOwner || !assessment?.variants?.length) return
    const missing = assessment.variants.filter((v) => !variantQuestionsById[v.id])
    if (!missing.length) return
    ;(async () => {
      for (const v of missing) {
        try {
          const res = await evalApi.getVariant(assessment.id, v.id)
          if (res.ok) {
            const data = await res.json()
            setVariantQuestionsById((p) => ({ ...p, [v.id]: data.questions || [] }))
          }
        } catch { /* ignore */ }
      }
    })()
  }, [isOwner, assessment?.id, assessment?.variants, variantQuestionsById])

  useEffect(() => {
    if (timeRemaining === null || timerExpired) return
    if (timeRemaining <= 0) { setTimerExpired(true); return }
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); setTimerExpired(true); if (!autoSubmitRef.current) autoSubmitRef.current = true; return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [timeRemaining, timerExpired])

  useEffect(() => {
    if (!timerExpired || !autoSubmitRef.current || !assessment) return
    autoSubmitRef.current = false
    const questions = assessment.questions || []
    const hasAny = questions.some((q) => answers[q.id]?.trim())
    if (hasAny) {
      ;(async () => {
        for (const q of questions) {
          if (feedbackResults[q.id]) continue
          if (answers[q.id]?.trim()) await handleSubmitAnswer(q.id, answers[q.id])
        }
        toast.success('Timpul a expirat! Răspunsurile au fost trimise automat.')
      })()
    } else {
      toast.error('Timpul a expirat! Nu ai completat niciun răspuns.')
    }
  }, [timerExpired])

  useEffect(() => {
    if (assessment?.seconds_until_start != null) setGateSecondsLeft(assessment.seconds_until_start)
    else setGateSecondsLeft(null)
  }, [assessment?.id, assessment?.seconds_until_start])

  useEffect(() => {
    const isScheduled = assessment?.lifecycle_status === 'scheduled' || (assessment?.schedule_access_blocked && assessment?.schedule_block_kind === 'before_start')
    if (!isScheduled) return
    const id1 = setInterval(() => setScheduleTick((x) => x + 1), 1000)
    const id2 = setInterval(() => setGateSecondsLeft((s) => (s != null && s > 0 ? s - 1 : s)), 1000)
    const id3 = setInterval(loadAssessment, 5000)
    return () => { clearInterval(id1); clearInterval(id2); clearInterval(id3) }
  }, [assessment?.id, assessment?.lifecycle_status, assessment?.schedule_access_blocked])

  const fetchStudentResponses = async () => {
    try {
      const res = await evalApi.responses(assessment.id)
      if (res.ok) setStudentResponses(await res.json())
    } catch { toast.error('Nu s-au putut încărca răspunsurile.') }
  }

  const fetchEvalAnalytics = async () => {
    try {
      const res = await evalApi.analytics(assessment.id)
      if (res.ok) setEvalAnalytics(await res.json())
    } catch { toast.error('Nu s-au putut încărca datele analitice.') }
  }

  const handleSubmitAnswer = async (questionId, answerText) => {
    if (feedbackResults[questionId] || !answerText?.trim()) return
    setIsGenerating(true)
    try {
      const res = await feedbackApi.submit({ answer: answerText, evaluation_id: assessment.id, question_id: questionId, mode: feedbackMode })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail ?? 'Eroare') }
      const data = await res.json()
      setFeedbackResults((prev) => ({ ...prev, [questionId]: data }))
    } catch (err) { toast.error(err.message) }
    finally { setIsGenerating(false) }
  }

  const handleSubmitAll = async (e) => {
    e.preventDefault()
    const questions = assessment.questions || []
    const unanswered = questions.filter((q) => !answers[q.id]?.trim())
    if (unanswered.length > 0) { toast.error(`Mai ai ${unanswered.length} întrebare${unanswered.length > 1 ? 'i' : ''} fără răspuns.`); return }
    const toSubmit = questions.filter((q) => !feedbackResults[q.id])
    if (toSubmit.length === 0) { toast.info('Ai trimis deja toate răspunsurile.'); return }
    for (const q of toSubmit) { if (answers[q.id]?.trim()) await handleSubmitAnswer(q.id, answers[q.id]) }
    clearInterval(timerRef.current)
    setTimeRemaining(null)
    toast.success('Toate răspunsurile au fost trimise!')
  }

  const handleDelete = async () => {
    if (!window.confirm('Sigur vrei să ștergi această evaluare?')) return
    try {
      const res = await evalApi.delete(assessment.id)
      if (!res.ok) throw new Error('Ștergerea a eșuat.')
      toast.success('Evaluare ștearsă!')
      navigate('/')
    } catch (err) { toast.error(err.message) }
  }

  const handleExportPdf = async () => {
    setIsExportingPdf(true)
    try {
      const res = await evalApi.exportPdf(assessment.id)
      if (!res.ok) throw new Error('Exportul PDF a eșuat.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `evaluare-${assessment.id}.pdf`; a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF descărcat.')
    } catch (err) { toast.error(err.message) }
    finally { setIsExportingPdf(false) }
  }

  const handleRegenerateCode = async () => {
    try {
      const res = await evalApi.regenerateCode(assessment.id)
      if (res.ok) { setAssessment(await res.json()); toast.success('Cod regenerat.') }
    } catch { toast.error('Eroare la regenerare.') }
  }

  const handleTogglePublicLink = async (enabled) => {
    try {
      const res = await evalApi.togglePublicLink(assessment.id, enabled)
      if (res.ok) { setAssessment(await res.json()); toast.success(enabled ? 'Link public activat.' : 'Link dezactivat.') }
    } catch { toast.error('Eroare.') }
  }

  const handleReevaluate = async (responseId) => {
    const form = reevalForm[responseId]
    if (!form?.score && !form?.feedback_message) return
    try {
      const res = await evalApi.reevaluate(responseId, { score: form.score != null ? Number(form.score) : undefined, feedback_message: form.feedback_message || undefined })
      if (!res.ok) throw new Error('Reevaluarea a eșuat.')
      toast.success('Reevaluare salvată!')
      setReevalForm((p) => ({ ...p, [responseId]: {} }))
      fetchStudentResponses()
    } catch (err) { toast.error(err.message) }
  }

  if (!assessment) return <main className="flex-1 flex items-center justify-center"><p className="text-muted-foreground">Se încarcă...</p></main>

  const scheduleBlocked = Boolean(!isOwner && (assessment.lifecycle_status ? assessment.lifecycle_status !== 'active' : assessment.schedule_access_blocked))
  const canAnswer = !isOwner && !scheduleBlocked
  const startIso = assessment.start_at || assessment.scheduled_starts_at
  const endIso = assessment.end_at || assessment.scheduled_ends_at
  const showScheduledGate = scheduleBlocked && (assessment.lifecycle_status === 'scheduled' || assessment.schedule_block_kind === 'before_start')
  const showClosedGate = scheduleBlocked && (assessment.lifecycle_status === 'closed' || assessment.schedule_block_kind === 'after_end')
  const totalQuestions = getEvaluationQuestionCount(assessment)
  const submittedCount = Object.keys(feedbackResults).length
  const allSubmitted = totalQuestions > 0 && submittedCount >= totalQuestions
  const gateLabel = gateSecondsLeft != null ? formatSecondsCountdown(gateSecondsLeft) : formatCountdownToStart(startIso)
  const statusBadge = unifiedEvalStatusBadge(assessment)

  const filteredResponses =
    responsesVariantFilter === 'all'
      ? studentResponses
      : studentResponses.filter((r) => String(r.variant_id) === responsesVariantFilter)

  const groupedByStudent = filteredResponses.reduce((acc, r) => {
    const key = r.user_id != null ? `u-${r.user_id}` : `g-${(r.guest_name || '').trim()}|${(r.guest_class || '').trim()}`
    if (!acc[key]) acc[key] = { name: r.user_name || r.guest_name || 'Participant', responses: [] }
    acc[key].responses.push(r)
    return acc
  }, {})

  const questionsMap = {}
  for (const q of assessment.questions || []) questionsMap[q.id] = q
  for (const qs of Object.values(variantQuestionsById)) {
    for (const q of qs || []) questionsMap[q.id] = q
  }
  const variantNameById = (assessment.variants || []).reduce((m, v) => { m[v.id] = v.name; return m }, {})

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl border-x border-border min-h-screen">
          <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-4 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-xl font-bold">{assessment.title}</h1>
                  <Badge variant={statusBadge.variant === 'success' ? 'default' : statusBadge.variant === 'destructive' ? 'destructive' : 'secondary'} className="flex-shrink-0">
                    {statusBadge.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{assessment.subject || 'Evaluare generală'}</p>
              </div>
              {isOwner && (
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/assessment/${assessment.id}/edit`, { state: { assessment } })}>
                    <Edit className="mr-1 h-3.5 w-3.5" /> Editează
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDelete}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Șterge
                  </Button>
                </div>
              )}
            </div>

            {isOwner && (
              <div className="mt-3 flex gap-1 border-t border-border pt-3">
                {[
                  { key: 'questions', label: 'Exerciții', icon: FileText },
                  { key: 'responses', label: `Răspunsuri (${studentResponses.length})`, icon: Users },
                  { key: 'analytics', label: 'Analiză', icon: BarChart3 },
                ].map((tab) => (
                  <Button key={tab.key} variant={detailTab === tab.key ? 'default' : 'ghost'} size="sm" className="gap-1.5" onClick={() => { setDetailTab(tab.key); if (tab.key === 'responses') fetchStudentResponses(); if (tab.key === 'analytics') fetchEvalAnalytics() }}>
                    <tab.icon className="h-4 w-4" /> {tab.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="p-4">
            {detailTab === 'questions' && (
              <>
                {showScheduledGate && (
                  <Card className="mb-4 border-yellow-500/30 bg-yellow-500/5">
                    <CardContent className="p-6 text-center">
                      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-yellow-500" />
                      <h2 className="text-lg font-semibold">Evaluarea este programată</h2>
                      <p className="mt-2 text-3xl font-bold tabular-nums" key={scheduleTick}>{gateLabel}</p>
                      <p className="mt-2 text-sm text-muted-foreground">Pagina se actualizează automat.</p>
                    </CardContent>
                  </Card>
                )}

                {showClosedGate && (
                  <Card className="mb-4 border-destructive/30 bg-destructive/5">
                    <CardContent className="p-6 text-center">
                      <XCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
                      <h2 className="text-lg font-semibold">Fereastra s-a încheiat</h2>
                      <p className="mt-2 text-sm text-muted-foreground">{assessment.schedule_block_message}</p>
                    </CardContent>
                  </Card>
                )}

                {timerExpired && canAnswer && Object.keys(feedbackResults).length === 0 && (
                  <Card className="mb-4 border-destructive/30 bg-destructive/5">
                    <CardContent className="p-4 text-center text-destructive font-medium">
                      Timpul a expirat. Nu mai poți trimite răspunsuri.
                    </CardContent>
                  </Card>
                )}

                {allSubmitted && canAnswer && (
                  <Card className="mb-4 border-blue-500/30 bg-blue-500/5">
                    <CardContent className="p-4 text-sm text-blue-400">
                      Ai trimis toate răspunsurile. Mai jos poți vedea feedback-ul.
                    </CardContent>
                  </Card>
                )}

                {canAnswer && !scheduleBlocked ? (
                  <form onSubmit={handleSubmitAll} className="space-y-4">
                    {(assessment.questions || []).map((q, idx) => {
                      const isDisabled = timerExpired || !!feedbackResults[q.id]
                      const fb = feedbackResults[q.id]
                      return (
                        <Card key={q.id}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-primary">Exercițiul {idx + 1}</span>
                              <Badge variant="secondary">{q.points} puncte</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <p className="leading-relaxed">{q.text}</p>
                            {q.question_type === 'multiple_choice' && q.options?.map((opt, oi) => (
                              <label key={oi} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${answers[q.id] === opt ? 'border-primary bg-primary/5' : 'hover:bg-accent'} ${isDisabled ? 'pointer-events-none opacity-60' : ''}`}>
                                <input type="radio" name={`q-${q.id}`} value={opt} checked={answers[q.id] === opt} disabled={isDisabled} onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt }))} className="accent-primary" />
                                <span className="text-sm">{opt}</span>
                              </label>
                            ))}
                            {q.question_type === 'checkboxes' && q.options?.map((opt, oi) => {
                              const selected = (answers[q.id] || '').split('||')
                              const isChecked = selected.includes(opt)
                              return (
                                <label key={oi} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${isChecked ? 'border-primary bg-primary/5' : 'hover:bg-accent'} ${isDisabled ? 'pointer-events-none opacity-60' : ''}`}>
                                  <input type="checkbox" checked={isChecked} disabled={isDisabled} onChange={() => { const next = isChecked ? selected.filter((s) => s !== opt) : [...selected.filter(Boolean), opt]; setAnswers((p) => ({ ...p, [q.id]: next.join('||') })) }} className="accent-primary" />
                                  <span className="text-sm">{opt}</span>
                                </label>
                              )
                            })}
                            {q.question_type === 'short_answer' && (
                              <Input placeholder="Răspunsul tău..." value={answers[q.id] || ''} disabled={isDisabled} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} />
                            )}
                            {(q.question_type === 'long_answer' || !q.question_type) && (
                              <Textarea placeholder="Scrie răspunsul tău..." rows={4} value={answers[q.id] || ''} disabled={isDisabled} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} />
                            )}
                            {!answers[q.id]?.trim() && !fb && !timerExpired && (
                              <p className="text-xs italic text-yellow-500">* Răspuns obligatoriu</p>
                            )}
                            {fb && (
                              <div className={`mt-3 rounded-lg border-l-4 p-4 ${fb.is_correct ? 'border-l-green-500 bg-green-500/5' : fb.score > 0 ? 'border-l-yellow-500 bg-yellow-500/5' : 'border-l-red-500 bg-red-500/5'}`}>
                                {fb.score != null && (
                                  <Badge variant={fb.is_correct ? 'default' : fb.score > 0 ? 'outline' : 'destructive'} className="mb-2">
                                    {fb.is_correct ? '✓' : fb.score > 0 ? '~' : '✗'} {fb.score}/{q.points} puncte
                                  </Badge>
                                )}
                                <div className="space-y-2">
                                  {fb.feedback?.map((item, fi) => (
                                    <div key={fi} className="text-sm">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                                        <Badge variant={feedbackSourceVariant(item.source)} className="text-xs">{feedbackSourceLabel(item.source)}</Badge>
                                      </div>
                                      <p className="text-muted-foreground">{item.message}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                    {!timerExpired && !allSubmitted && (
                      <div className="flex items-center gap-3">
                        <select value={feedbackMode} onChange={(e) => setFeedbackMode(e.target.value)}><option value="ai">AI (Groq)</option><option value="rule_based">Reguli simple</option></select>
                        <Button type="submit" disabled={isGenerating || timerExpired} className="flex-1 gap-2">
                          <Send className="h-4 w-4" />
                          {isGenerating ? 'Se generează...' : 'Trimite toate răspunsurile'}
                        </Button>
                      </div>
                    )}
                  </form>
                ) : !isOwner && !scheduleBlocked ? null : isOwner ? (
                  <div className="space-y-4">
                    {(assessment.variants || []).length === 0 ? (
                      <Card>
                        <CardContent className="p-8 text-center space-y-3 text-muted-foreground">
                          <p>Nicio variantă configurată.</p>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/assessment/${assessment.id}/edit`, { state: { assessment } })}>
                            Editează evaluarea pentru a adăuga variante
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        {(assessment.variants || []).length > 1 && (
                          <div className="flex flex-wrap gap-2">
                            {(assessment.variants || []).map((v) => (
                              <Button
                                key={v.id}
                                type="button"
                                variant={viewVariantId === v.id ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewVariantId(v.id)}
                              >
                                {v.name} ({v.question_count})
                              </Button>
                            ))}
                          </div>
                        )}
                        {(() => {
                          if (!viewVariantId) return null
                          if (!(viewVariantId in variantQuestionsById)) {
                            return (
                              <Card><CardContent className="p-6 text-center text-muted-foreground">Se încarcă...</CardContent></Card>
                            )
                          }
                          const qs = variantQuestionsById[viewVariantId] || []
                          if (qs.length === 0) {
                            return (
                              <Card><CardContent className="p-6 text-center text-muted-foreground">Nicio întrebare în această variantă.</CardContent></Card>
                            )
                          }
                          return qs.map((q, idx) => (
                            <Card key={q.id}>
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-primary">Exercițiul {idx + 1}</span>
                                  <Badge variant="secondary">{q.points} puncte</Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <p>{q.text}</p>
                                {q.options && (
                                  <div className="space-y-1 text-sm text-muted-foreground">
                                    {q.options.map((opt, oi) => <div key={oi}>{q.question_type === 'multiple_choice' ? '○' : '☐'} {opt}</div>)}
                                  </div>
                                )}
                                {q.correct_answer && (
                                  <div className="mt-2 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-500">Răspuns corect: <strong>{q.correct_answer}</strong></div>
                                )}
                              </CardContent>
                            </Card>
                          ))
                        })()}
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}

            {detailTab === 'responses' && isOwner && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  {(assessment.variants || []).length > 1 ? (
                    <select
                      value={responsesVariantFilter}
                      onChange={(e) => setResponsesVariantFilter(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="all">Toate variantele</option>
                      {(assessment.variants || []).map((v) => (
                        <option key={v.id} value={String(v.id)}>{v.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span />
                  )}
                  <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExportingPdf}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {isExportingPdf ? 'Se generează...' : 'Exportă PDF'}
                  </Button>
                </div>
                {Object.keys(groupedByStudent).length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><Users className="mx-auto mb-3 h-12 w-12 opacity-50" /><p>Niciun student nu a răspuns încă.</p></CardContent></Card>
                ) : Object.entries(groupedByStudent).map(([key, { name, responses }]) => {
                  const isExpanded = !!expandedStudents[key]
                  const totalScore = responses.reduce((s, r) => s + (r.score ?? 0), 0)
                  const maxScore = responses.reduce((s, r) => s + (questionsMap[r.question_id]?.points ?? 0), 0)
                  const variantIds = Array.from(new Set(responses.map((r) => r.variant_id).filter(Boolean)))
                  const variantsLabel = variantIds.map((vid) => variantNameById[vid]).filter(Boolean).join(', ')
                  return (
                    <Card key={key}>
                      <div className="flex cursor-pointer items-center gap-3 p-4" onClick={() => setExpandedStudents((p) => ({ ...p, [key]: !p[key] }))}>
                        <Users className="h-5 w-5 text-primary" />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold">{name}</h3>
                          {variantsLabel && <p className="text-xs text-muted-foreground">{variantsLabel}</p>}
                        </div>
                        <Badge variant="secondary">{responses.length} răspunsuri</Badge>
                        {maxScore > 0 && <Badge variant="outline">{totalScore}/{maxScore} pct</Badge>}
                        <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                      {isExpanded && (
                        <div className="divide-y border-t">
                          {responses.map((r) => {
                            const q = questionsMap[r.question_id]
                            const variantQs = r.variant_id ? variantQuestionsById[r.variant_id] || [] : []
                            const exIdx = q ? variantQs.findIndex((x) => x.id === q.id) : -1
                            const variantLabel = r.variant_id ? variantNameById[r.variant_id] : null
                            return (
                              <div key={r.id} className="p-4 space-y-2">
                                <div className="flex items-baseline gap-2 text-sm">
                                  <span className="font-semibold text-primary uppercase text-xs">{exIdx >= 0 ? `Ex. ${exIdx + 1}` : '#?'}</span>
                                  <span className="text-muted-foreground">{q?.text || 'Necunoscută'}</span>
                                  {variantLabel && <Badge variant="outline" className="ml-auto text-[10px]">{variantLabel}</Badge>}
                                </div>
                                <div className="rounded-md bg-primary/5 border border-primary/10 p-2 text-sm">{r.answer_text}</div>
                                {r.score != null && <p className="text-sm">Scor: <strong className="text-primary">{r.score}/{q?.points || '?'}</strong></p>}
                                {r.feedback?.length > 0 && (
                                  <div className="space-y-1">
                                    {r.feedback.map((fb, fi) => (
                                      <div key={fi} className="text-sm">
                                        <Badge variant="secondary" className="mr-1 text-xs">{fb.category}</Badge>
                                        <Badge variant={feedbackSourceVariant(fb.source)} className="mr-2 text-xs">{feedbackSourceLabel(fb.source)}</Badge>
                                        <span className="text-muted-foreground">{fb.message}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex gap-2 items-end pt-2 border-t border-dashed">
                                  <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Scor</label>
                                    <Input type="number" min="0" max={q?.points || 100} className="w-20 h-8 text-sm" placeholder={r.score != null ? String(r.score) : '—'} value={reevalForm[r.id]?.score ?? ''} onChange={(e) => setReevalForm((p) => ({ ...p, [r.id]: { ...p[r.id], score: e.target.value } }))} />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <label className="text-xs text-muted-foreground">Feedback profesor</label>
                                    <Input className="h-8 text-sm" placeholder="Adaugă feedback..." value={reevalForm[r.id]?.feedback_message ?? ''} onChange={(e) => setReevalForm((p) => ({ ...p, [r.id]: { ...p[r.id], feedback_message: e.target.value } }))} />
                                  </div>
                                  <Button size="sm" variant="outline" onClick={() => handleReevaluate(r.id)}>Reevaluează</Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}

            {detailTab === 'analytics' && isOwner && (() => {
              const activeAnalytics = (() => {
                if (!evalAnalytics) return null
                if (analyticsVariantFilter === 'all') return evalAnalytics
                const match = (evalAnalytics.per_variant || []).find((pv) => String(pv.variant_id) === analyticsVariantFilter)
                return match ? { ...match, per_variant: [] } : evalAnalytics
              })()
              return (
              <div className="space-y-4">
                {(assessment.variants || []).length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Vizualizare:</span>
                    <select
                      value={analyticsVariantFilter}
                      onChange={(e) => setAnalyticsVariantFilter(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="all">Toate variantele</option>
                      {(assessment.variants || []).map((v) => (
                        <option key={v.id} value={String(v.id)}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!activeAnalytics ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground">Se încarcă...</CardContent></Card>
                ) : activeAnalytics.summary.total_participants === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><BarChart3 className="mx-auto mb-3 h-12 w-12 opacity-50" /><p>Niciun student nu a răspuns.</p></CardContent></Card>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { v: activeAnalytics.summary.total_participants, l: 'Participanți' },
                        { v: `${activeAnalytics.summary.avg_score_percent}%`, l: 'Media clasei' },
                        { v: `${activeAnalytics.summary.max_score_percent}%`, l: 'Max scor' },
                        { v: `${activeAnalytics.summary.min_score_percent}%`, l: 'Min scor' },
                      ].map((s, i) => (
                        <Card key={i}><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{s.v}</p><p className="text-xs text-muted-foreground">{s.l}</p></CardContent></Card>
                      ))}
                    </div>
                    <Card>
                      <CardHeader><CardTitle className="text-base">Distribuția Scorurilor</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={activeAnalytics.score_distribution}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="range" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip {...chartTooltipStyle} /><Bar dataKey="count" name="Studenți" radius={[6,6,0,0]}>{activeAnalytics.score_distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar></BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                    {activeAnalytics.question_success.length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-base">Rata de Succes per Întrebare</CardTitle></CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={Math.max(250, activeAnalytics.question_success.length * 50)}>
                            <BarChart data={activeAnalytics.question_success} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis type="number" domain={[0, 100]} unit="%" fontSize={12} /><YAxis type="category" dataKey="question_text" fontSize={11} width={180} /><Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} /><Bar dataKey="avg_percent" name="Media %" radius={[0,6,6,0]}>{activeAnalytics.question_success.map((e, i) => <Cell key={i} fill={e.avg_percent >= 70 ? '#22c55e' : e.avg_percent >= 40 ? '#f59e0b' : '#ef4444'} />)}</Bar></BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                    {activeAnalytics.student_scores.length > 0 && (
                      <Card>
                        <CardHeader><CardTitle className="text-base">Clasament Studenți</CardTitle></CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={Math.max(250, activeAnalytics.student_scores.length * 45)}>
                            <BarChart data={activeAnalytics.student_scores} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis type="number" domain={[0, 100]} unit="%" fontSize={12} /><YAxis type="category" dataKey="name" fontSize={11} width={150} /><Tooltip {...chartTooltipStyle} formatter={(v, _n, p) => [`${p.payload.total_score}/${p.payload.max_points} (${v}%)`, 'Scor']} /><Bar dataKey="percent" name="Scor %" radius={[0,6,6,0]}>{activeAnalytics.student_scores.map((e, i) => <Cell key={i} fill={e.percent >= 70 ? '#22c55e' : e.percent >= 40 ? '#f59e0b' : '#ef4444'} />)}</Bar></BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
              )
            })()}
          </div>
        </div>
      </main>

      <RightSidebar>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Informații</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {assessment.description && <p className="text-muted-foreground">{assessment.description}</p>}
            <Separator />
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Durată</span><strong>{assessment.duration} min</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Exerciții</span><strong>{totalQuestions}</strong></div>
            {canAnswer && <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1.5"><Send className="h-3.5 w-3.5" />Trimise</span><strong>{submittedCount}/{totalQuestions}</strong></div>}
            {(startIso || endIso) && (
              <>
                <Separator />
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Perioadă acces</span>
                  <p className="font-medium text-xs">{startIso ? new Date(startIso).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : '—'} → {endIso ? new Date(endIso).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {canAnswer && timeRemaining !== null && (
          <Card>
            <CardContent className="p-4">
              <AnimeTimer timeRemaining={timeRemaining} totalDuration={assessment.duration * 60} timerExpired={timerExpired} />
            </CardContent>
          </Card>
        )}

        {isOwner && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Acces studenți</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Distribuie codul sau link-ul public.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-primary/10 px-2 py-1 font-mono text-sm tracking-wider">{assessment.access_code || '—'}</code>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(assessment.access_code); toast.success('Cod copiat.') }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleRegenerateCode}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Separator />
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={Boolean(assessment.public_link_id)} onChange={(e) => handleTogglePublicLink(e.target.checked)} className="accent-primary" />
                Link public (fără cont)
              </label>
              {assessment.public_link_id && (
                <div className="space-y-2">
                  <code className="block break-all rounded bg-primary/10 px-2 py-1 text-xs">{`${window.location.origin}/public/${assessment.public_link_id}`}</code>
                  <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/public/${assessment.public_link_id}`); toast.success('Link copiat.') }}>
                    <LinkIcon className="h-3.5 w-3.5" /> Copiază link
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </RightSidebar>
    </>
  )
}
