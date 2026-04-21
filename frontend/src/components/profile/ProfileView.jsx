import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { auth as authApi } from '@/lib/api'
import RightSidebar from '@/components/layout/RightSidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ArrowLeft, Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export default function ProfileView() {
  const { user, fetchProfile, avatarUrl, setAvatarUrl, isProfessor } = useApp()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [localAvatarUrl, setLocalAvatarUrl] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [form, setForm] = useState({ fullName: '', currentPassword: '', newPassword: '', confirmPassword: '' })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (user) setForm(p => ({ ...p, fullName: user.full_name || '' }))
  }, [user?.id])

  const initials = (user?.full_name || user?.email || '?').trim().split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  const displayUrl = localAvatarUrl || avatarUrl

  const handleAvatarPick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setLocalAvatarUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
    setAvatarFile(f)
  }

  const handleRemoveAvatar = async () => {
    try {
      const res = await authApi.deleteAvatar()
      if (!res.ok) throw new Error('Eroare.')
      await fetchProfile()
      setAvatarFile(null)
      setLocalAvatarUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast.success('Avatar eliminat.')
    } catch (err) { toast.error(err.message) }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (form.newPassword && form.newPassword !== form.confirmPassword) { toast.error('Parolele nu coincid.'); return }
    if (form.newPassword && form.newPassword.length < 6) { toast.error('Minim 6 caractere.'); return }
    setIsSaving(true)
    try {
      const body = {}
      if (form.fullName.trim() !== (user.full_name || '')) body.full_name = form.fullName.trim() || null
      if (form.newPassword) {
        if (!form.currentPassword) { toast.error('Introdu parola curentă.'); setIsSaving(false); return }
        body.current_password = form.currentPassword; body.new_password = form.newPassword
      }
      if (Object.keys(body).length > 0) {
        const res = await authApi.updateProfile(body)
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(typeof err.detail === 'string' ? err.detail : 'Eroare.') }
      }
      if (avatarFile) {
        const res = await authApi.uploadAvatar(avatarFile)
        if (!res.ok) throw new Error('Încărcarea avatarului a eșuat.')
      }
      if (Object.keys(body).length === 0 && !avatarFile) { toast.info('Nicio modificare.'); setIsSaving(false); return }
      await fetchProfile()
      setForm(p => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }))
      setAvatarFile(null)
      setLocalAvatarUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
      if (fileInputRef.current) fileInputRef.current.value = ''
      toast.success('Profil salvat.')
    } catch (err) { toast.error(err.message) }
    finally { setIsSaving(false) }
  }

  if (!user) return null

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl border-x border-border min-h-screen">
          <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><ArrowLeft className="h-5 w-5" /></Button>
            <div><h1 className="text-xl font-bold">Profil</h1><p className="text-sm text-muted-foreground">Actualizează datele contului</p></div>
          </div>
          <div className="p-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center gap-3 pb-6 mb-6 border-b">
                  <div className="relative group">
                    <Avatar className="h-24 w-24">
                      <AvatarImage src={displayUrl} />
                      <AvatarFallback className="text-2xl font-bold">{initials}</AvatarFallback>
                    </Avatar>
                    <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/0 transition-colors group-hover:bg-black/40">
                      <Upload className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={handleAvatarPick} />
                    </label>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{user?.full_name || 'Utilizator'}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  {user.has_avatar && (
                    <Button variant="outline" size="sm" onClick={handleRemoveAvatar}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Elimină poza
                    </Button>
                  )}
                </div>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-2"><Label>Nume afișat</Label><Input value={form.fullName} onChange={(e) => setForm(p => ({ ...p, fullName: e.target.value }))} placeholder="Ion Popescu" maxLength={255} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={user.email} readOnly disabled className="opacity-60" /></div>
                  <p className="text-sm text-muted-foreground">Rol: {isProfessor ? 'Profesor' : 'Student'}</p>
                  <Separator />
                  <h3 className="font-semibold">Schimbă parola</h3>
                  <p className="text-xs text-muted-foreground">Lasă gol dacă nu vrei să modifici.</p>
                  <div className="space-y-2"><Label>Parola curentă</Label><Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm(p => ({ ...p, currentPassword: e.target.value }))} placeholder="••••••••" /></div>
                  <div className="space-y-2"><Label>Parola nouă</Label><Input type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="minim 6 caractere" /></div>
                  <div className="space-y-2"><Label>Confirmă parola</Label><Input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="repetă parola" /></div>
                  <div className="flex gap-3 justify-end pt-4">
                    <Button type="button" variant="outline" onClick={() => navigate('/')}>Anulează</Button>
                    <Button type="submit" disabled={isSaving}>{isSaving ? 'Se salvează...' : 'Salvează'}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <RightSidebar>
        <Card><CardContent className="p-4 text-sm text-muted-foreground"><p>Aici poți modifica numele afișat, parola și fotografia de profil.</p></CardContent></Card>
      </RightSidebar>
    </>
  )
}
