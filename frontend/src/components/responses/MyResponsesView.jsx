import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { evaluations as evalApi } from '@/lib/api'
import { feedbackSourceLabel, feedbackSourceVariant } from '@/lib/helpers'
import RightSidebar from '@/components/layout/RightSidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, FileText, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

export default function MyResponsesView() {
  const navigate = useNavigate()
  const [responses, setResponses] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      try {
        const res = await evalApi.allMyResponses()
        if (res.ok) setResponses(await res.json())
      } catch { toast.error('Nu s-au putut încărca răspunsurile.') }
      finally { setIsLoading(false) }
    })()
  }, [])

  const grouped = responses.reduce((acc, r) => {
    const key = r.evaluation_id || 'unknown'
    if (!acc[key]) acc[key] = { title: r.evaluation_title || 'Evaluare necunoscută', responses: [] }
    acc[key].responses.push(r)
    return acc
  }, {})

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl border-x border-border min-h-screen">
          <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button>
            <div><h1 className="text-xl font-bold">Răspunsurile mele</h1><p className="text-sm text-muted-foreground">Toate răspunsurile și feedback-ul primit</p></div>
          </div>
          <div className="p-4 space-y-4">
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground">Se încarcă...</div>
            ) : Object.keys(grouped).length === 0 ? (
              <div className="py-8 text-center"><FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" /><p className="text-muted-foreground">Nu ai trimis niciun răspuns.</p></div>
            ) : Object.entries(grouped).map(([evalId, group]) => {
              const isExpanded = !!expanded[evalId]
              const totalScore = group.responses.reduce((s, r) => s + (r.score ?? 0), 0)
              const maxScore = group.responses.reduce((s, r) => s + (r.question_points ?? 0), 0)
              return (
                <Card key={evalId}>
                  <div className="flex cursor-pointer items-center gap-3 p-4" onClick={() => setExpanded(p => ({ ...p, [evalId]: !p[evalId] }))}>
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="flex-1 font-semibold">{group.title}</h3>
                    <Badge variant="secondary">{group.responses.length} răspunsuri</Badge>
                    {maxScore > 0 && <Badge variant="outline">{totalScore}/{maxScore} pct</Badge>}
                    <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                  {isExpanded && (
                    <div className="divide-y border-t">
                      {group.responses.map((r, idx) => (
                        <div key={r.id} className="p-4 space-y-2">
                          <div className="flex items-baseline gap-2 text-sm">
                            <span className="font-semibold text-primary uppercase text-xs">Ex. {idx + 1}</span>
                            <span className="text-muted-foreground">{r.question_text || 'Necunoscută'}</span>
                          </div>
                          <div className="rounded-md bg-primary/5 border border-primary/10 p-2 text-sm">{r.answer_text}</div>
                          {r.score != null && <p className="text-sm">Scor: <strong className="text-primary">{r.score}/{r.question_points || '?'}</strong></p>}
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
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      </main>
      <RightSidebar>
        <Card><CardContent className="p-4 text-sm text-muted-foreground"><p>Aici vezi toate răspunsurile trimise și reevaluările profesorilor.</p></CardContent></Card>
      </RightSidebar>
    </>
  )
}
