import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { admin } from '@/lib/api'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash2, Users, BookOpen, BarChart3, RefreshCw } from 'lucide-react'

function RoleBadge({ role }) {
  const colors = {
    admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    professor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    student: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[role] || 'bg-muted text-muted-foreground'}`}>
      {role}
    </span>
  )
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  )
}

export default function AdminPanel() {
  const { isAdmin } = useApp()
  const navigate = useNavigate()

  const [users, setUsers] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [u, e, s] = await Promise.all([
        admin.listUsers(),
        admin.listEvaluations(),
        admin.stats(),
      ])
      setUsers(u)
      setEvaluations(e)
      setStats(s)
    } catch (err) {
      toast.error(err.message || 'Eroare la încărcarea datelor admin.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      navigate('/', { replace: true })
      return
    }
    fetchAll()
  }, [isAdmin, navigate, fetchAll])

  const handleRoleChange = async (userId, newRole) => {
    try {
      await admin.updateUserRole(userId, newRole)
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)))
      toast.success('Rolul a fost actualizat.')
    } catch (err) {
      toast.error(err.message || 'Eroare la schimbarea rolului.')
    }
  }

  const handleDeleteUser = async (userId, email) => {
    if (!confirm(`Sigur vrei să ștergi utilizatorul ${email}?`)) return
    try {
      await admin.deleteUser(userId)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
      toast.success('Utilizatorul a fost șters.')
    } catch (err) {
      toast.error(err.message || 'Eroare la ștergerea utilizatorului.')
    }
  }

  const handleDeleteEvaluation = async (evalId, title) => {
    if (!confirm(`Sigur vrei să ștergi evaluarea "${title}"?`)) return
    try {
      await admin.deleteEvaluation(evalId)
      setEvaluations((prev) => prev.filter((e) => e.id !== evalId))
      toast.success('Evaluarea a fost ștearsă.')
    } catch (err) {
      toast.error(err.message || 'Eroare la ștergerea evaluării.')
    }
  }

  if (!isAdmin) return null

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Panou Admin</h1>
          <p className="text-sm text-muted-foreground">
            Gestionează utilizatori, evaluări și vezi statisticile platformei.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Reîncarcă
        </Button>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" />
            Utilizatori
          </TabsTrigger>
          <TabsTrigger value="evaluations" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            Evaluări
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Statistici
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">ID</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Nume</th>
                    <th className="px-4 py-3 text-left font-medium">Rol</th>
                    <th className="px-4 py-3 text-left font-medium">Creat la</th>
                    <th className="px-4 py-3 text-right font-medium">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{u.id}</td>
                      <td className="px-4 py-3">{u.email}</td>
                      <td className="px-4 py-3">{u.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        {u.role === 'admin' ? (
                          <RoleBadge role={u.role} />
                        ) : (
                          <Select
                            value={u.role}
                            onValueChange={(val) => handleRoleChange(u.id, val)}
                          >
                            <SelectTrigger className="h-7 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="student">student</SelectItem>
                              <SelectItem value="professor">professor</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString('ro-RO')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.role !== 'admin' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeleteUser(u.id, u.email)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Niciun utilizator.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="evaluations" className="mt-4">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">ID</th>
                    <th className="px-4 py-3 text-left font-medium">Titlu</th>
                    <th className="px-4 py-3 text-left font-medium">Materie</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Autor</th>
                    <th className="px-4 py-3 text-left font-medium">Creat la</th>
                    <th className="px-4 py-3 text-right font-medium">Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((e) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{e.id}</td>
                      <td className="px-4 py-3 font-medium">{e.title}</td>
                      <td className="px-4 py-3">{e.subject || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{e.author_name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString('ro-RO')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDeleteEvaluation(e.id, e.title)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {evaluations.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        Nicio evaluare.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          {stats ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Total utilizatori" value={stats.total_users} icon={Users} />
              <StatCard label="Profesori" value={stats.total_professors} icon={Users} />
              <StatCard label="Studenți" value={stats.total_students} icon={Users} />
              <StatCard label="Evaluări" value={stats.total_evaluations} icon={BookOpen} />
              <StatCard label="Răspunsuri" value={stats.total_responses} icon={BarChart3} />
            </div>
          ) : (
            <p className="text-center text-muted-foreground">Se încarcă…</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
