import { useEffect, useState } from 'react'
import { QUESTION_TYPES } from '@/lib/helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react'

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const normalizeQuestions = (questions) =>
  (questions || []).map((q) => ({
    ...q,
    _key: q._key || q.id || newKey(),
    options: q.options || null,
    correct_answer: q.correct_answer || '',
  }))

export default function VariantEditor({ initialVariant, onSave, onCancel, saveLabel = 'Salvează varianta' }) {
  const [name, setName] = useState(initialVariant?.name || 'Varianta nouă')
  const [questions, setQuestions] = useState(() => normalizeQuestions(initialVariant?.questions))

  useEffect(() => {
    setName(initialVariant?.name || 'Varianta nouă')
    setQuestions(normalizeQuestions(initialVariant?.questions))
  }, [initialVariant])

  const addQuestion = () =>
    setQuestions((p) => [
      ...p,
      { _key: newKey(), question_type: 'long_answer', text: '', options: null, correct_answer: '', points: 10 },
    ])
  const removeQuestion = (idx) => setQuestions((p) => p.filter((_, i) => i !== idx))
  const moveQuestion = (idx, dir) =>
    setQuestions((p) => {
      const q = [...p]
      const t = idx + dir
      if (t < 0 || t >= q.length) return p
      ;[q[idx], q[t]] = [q[t], q[idx]]
      return q
    })
  const updateQuestion = (idx, field, value) =>
    setQuestions((p) => {
      const q = [...p]
      q[idx] = { ...q[idx], [field]: value }
      if (field === 'question_type') {
        if (value === 'multiple_choice' || value === 'checkboxes') {
          if (!q[idx].options?.length) q[idx].options = ['', '', '', '']
        } else {
          q[idx].options = null
        }
        q[idx].correct_answer = ''
      }
      return q
    })
  const updateOption = (qi, oi, val) =>
    setQuestions((p) => {
      const q = [...p]
      const item = { ...q[qi] }
      const old = (item.options || [])[oi]
      const opts = [...(item.options || [])]
      opts[oi] = val
      item.options = opts
      if (item.question_type === 'multiple_choice' && item.correct_answer === old) item.correct_answer = val
      else if (item.question_type === 'checkboxes' && item.correct_answer) {
        const parts = item.correct_answer.split('||').map((s) => s.trim())
        const fi = parts.indexOf(old)
        if (fi !== -1) {
          parts[fi] = val
          item.correct_answer = parts.join('||')
        }
      }
      q[qi] = item
      return q
    })
  const addOption = (qi) =>
    setQuestions((p) => {
      const q = [...p]
      q[qi] = { ...q[qi], options: [...(q[qi].options || []), ''] }
      return q
    })
  const removeOption = (qi, oi) =>
    setQuestions((p) => {
      const q = [...p]
      const item = { ...q[qi] }
      const removed = (item.options || [])[oi]
      item.options = (item.options || []).filter((_, i) => i !== oi)
      if (item.question_type === 'multiple_choice' && item.correct_answer === removed) item.correct_answer = ''
      else if (item.question_type === 'checkboxes' && item.correct_answer) {
        item.correct_answer = item.correct_answer
          .split('||')
          .map((s) => s.trim())
          .filter((s) => s !== removed)
          .join('||')
      }
      q[qi] = item
      return q
    })

  const handleSave = () => {
    const payload = {
      name: name.trim() || 'Varianta',
      questions: questions.map(({ _key, ...rest }, idx) => ({ ...rest, order: idx })),
    }
    onSave?.(payload)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 overflow-y-auto px-1 pb-2">
        <div className="space-y-2">
          <Label>Nume variantă</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Varianta A" />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Exerciții ({questions.length})</span>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adaugă
          </Button>
        </div>

        {questions.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">Niciun exercițiu adăugat.</p>
        )}

        {questions.map((q, idx) => (
          <div key={q._key} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-primary">Exercițiul {idx + 1}</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === 0}
                  onClick={() => moveQuestion(idx, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === questions.length - 1}
                  onClick={() => moveQuestion(idx, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeQuestion(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tip</Label>
                <select
                  value={q.question_type}
                  onChange={(e) => updateQuestion(idx, 'question_type', e.target.value)}
                  className="h-8 w-full"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Puncte</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  className="h-8"
                  value={q.points}
                  onChange={(e) => updateQuestion(idx, 'points', Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Întrebare *</Label>
              <Textarea
                value={q.text}
                onChange={(e) => updateQuestion(idx, 'text', e.target.value)}
                placeholder="Enunțul exercițiului..."
                rows={2}
                required
              />
            </div>
            {(q.question_type === 'multiple_choice' || q.question_type === 'checkboxes') && (
              <div className="space-y-2">
                <span className="text-xs font-medium">Opțiuni</span>
                <p className="text-xs italic text-muted-foreground">Selectează răspunsul corect</p>
                {(q.options || []).map((opt, oi) => (
                  <div
                    key={oi}
                    className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                      q.question_type === 'multiple_choice'
                        ? q.correct_answer === opt && opt
                          ? 'bg-green-500/10'
                          : ''
                        : (q.correct_answer || '')
                              .split('||')
                              .map((s) => s.trim())
                              .includes(opt) && opt
                          ? 'bg-green-500/10'
                          : ''
                    }`}
                  >
                    {q.question_type === 'multiple_choice' ? (
                      <input
                        type="radio"
                        name={`correct-${q._key}`}
                        checked={q.correct_answer === opt && opt !== ''}
                        onChange={() => updateQuestion(idx, 'correct_answer', opt)}
                        className="accent-green-500"
                        disabled={!opt}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={
                          (q.correct_answer || '')
                            .split('||')
                            .map((s) => s.trim())
                            .includes(opt) && opt !== ''
                        }
                        onChange={() => {
                          const parts = (q.correct_answer || '')
                            .split('||')
                            .map((s) => s.trim())
                            .filter(Boolean)
                          const fi = parts.indexOf(opt)
                          if (fi !== -1) parts.splice(fi, 1)
                          else parts.push(opt)
                          updateQuestion(idx, 'correct_answer', parts.join('||'))
                        }}
                        className="accent-green-500"
                        disabled={!opt}
                      />
                    )}
                    <Input
                      className="h-8 flex-1 text-sm"
                      value={opt}
                      onChange={(e) => updateOption(idx, oi, e.target.value)}
                      placeholder={`Opțiunea ${oi + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeOption(idx, oi)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="text-primary"
                  onClick={() => addOption(idx)}
                >
                  + Adaugă opțiune
                </Button>
              </div>
            )}
            {q.question_type !== 'multiple_choice' && q.question_type !== 'checkboxes' && (
              <div className="space-y-1">
                <Label className="text-xs">Răspuns corect (opțional)</Label>
                <Input
                  className="h-8 text-sm"
                  value={q.correct_answer}
                  onChange={(e) => updateQuestion(idx, 'correct_answer', e.target.value)}
                  placeholder="Pentru corectare automată"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end gap-2 border-t bg-background pt-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Anulează
          </Button>
        )}
        <Button type="button" onClick={handleSave}>
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}
