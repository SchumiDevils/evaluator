import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { auth as authApi } from '@/lib/api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token') ?? '')
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem('rubrix-theme') === 'light'
      ? 'light'
      : 'dark'
  )
  const [avatarUrl, setAvatarUrl] = useState(null)

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token)
    } else {
      localStorage.removeItem('auth_token')
    }
  }, [token])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.classList.remove('light')
      localStorage.removeItem('rubrix-theme')
    } else {
      root.classList.remove('dark')
      root.classList.add('light')
      localStorage.setItem('rubrix-theme', 'light')
    }
  }, [theme])

  const fetchProfile = useCallback(async () => {
    if (!token) {
      setUser(null)
      return null
    }
    try {
      const res = await authApi.me()
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUser(data)
      return data
    } catch {
      setUser(null)
      setToken('')
      return null
    }
  }, [token])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  useEffect(() => {
    if (!token || !user?.has_avatar) {
      setAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await authApi.getAvatar()
        if (!res.ok || cancelled) return
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        setAvatarUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return url
        })
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [token, user?.has_avatar])

  const login = async (email, password) => {
    const res = await authApi.login(email, password)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Autentificarea a eșuat')
    }
    const data = await res.json()
    setToken(data.access_token)
  }

  const register = async ({ email, password, fullName, role }) => {
    const res = await authApi.register({
      email,
      password,
      full_name: fullName,
      role,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail ?? 'Înregistrarea a eșuat')
    }
  }

  const logout = () => {
    setToken('')
    setUser(null)
    setAvatarUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  const isAuthenticated = Boolean(token && user)
  const isProfessor = user?.role === 'professor'

  return (
    <AppContext.Provider
      value={{
        token,
        user,
        isAuthenticated,
        isProfessor,
        theme,
        toggleTheme,
        avatarUrl,
        setAvatarUrl,
        login,
        register,
        logout,
        fetchProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
