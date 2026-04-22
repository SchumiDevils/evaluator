import { useEffect, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { evaluations as evalApi } from '@/lib/api'
import {
  localDatetimeInputToIso,
  isoToDatetimeLocalValue,
  accessWindowShorterThanDurationWarning,
  formatMinutesRo,
} from '@/lib/helpers'
import RightSidebar from '@/components/layout/RightSidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, Plus, Trash2, AlertTriangle, FileText, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import VariantEditor from './VariantEditor'

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

export default function AssessmentForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id: editId } = useParams()
  const editing = location.state?.assessment || null
  const isEditing = Boolean(editId && editing)

  const [form, setForm] = useState(() => {
    if (isEditing) {
      return {
        title: editing.title,
        subject: editing.subject || '',
        description: editing.description || '',
        duration: editing.duration,
        status: editing.status,
        scheduled_starts_at: isoToDatetimeLocalValue(editing.start_at || editing.scheduled_starts_at),
        scheduled_ends_at: isoToDatetimeLocalValue(editing.end_at || editing.scheduled_ends_at),
      }
    }
    return {
      title: '',
      subject: '',
      description: '',
      duration: 30,
      status: 'draft',
      scheduled_starts_at: '',
      scheduled_ends_at: '',
    }
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Variante persistate (din backend, dacă isEditing) sau locale (draft la create).
  const [variants, setVariants] = useState(() => {
    if (isEditing && editing?.variants?.length) {
      return editing.variants.map((v) => ({
        id: v.id,
        _key: v.id,
        order: v.order,
        name: v.name,
        question_count: v.question_count,
      }))
    }
    return []
  })

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorVariant, setEditorVariant] = useState(null) // { _key, id?, name, questions, __localIndex? }

  useEffect(() => {
    if (!isEditing) return
    ;(async () => {
      try {
        const res = await evalApi.listVariants(editId)
        if (res.ok) {
          const data = await res.json()
          setVariants(
            data.map((v) => ({
              id: v.id,
              _key: v.id,
              order: v.order,
              name: v.name,
              question_count: v.question_count,
            })),
          )
        }
      } catch {
        // ignore
      }
    })()
  }, [isEditing, editId])

  const openExistingVariant = async (v) => {
    if (v.id) {
      setEditorLoading(true)
      setEditorOpen(true)
      try {
        const res = await evalApi.getVariant(editId, v.id)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Nu s-a putut încărca varianta.')
        }
        const full = await res.json()
        setEditorVariant({
          _key: v._key,
          id: full.id,
          name: full.name,
          questions: full.questions || [],
        })
      } catch (err) {
        toast.error(err.message)
        setEditorOpen(false)
      } finally {
        setEditorLoading(false)
      }
    } else {
      setEditorVariant({
        _key: v._key,
        name: v.name,
        questions: v.questions || [],
        __localIndex: variants.findIndex((x) => x._key === v._key),
      })
      setEditorOpen(true)
    }
  }

  const addLocalVariant = () => {
    const nextOrder = variants.length
    const newV = {
      _key: newKey(),
      name: `Varianta ${nextOrder + 1}`,
      question_count: 0,
      questions: [],
    }
    if (isEditing) {
      ;(async () => {
        try {
          const res = await evalApi.createVariant(editId, { name: newV.name, questions: [] })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err.detail || 'Nu s-a putut crea varianta.')
          }
          const created = await res.json()
          setVariants((p) => [
            ...p,
            {
              id: created.id,
              _key: created.id,
              order: created.order,
              name: created.name,
              question_count: (created.questions || []).length,
            },
          ])
          setEditorVariant({
            id: created.id,
            _key: created.id,
            name: created.name,
            questions: created.questions || [],
          })
          setEditorOpen(true)
        } catch (err) {
          toast.error(err.message)
        }
      })()
    } else {
      setVariants((p) => [...p, { ...newV, order: nextOrder }])
      setEditorVariant({ _key: newV._key, name: newV.name, questions: [], __localIndex: nextOrder })
      setEditorOpen(true)
    }
  }

  const removeVariant = async (v) => {
    if (variants.length <= 1) {
      toast.error('Evaluarea trebuie să aibă cel puțin o variantă.')
      return
    }
    if (!window.confirm(`Ștergi ${v.name}?`)) return
    if (v.id) {
      try {
        const res = await evalApi.deleteVariant(editId, v.id)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Nu s-a putut șterge varianta.')
        }
        setVariants((p) => p.filter((x) => x._key !== v._key))
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      setVariants((p) => p.filter((x) => x._key !== v._key))
    }
  }

  const handleEditorSave = async (payload) => {
    if (editorVariant?.id) {
      try {
        const res = await evalApi.updateVariant(editId, editorVariant.id, payload)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Nu s-a putut salva varianta.')
        }
        const saved = await res.json()
        setVariants((p) =>
          p.map((x) =>
            x.id === saved.id
              ? {
                  id: saved.id,
                  _key: saved.id,
                  order: saved.order,
                  name: saved.name,
                  question_count: (saved.questions || []).length,
                }
              : x,
          ),
        )
        toast.success('Varianta salvată.')
        setEditorOpen(false)
        setEditorVariant(null)
      } catch (err) {
        toast.error(err.message)
      }
    } else {
      setVariants((p) => {
        const next = [...p]
        const idx = next.findIndex((x) => x._key === editorVariant._key)
        if (idx === -1) return next
        next[idx] = {
          ...next[idx],
          name: payload.name,
          question_count: payload.questions.length,
          questions: payload.questions,
        }
        return next
      })
      setEditorOpen(false)
      setEditorVariant(null)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Titlul este obligatoriu.')
      return
    }
    setIsSubmitting(true)
    try {
      const metaPayload = {
        title: form.title,
        subject: form.subject,
        description: form.description,
        duration: form.duration,
        status: form.status,
        start_at: localDatetimeInputToIso(form.scheduled_starts_at),
        end_at: localDatetimeInputToIso(form.scheduled_ends_at),
      }

      if (isEditing) {
        const res = await evalApi.update(editId, metaPayload)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail ?? 'Eroare.')
        }
        toast.success('Evaluare actualizată!')
      } else {
        const payload = {
          ...metaPayload,
          variants:
            variants.length > 0
              ? variants.map((v) => ({
                  name: v.name,
                  questions: (v.questions || []).map(({ _key, ...rest }, idx) => ({
                    ...rest,
                    order: idx,
                  })),
                }))
              : undefined,
        }
        const res = await evalApi.create(payload)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail ?? 'Eroare.')
        }
        toast.success('Evaluare creată!')
      }
      navigate('/')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const durationWarning = accessWindowShorterThanDurationWarning(
    form.duration,
    form.scheduled_starts_at,
    form.scheduled_ends_at,
  )

  const totalVariants = variants.length

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto min-h-screen max-w-2xl border-x border-border">
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">{isEditing ? 'Editează evaluarea' : 'Evaluare nouă'}</h1>
          </div>
          <form onSubmit={handleSave} className="space-y-4 p-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="space-y-2">
                  <Label>Titlu *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="ex: Quiz Biologie"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Materie</Label>
                  <Input
                    value={form.subject}
                    onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                    placeholder="ex: Biologie"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descriere</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Descriere..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Durată (min)</Label>
                    <Input
                      type="number"
                      min="5"
                      max="180"
                      value={form.duration}
                      onChange={(e) => setForm((p) => ({ ...p, duration: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                      className="h-9 w-full"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Activ</option>
                      <option value="closed">Închis</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Început acces</Label>
                    <Input
                      type="datetime-local"
                      value={form.scheduled_starts_at}
                      onChange={(e) => setForm((p) => ({ ...p, scheduled_starts_at: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Sfârșit acces</Label>
                    <Input
                      type="datetime-local"
                      value={form.scheduled_ends_at}
                      onChange={(e) => setForm((p) => ({ ...p, scheduled_ends_at: e.target.value }))}
                    />
                  </div>
                </div>
                {durationWarning && (
                  <div className="flex items-start gap-2 rounded-md border-l-4 border-l-yellow-500 bg-yellow-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-500" />
                    <p>
                      Intervalul ({formatMinutesRo(durationWarning.windowMinutes)}) este mai mic decât durata
                      ({formatMinutesRo(durationWarning.durationMinutes)}).
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Variante ({totalVariants})</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addLocalVariant}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Adaugă variantă
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {totalVariants === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nicio variantă încă. Apasă „Adaugă variantă" pentru a crea prima.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {variants.map((v) => (
                      <div
                        key={v._key}
                        className="group relative flex cursor-pointer flex-col gap-2 rounded-lg border-2 border-dashed border-border p-3 transition-colors hover:border-primary hover:bg-primary/5"
                        onClick={() => openExistingVariant(v)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openExistingVariant(v)
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="font-semibold">{v.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary"
                              onClick={(e) => {
                                e.stopPropagation()
                                openExistingVariant(v)
                              }}
                              title="Editează varianta"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation()
                                removeVariant(v)
                              }}
                              disabled={variants.length <= 1}
                              title={variants.length <= 1 ? 'Nu poți șterge ultima variantă' : 'Șterge varianta'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {v.question_count} {v.question_count === 1 ? 'exercițiu' : 'exerciții'} &nbsp;·&nbsp; apasă pentru a edita
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Studenții primesc la întâmplare una dintre variante atunci când încep evaluarea.
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3 pb-8">
              <Button type="button" variant="outline" onClick={() => navigate('/')}>
                Anulează
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Se salvează...'
                  : isEditing
                    ? 'Salvează modificările'
                    : 'Creează evaluarea'}
              </Button>
            </div>
          </form>
        </div>
      </main>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditorOpen(false)
            setEditorVariant(null)
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] w-[min(95vw,720px)] max-w-[95vw] flex-col sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>
              {editorVariant?.name
                ? `Editează — ${editorVariant.name}`
                : 'Editează varianta'}
            </DialogTitle>
          </DialogHeader>
          {editorLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Se încarcă...</div>
          ) : editorVariant ? (
            <VariantEditor
              initialVariant={editorVariant}
              onSave={handleEditorSave}
              onCancel={() => {
                setEditorOpen(false)
                setEditorVariant(null)
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <RightSidebar>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Sfaturi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              Poți crea mai multe variante ale aceleiași evaluări. Fiecare student primește random una dintre
              ele.
            </p>
            <p>Completează câmpurile de început/sfârșit acces pentru a restricționa accesul la evaluare.</p>
            <p>Durata indică cât timp are fiecare student după ce începe.</p>
          </CardContent>
        </Card>
      </RightSidebar>
    </>
  )
}
