import { useState, useRef, useCallback } from 'react'
import { evaluations as evalApi } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUp, Loader2, Check, AlertCircle, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { QUESTION_TYPES } from '@/lib/helpers'

const TYPE_LABELS = Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t.label]))

function QuestionTypeTag({ type }) {
  const colors = {
    multiple_choice: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    checkboxes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    short_answer: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    long_answer: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[type] || 'bg-muted text-muted-foreground'}`}>
      {TYPE_LABELS[type] || type}
    </span>
  )
}

export default function PdfImportDialog({ open, onOpenChange, onConfirm }) {
  const [step, setStep] = useState('upload') // 'upload' | 'loading' | 'preview'
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const reset = useCallback(() => {
    setStep('upload')
    setPreview(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const handleClose = (open) => {
    if (!open) reset()
    onOpenChange(open)
  }

  const processFile = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      toast.error('Te rog selectează un fișier PDF.')
      return
    }
    if (file.size > 10_000_000) {
      toast.error('Fișierul este prea mare (max 10 MB).')
      return
    }
    setFileName(file.name)
    setStep('loading')
    try {
      const result = await evalApi.importPdf(file)
      setPreview(result)
      setStep('preview')
    } catch (err) {
      toast.error(err.message || 'Eroare la importul PDF-ului.')
      setStep('upload')
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleRemoveQuestion = (idx) => {
    setPreview((p) => ({
      ...p,
      questions: p.questions.filter((_, i) => i !== idx),
    }))
  }

  const handleConfirm = () => {
    if (!preview || !preview.questions?.length) {
      toast.error('Nu sunt întrebări de importat.')
      return
    }
    onConfirm(preview)
    reset()
  }

  const typeSummary = preview?.questions?.reduce((acc, q) => {
    const label = TYPE_LABELS[q.question_type] || q.question_type
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] w-[min(95vw,640px)] max-w-[95vw] flex-col overflow-hidden sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Import evaluare din PDF'}
            {step === 'loading' && 'Se analizează PDF-ul...'}
            {step === 'preview' && 'Previzualizare import'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Încarcă un PDF cu o evaluare/test, iar AI-ul va extrage automat întrebările, tipul lor și punctajul.
            </p>
            <div
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Trage fișierul PDF aici</p>
                <p className="text-xs text-muted-foreground">sau apasă pentru a selecta (max 10 MB)</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Se analizează {fileName}</p>
              <p className="text-sm text-muted-foreground">AI-ul extrage întrebările din document...</p>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="space-y-2">
              {preview.title && (
                <div className="flex items-center gap-2">
                  <Label className="w-16 flex-shrink-0 text-xs text-muted-foreground">Titlu:</Label>
                  <span className="text-sm font-medium">{preview.title}</span>
                </div>
              )}
              {preview.subject && (
                <div className="flex items-center gap-2">
                  <Label className="w-16 flex-shrink-0 text-xs text-muted-foreground">Materie:</Label>
                  <span className="text-sm">{preview.subject}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 rounded-lg bg-muted/50 p-3">
                <span className="text-sm font-medium">
                  {preview.questions?.length || 0} întrebări identificate:
                </span>
                {typeSummary && Object.entries(typeSummary).map(([label, count]) => (
                  <span key={label} className="rounded-full bg-background px-2.5 py-0.5 text-xs font-medium shadow-sm">
                    {count} {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {preview.questions?.map((q, idx) => (
                <div key={idx} className="group rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                        <QuestionTypeTag type={q.question_type} />
                        <span className="text-xs text-muted-foreground">{q.points} pct</span>
                      </div>
                      <p className="text-sm">{q.text}</p>
                      {q.options && q.options.length > 0 && (
                        <div className="mt-1 space-y-0.5 pl-4">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${opt === q.correct_answer ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                              <span className={opt === q.correct_answer ? 'font-medium text-green-700 dark:text-green-400' : ''}>
                                {opt}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleRemoveQuestion(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button type="button" variant="outline" onClick={reset}>
                Încearcă alt PDF
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={!preview.questions?.length}>
                <Check className="mr-1 h-4 w-4" />
                Confirmă și importă
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
