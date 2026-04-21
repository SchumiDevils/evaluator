export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const API_PREFIX = '/api/v1'

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('auth_token')
  const headers = { ...options.headers }
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${API_URL}${API_PREFIX}${path}`, { ...options, headers })
  return res
}

export async function apiFetchJson(path, options = {}) {
  const res = await apiFetch(path, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err.detail === 'string' ? err.detail : 'A apărut o eroare.')
  }
  return res.json()
}

export const auth = {
  login: (email, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: email, password }),
    }),
  register: (data) =>
    apiFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  me: () => apiFetch('/auth/me'),
  updateProfile: (data) =>
    apiFetch('/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  uploadAvatar: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch('/auth/me/avatar', { method: 'POST', body: fd })
  },
  getAvatar: () => apiFetch('/auth/me/avatar'),
  deleteAvatar: () => apiFetch('/auth/me/avatar', { method: 'DELETE' }),
  forgotPassword: (email) =>
    apiFetch('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token, new_password) =>
    apiFetch('/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password }),
    }),
}

export const evaluations = {
  list: () => apiFetch('/evaluations/'),
  get: (id) => apiFetch(`/evaluations/${id}`),
  create: (data) =>
    apiFetch('/evaluations/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  update: (id, data) =>
    apiFetch(`/evaluations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  delete: (id) => apiFetch(`/evaluations/${id}`, { method: 'DELETE' }),
  join: (code) =>
    apiFetch('/evaluations/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  start: (id) => apiFetch(`/evaluations/${id}/start`, { method: 'POST' }),
  responses: (id) => apiFetch(`/evaluations/${id}/responses`),
  myResponses: (id) => apiFetch(`/evaluations/${id}/my-responses`),
  allMyResponses: () => apiFetch('/evaluations/my-responses'),
  analytics: (id) => apiFetch(`/evaluations/${id}/analytics`),
  exportPdf: (id) => apiFetch(`/evaluations/${id}/export/pdf`),
  regenerateCode: (id) =>
    apiFetch(`/evaluations/${id}/regenerate-access-code`, { method: 'POST' }),
  togglePublicLink: (id, enabled) =>
    apiFetch(`/evaluations/${id}/public-link`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }),
  reevaluate: (responseId, data) =>
    apiFetch(`/evaluations/responses/${responseId}/feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}

export const feedback = {
  submit: (data) =>
    apiFetch('/feedback/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}

export const analytics = {
  global: () => apiFetch('/analytics/'),
}
