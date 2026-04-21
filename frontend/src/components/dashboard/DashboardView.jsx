import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { evaluations as evalApi } from '@/lib/api'
import {
  getEvaluationQuestionCount,
  formatEvaluationScheduleLabel,
  studentCardScheduleLine,
  unifiedEvalStatusBadge,
} from '@/lib/helpers'
import RightSidebar from '@/components/layout/RightSidebar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  FileText,
  Clock,
  Users,
  TrendingUp,
  Search,
  PlusCircle,
  ChevronRight,
  Play,
} from 'lucide-react'
import { toast } from 'sonner'

export default function DashboardView() {
  const { user, isProfessor } = useApp()
  const navigate = useNavigate()
  const [assessments, setAssessments] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, responses: 0, avgScore: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)

  const fetchAssessments = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await evalApi.list()
      if (res.ok) {
        const data = await res.json()
        setAssessments(data.evaluations ?? [])
        setStats(data.stats ?? { total: 0, active: 0, responses: 0, avgScore: 0 })
      }
    } catch {
      toast.error('Nu s-au putut încărca evaluările.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAssessments()
  }, [fetchAssessments])

  const handleJoinByCode = async () => {
    const code = joinCode.trim().toUpperCase()
    if (!code) { toast.error('Introdu un cod de acces.'); return }
    setIsJoining(true)
    try {
      const res = await evalApi.join(code)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Cod invalid.')
      }
      setJoinCode('')
      toast.success('Te-ai înscris la evaluare!')
      await fetchAssessments()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setIsJoining(false)
    }
  }

  const filteredAssessments = assessments.filter((a) => {
    const matchesFilter = filter === 'all' || a.status === filter
    const matchesSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.subject?.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const filters = ['all', 'draft', 'active', 'closed']
  const filterLabels = { all: 'Toate', draft: 'Draft', active: 'Active', closed: 'Închise' }

  const statCards = isProfessor
    ? [
        { label: 'Total evaluări', value: stats.total, icon: FileText, color: 'text-blue-500' },
        { label: 'Active', value: stats.active, icon: Clock, color: 'text-green-500' },
        { label: 'Total răspunsuri', value: stats.responses, icon: Users, color: 'text-orange-500' },
        { label: 'Scor mediu', value: `${stats.avgScore}%`, icon: TrendingUp, color: 'text-pink-500' },
      ]
    : [
        { label: 'Evaluări disponibile', value: stats.total, icon: FileText, color: 'text-blue-500' },
        { label: 'Răspunsurile tale', value: stats.responses, icon: TrendingUp, color: 'text-green-500', onClick: () => navigate('/my-responses') },
        { label: 'Scor mediu', value: `${stats.avgScore}%`, icon: TrendingUp, color: 'text-pink-500' },
      ]

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl border-x border-border min-h-screen">
          <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-4 py-3">
            <h1 className="text-xl font-bold">
              {isProfessor ? 'Dashboard' : `Bine ai venit, ${user?.full_name?.split(' ')[0] || 'Student'}!`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isProfessor ? 'Gestionează evaluările și urmărește progresul' : 'Evaluările tale disponibile'}
            </p>
          </div>

          {isProfessor && (
            <div className="border-b border-border p-4">
              <Button onClick={() => navigate('/assessment/new')} className="w-full gap-2">
                <PlusCircle className="h-4 w-4" />
                Evaluare nouă
              </Button>
            </div>
          )}

          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Se încarcă evaluările...</div>
            ) : filteredAssessments.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  {isProfessor
                    ? `Nu există evaluări${filter !== 'all' ? ` cu statusul "${filterLabels[filter]}"` : ''}`
                    : 'Nu există evaluări disponibile momentan.'}
                </p>
                {isProfessor && (
                  <Button className="mt-4" onClick={() => navigate('/assessment/new')}>
                    Creează prima evaluare
                  </Button>
                )}
              </div>
            ) : (
              filteredAssessments.map((assessment) => {
                const scheduleHint = isProfessor ? formatEvaluationScheduleLabel(assessment) : null
                const studentSchedule = !isProfessor ? studentCardScheduleLine(assessment) : null
                const statusBadge = unifiedEvalStatusBadge(assessment)

                return (
                  <div
                    key={assessment.id}
                    className="cursor-pointer px-4 py-4 transition-colors hover:bg-accent/50"
                    onClick={() => navigate(`/assessment/${assessment.id}`, { state: { assessment } })}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold">{assessment.title}</h3>
                          {isProfessor && (
                            <Badge variant={statusBadge.variant === 'success' ? 'default' : statusBadge.variant === 'destructive' ? 'destructive' : statusBadge.variant === 'warning' ? 'outline' : 'secondary'} className="flex-shrink-0 text-xs">
                              {statusBadge.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{assessment.subject || 'General'}</p>
                        {scheduleHint && <p className="mt-1 text-xs text-muted-foreground">{scheduleHint}</p>}
                        {studentSchedule && <p className="mt-1 text-xs font-medium text-yellow-500">{studentSchedule}</p>}
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {assessment.description || 'Nicio descriere disponibilă'}
                        </p>
                        {!isProfessor && assessment.author_name && (
                          <p className="mt-1 text-xs font-medium text-primary">Profesor: {assessment.author_name}</p>
                        )}
                        <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                          {isProfessor && (
                            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{assessment.response_count ?? 0} răspunsuri</span>
                          )}
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{assessment.duration ?? 30} min</span>
                          {!isProfessor && (
                            <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{getEvaluationQuestionCount(assessment)} exerciții</span>
                          )}
                        </div>
                      </div>
                      {!isProfessor ? (
                        <Button size="sm" className="flex-shrink-0 gap-1" onClick={(e) => { e.stopPropagation(); navigate(`/assessment/${assessment.id}`, { state: { assessment } }) }}>
                          Începe <Play className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={(e) => { e.stopPropagation(); navigate(`/assessment/${assessment.id}`, { state: { assessment } }) }}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </main>

      <RightSidebar>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Statistici</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {statCards.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg border p-3 ${s.onClick ? 'cursor-pointer transition-colors hover:bg-accent' : ''}`}
                  onClick={s.onClick}
                >
                  <div className="flex items-center gap-3">
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                  </div>
                  <span className="text-lg font-bold">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Căutare</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Caută evaluări..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {isProfessor && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {filters.map((f) => (
                    <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="text-xs">
                      {filterLabels[f]}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {!isProfessor && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Intră cu un cod</CardTitle>
                <CardDescription>Codul de acces de la profesor</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="ex: ABC12XYZ"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    className="font-mono tracking-wider"
                  />
                  <Button onClick={handleJoinByCode} disabled={isJoining} size="sm">
                    {isJoining ? '...' : 'Înscrie-te'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </RightSidebar>
    </>
  )
}
