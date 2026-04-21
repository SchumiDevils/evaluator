import { useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { evaluations as evalApi } from '@/lib/api'
import {
  localDatetimeInputToIso,
  isoToDatetimeLocalValue,
  accessWindowShorterThanDurationWarning,
  formatMinutesRo,
  QUESTION_TYPES,
} from '@/lib/helpers'
import RightSidebar from '@/components/layout/RightSidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export default function AssessmentForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: editId } = useParams()
  const editing = location.state?.assessment || null
  const isEditing = Boolean(editId && editing)

  const [form, setForm] = useState(() => {
    if (isEditing) {
      return {
        title: editing.title, subject: editing.subject || '', description: editing.description || '',
        duration: editing.duration, status: editing.status,
        scheduled_starts_at: isoToDatetimeLocalValue(editing.start_at || editing.scheduled_starts_at),
        scheduled_ends_at: isoToDatetimeLocalValue(editing.end_at || editing.scheduled_ends_at),
        questions: (editing.questions || []).map((q) => ({ ...q, _key: q.id || Date.now() + Math.random(), options: q.options || null, correct_answer: q.correct_answer || '' })),
      }
    }
    return { title: '', subject: '', description: '', duration: 30, status: 'draft', scheduled_starts_at: '', scheduled_ends_at: '', questions: [] }
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addQuestion = () => setForm((p) => ({ ...p, questions: [...p.questions, { _key: Date.now() + Math.random(), question_type: 'long_answer', text: '', options: null, correct_answer: '', points: 10 }] }))
  const removeQuestion = (idx) => setForm((p) => ({ ...p, questions: p.questions.filter((_, i) => i !== idx) }))
  const moveQuestion = (idx, dir) => {
    setForm((p) => {
      const q = [...p.questions]; const t = idx + dir
      if (t < 0 || t >= q.length) return p
      ;[q[idx], q[t]] = [q[t], q[idx]]
      return { ...p, questions: q }
    })
  }
  const updateQuestion = (idx, field, value) => {
    setForm((p) => {
      const q = [...p.questions]; q[idx] = { ...q[idx], [field]: value }
      if (field === 'question_type') {
        if (value === 'multiple_choice' || value === 'checkboxes') { if (!q[idx].options?.length) q[idx].options = ['', '', '', ''] }
        else q[idx].options = null
        q[idx].correct_answer = ''
      }
      return { ...p, questions: q }
    })
  }
  const updateOption = (qi, oi, val) => {
    setForm((p) => {
      const q = [...p.questions]; const item = { ...q[qi] }; const old = (item.options || [])[oi]
      const opts = [...(item.options || [])]; opts[oi] = val; item.options = opts
      if (item.question_type === 'multiple_choice' && item.correct_answer === old) item.correct_answer = val
      else if (item.question_type === 'checkboxes' && item.correct_answer) {
        const parts = item.correct_answer.split('||').map(s => s.trim()); const fi = parts.indexOf(old)
        if (fi !== -1) { parts[fi] = val; item.correct_answer = parts.join('||') }
      }
      q[qi] = item; return { ...p, questions: q }
    })
  }
  const addOption = (qi) => setForm((p) => { const q = [...p.questions]; q[qi] = { ...q[qi], options: [...(q[qi].options || []), ''] }; return { ...p, questions: q } })
  const removeOption = (qi, oi) => {
    setForm((p) => {
      const q = [...p.questions]; const item = { ...q[qi] }; const removed = (item.options || [])[oi]
      item.options = (item.options || []).filter((_, i) => i !== oi)
      if (item.question_type === 'multiple_choice' && item.correct_answer === removed) item.correct_answer = ''
      else if (item.question_type === 'checkboxes' && item.correct_answer) item.correct_answer = item.correct_answer.split('||').map(s => s.trim()).filter(s => s !== removed).join('||')
      q[qi] = item; return { ...p, questions: q }
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Titlul este obligatoriu.'); return }
    setIsSubmitting(true)
    try {
      const payload = {
        title: form.title, subject: form.subject, description: form.description, duration: form.duration, status: form.status,
        start_at: localDatetimeInputToIso(form.scheduled_starts_at), end_at: localDatetimeInputToIso(form.scheduled_ends_at),
        questions: form.questions.map(({ _key, ...rest }, idx) => ({ ...rest, order: idx })),
      }
      const res = isEditing ? await evalApi.update(editId, payload) : await evalApi.create(payload)
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail ?? 'Eroare.') }
      toast.success(isEditing ? 'Evaluare actualizată!' : 'Evaluare creată!')
      navigate('/')
    } catch (err) { toast.error(err.message) }
    finally { setIsSubmitting(false) }
  }

  const durationWarning = accessWindowShorterThanDurationWarning(form.duration, form.scheduled_starts_at, form.scheduled_ends_at)

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl border-x border-border min-h-screen">
          <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button>
            <h1 className="text-xl font-bold">{isEditing ? 'Editează evaluarea' : 'Evaluare nouă'}</h1>
          </div>
          <form onSubmit={handleSave} className="p-4 space-y-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2"><Label>Titlu *</Label><Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} placeholder="ex: Quiz Biologie" required /></div>
                <div className="space-y-2"><Label>Materie</Label><Input value={form.subject} onChange={(e) => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="ex: Biologie" /></div>
                <div className="space-y-2"><Label>Descriere</Label><Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descriere..." rows={3} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Durată (min)</Label><Input type="number" min="5" max="180" value={form.duration} onChange={(e) => setForm(p => ({ ...p, duration: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Status</Label><select value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))} className="h-9 w-full"><option value="draft">Draft</option><option value="active">Activ</option><option value="closed">Închis</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Început acces</Label><Input type="datetime-local" value={form.scheduled_starts_at} onChange={(e) => setForm(p => ({ ...p, scheduled_starts_at: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Sfârșit acces</Label><Input type="datetime-local" value={form.scheduled_ends_at} onChange={(e) => setForm(p => ({ ...p, scheduled_ends_at: e.target.value }))} /></div>
                </div>
                {durationWarning && (
                  <div className="flex items-start gap-2 rounded-md border-l-4 border-l-yellow-500 bg-yellow-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500 flex-shrink-0" />
                    <p>Intervalul ({formatMinutesRo(durationWarning.windowMinutes)}) este mai mic decât durata ({formatMinutesRo(durationWarning.durationMinutes)}).</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Exerciții ({form.questions.length})</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addQuestion}><Plus className="mr-1 h-3.5 w-3.5" /> Adaugă</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {form.questions.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Niciun exercițiu adăugat.</p>}
                {form.questions.map((q, idx) => (
                  <div key={q._key || q.id || idx} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary">Exercițiul {idx + 1}</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveQuestion(idx, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={idx === form.questions.length - 1} onClick={() => moveQuestion(idx, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeQuestion(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Tip</Label><select value={q.question_type} onChange={(e) => updateQuestion(idx, 'question_type', e.target.value)} className="h-8 w-full">{QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
                      <div className="space-y-1"><Label className="text-xs">Puncte</Label><Input type="number" min="1" max="100" className="h-8" value={q.points} onChange={(e) => updateQuestion(idx, 'points', Number(e.target.value))} /></div>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Întrebare *</Label><Textarea value={q.text} onChange={(e) => updateQuestion(idx, 'text', e.target.value)} placeholder="Enunțul exercițiului..." rows={2} required /></div>
                    {(q.question_type === 'multiple_choice' || q.question_type === 'checkboxes') && (
                      <div className="space-y-2">
                        <span className="text-xs font-medium">Opțiuni</span>
                        <p className="text-xs text-muted-foreground italic">Selectează răspunsul corect</p>
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} className={`flex items-center gap-2 rounded-md px-2 py-1 ${q.question_type === 'multiple_choice' ? (q.correct_answer === opt && opt ? 'bg-green-500/10' : '') : ((q.correct_answer || '').split('||').map(s => s.trim()).includes(opt) && opt ? 'bg-green-500/10' : '')}`}>
                            {q.question_type === 'multiple_choice' ? (
                              <input type="radio" name={`correct-${q._key || idx}`} checked={q.correct_answer === opt && opt !== ''} onChange={() => updateQuestion(idx, 'correct_answer', opt)} className="accent-green-500" disabled={!opt} />
                            ) : (
                              <input type="checkbox" checked={(q.correct_answer || '').split('||').map(s => s.trim()).includes(opt) && opt !== ''} onChange={() => { const parts = (q.correct_answer || '').split('||').map(s => s.trim()).filter(Boolean); const fi = parts.indexOf(opt); if (fi !== -1) parts.splice(fi, 1); else parts.push(opt); updateQuestion(idx, 'correct_answer', parts.join('||')) }} className="accent-green-500" disabled={!opt} />
                            )}
                            <Input className="h-8 flex-1 text-sm" value={opt} onChange={(e) => updateOption(idx, oi, e.target.value)} placeholder={`Opțiunea ${oi + 1}`} />
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeOption(idx, oi)}>×</Button>
                          </div>
                        ))}
                        <Button type="button" variant="link" size="sm" className="text-primary" onClick={() => addOption(idx)}>+ Adaugă opțiune</Button>
                      </div>
                    )}
                    {q.question_type !== 'multiple_choice' && q.question_type !== 'checkboxes' && (
                      <div className="space-y-1"><Label className="text-xs">Răspuns corect (opțional)</Label><Input className="h-8 text-sm" value={q.correct_answer} onChange={(e) => updateQuestion(idx, 'correct_answer', e.target.value)} placeholder="Pentru corectare automată" /></div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-3 justify-end pb-8">
              <Button type="button" variant="outline" onClick={() => navigate('/')}>Anulează</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Se salvează...' : isEditing ? 'Salvează modificările' : 'Creează evaluarea'}</Button>
            </div>
          </form>
        </div>
      </main>
      <RightSidebar>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Sfaturi</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>Completează câmpurile de început/sfârșit acces pentru a restricționa accesul la evaluare.</p>
            <p>Durata indică cât timp are fiecare student după ce începe.</p>
            <p>Selectează răspunsurile corecte din opțiuni pentru corectare automată.</p>
          </CardContent>
        </Card>
      </RightSidebar>
    </>
  )
}
