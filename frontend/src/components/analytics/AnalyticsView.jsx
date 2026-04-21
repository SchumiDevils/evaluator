import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { analytics as analyticsApi } from '@/lib/api'
import { CHART_COLORS, chartTooltipStyle } from '@/lib/helpers'
import RightSidebar from '@/components/layout/RightSidebar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'

export default function AnalyticsView() {
  const { isProfessor } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      try {
        const res = await analyticsApi.global()
        if (res.ok) setData(await res.json())
      } catch { toast.error('Nu s-au putut încărca analizele.') }
      finally { setIsLoading(false) }
    })()
  }, [])

  const score_distribution = data?.score_distribution || []
  const question_success = data?.question_success || []
  const evaluation_averages = data?.evaluation_averages || []
  const student_evolution = data?.student_evolution || []

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl border-x border-border min-h-screen">
          <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button>
            <div><h1 className="text-xl font-bold">Analize & Statistici</h1><p className="text-sm text-muted-foreground">{isProfessor ? 'Performanța studenților' : 'Urmărește-ți progresul'}</p></div>
          </div>
          <div className="p-4 space-y-4">
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground">Se încarcă...</div>
            ) : (
              <>
                <Card><CardHeader><CardTitle className="text-base">Distribuția Scorurilor</CardTitle><CardDescription>Câte răspunsuri per interval</CardDescription></CardHeader><CardContent><ResponsiveContainer width="100%" height={300}><BarChart data={score_distribution}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="range" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} /><Tooltip {...chartTooltipStyle} /><Bar dataKey="count" name="Răspunsuri" radius={[6,6,0,0]}>{score_distribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></CardContent></Card>

                <Card><CardHeader><CardTitle className="text-base">{isProfessor ? 'Media per Evaluare' : 'Scorul tău vs. Media'}</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={300}><BarChart data={evaluation_averages}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="evaluation_title" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} /><YAxis fontSize={12} domain={[0, 100]} unit="%" /><Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="class_avg_percent" name="Media clasei" fill="#8B5CF6" radius={[6,6,0,0]} />{!isProfessor && <Bar dataKey="student_avg_percent" name="Scorul tău" fill="#22d3ee" radius={[6,6,0,0]} />}</BarChart></ResponsiveContainer></CardContent></Card>

                {question_success.length > 0 && (
                  <Card><CardHeader><CardTitle className="text-base">Rata de Succes per Întrebare</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={Math.max(300, question_success.length * 45)}><BarChart data={question_success} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis type="number" domain={[0, 100]} unit="%" fontSize={12} /><YAxis type="category" dataKey="question_text" fontSize={11} width={200} /><Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} /><Bar dataKey="avg_percent" name="Media %" radius={[0,6,6,0]}>{question_success.map((e, i) => <Cell key={i} fill={e.avg_percent >= 70 ? '#22c55e' : e.avg_percent >= 40 ? '#f59e0b' : '#ef4444'} />)}</Bar></BarChart></ResponsiveContainer></CardContent></Card>
                )}

                {!isProfessor && student_evolution.length > 0 && (
                  <Card><CardHeader><CardTitle className="text-base">Evoluția Scorurilor</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={300}><LineChart data={student_evolution}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="evaluation_title" fontSize={11} angle={-15} textAnchor="end" height={60} /><YAxis fontSize={12} domain={[0, 100]} unit="%" /><Tooltip {...chartTooltipStyle} formatter={(v) => `${v}%`} /><Line type="monotone" dataKey="score_percent" name="Scor" stroke="#8B5CF6" strokeWidth={3} dot={{ fill: '#8B5CF6', r: 6 }} /></LineChart></ResponsiveContainer></CardContent></Card>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <RightSidebar>
        <Card><CardContent className="p-4 text-sm text-muted-foreground"><BarChart3 className="mb-2 h-8 w-8 text-primary" /><p>Analizele sunt calculate pe baza tuturor evaluărilor și răspunsurilor.</p></CardContent></Card>
      </RightSidebar>
    </>
  )
}
