export function localDatetimeInputToIso(localStr) {
  if (!localStr || !String(localStr).trim()) return null
  const d = new Date(localStr)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function isoToDatetimeLocalValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function getEvaluationQuestionCount(a) {
  if (a == null) return 0
  if (typeof a.question_count === 'number') return a.question_count
  return (a.questions || []).length
}

export function formatCountdownToStart(iso) {
  if (!iso) return ''
  const end = new Date(iso).getTime()
  const t = end - Date.now()
  if (t <= 0) return 'Se deschide acum…'
  const s = Math.floor(t / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d} zile, ${h} h`
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${sec} s`
  return `${sec} s`
}

export function formatSecondsCountdown(totalSec) {
  if (totalSec == null || totalSec < 0) return '—'
  const s = Math.floor(totalSec)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d} zile, ${h} h`
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${sec} s`
  return `${sec} s`
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function formatMinutesRo(n) {
  const x = Math.floor(Number(n))
  if (x === 1) return '1 minut'
  return `${x} minute`
}

export function studentCardScheduleLine(a) {
  const st = a.start_at || a.scheduled_starts_at
  if (a.lifecycle_status === 'scheduled' && st) {
    return `Programată — începe la ${new Date(st).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}`
  }
  if (a.lifecycle_status === 'closed') {
    return 'Închisă (fereastră sau manual)'
  }
  if (a.schedule_access_blocked) {
    if (a.schedule_block_kind === 'before_start' && st) {
      return `Începe la ${new Date(st).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}`
    }
    if (a.schedule_block_kind === 'after_end') {
      return 'Perioada de acces s-a încheiat'
    }
    return a.schedule_block_message || null
  }
  return null
}

export function formatEvaluationScheduleLabel({ status, scheduled_starts_at, scheduled_ends_at, start_at, end_at }) {
  const startIso = start_at || scheduled_starts_at
  const endIso = end_at || scheduled_ends_at
  if (status !== 'active') return null
  if (!startIso && !endIso) return null
  const fmt = (iso) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })
  }
  const now = Date.now()
  const startMs = startIso ? new Date(startIso).getTime() : null
  const endMs = endIso ? new Date(endIso).getTime() : null
  if (startMs != null && !Number.isNaN(startMs) && now < startMs) {
    return `Începe ${fmt(startIso)}`
  }
  if (endMs != null && !Number.isNaN(endMs) && now > endMs) {
    return 'Fereastra s-a încheiat'
  }
  const parts = []
  if (startIso) parts.push(`de la ${fmt(startIso)}`)
  if (endIso) parts.push(`până la ${fmt(endIso)}`)
  return parts.length ? `Acces studenți: ${parts.join(' ')}` : null
}

export function accessWindowShorterThanDurationWarning(durationMinutes, scheduledStartsAtLocal, scheduledEndsAtLocal) {
  const dm = Number(durationMinutes)
  if (!dm || dm <= 0) return null
  const a = String(scheduledStartsAtLocal || '').trim()
  const b = String(scheduledEndsAtLocal || '').trim()
  if (!a || !b) return null
  const s = new Date(a).getTime()
  const e = new Date(b).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
  const windowMinutes = Math.floor((e - s) / 60000)
  if (windowMinutes <= 0 || windowMinutes >= dm) return null
  return { windowMinutes, durationMinutes: dm }
}

export function unifiedEvalStatusBadge(assessment) {
  if (assessment.status === 'draft') return { variant: 'outline', label: 'draft' }
  if (assessment.status === 'closed') return { variant: 'destructive', label: 'închis' }
  const life = assessment.lifecycle_status
  if (life === 'scheduled') return { variant: 'warning', label: 'programată' }
  if (life === 'closed') return { variant: 'destructive', label: 'încheiată' }
  if (life === 'active') return { variant: 'success', label: 'activă' }
  return { variant: 'success', label: 'activă' }
}

export function feedbackSourceLabel(source) {
  if (source === 'auto') return 'Auto'
  if (source === 'professor') return 'Profesor'
  if (source?.startsWith('ai:')) return 'AI'
  return 'Reguli'
}

export function feedbackSourceVariant(source) {
  if (source === 'auto') return 'default'
  if (source === 'professor') return 'warning'
  if (source?.startsWith('ai:')) return 'default'
  return 'secondary'
}

export const QUESTION_TYPES = [
  { value: 'long_answer', label: 'Răspuns lung' },
  { value: 'short_answer', label: 'Răspuns scurt' },
  { value: 'multiple_choice', label: 'Alegere singulară' },
  { value: 'checkboxes', label: 'Checkbox-uri' },
]

export const CHART_COLORS = ['#8B5CF6', '#A78BFA', '#7C3AED', '#6D28D9', '#C4B5FD', '#DDD6FE']

export const chartTooltipStyle = {
  contentStyle: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--foreground)',
  },
  labelStyle: { color: 'var(--muted-foreground)' },
  itemStyle: { color: 'var(--foreground)' },
}
