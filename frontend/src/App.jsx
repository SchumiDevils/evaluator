import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from '@/context/AppContext'
import { Toaster } from '@/components/ui/sonner'
import AppLayout from '@/components/layout/AppLayout'
import AuthPage from '@/components/auth/AuthPage'
import DashboardView from '@/components/dashboard/DashboardView'
import AssessmentDetail from '@/components/assessment/AssessmentDetail'
import AssessmentForm from '@/components/assessment/AssessmentForm'
import AnalyticsView from '@/components/analytics/AnalyticsView'
import MyResponsesView from '@/components/responses/MyResponsesView'
import ProfileView from '@/components/profile/ProfileView'
import PublicExam from '@/components/PublicExam'

function parsePublicLinkFromPath() {
  if (typeof window === 'undefined') return null
  const m = window.location.pathname.match(/^\/public\/([a-f0-9-]{36})\/?$/i)
  return m ? m[1] : null
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useApp()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function AuthRoute() {
  const { isAuthenticated } = useApp()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <AuthPage />
}

function AppRoutes() {
  const publicLinkId = parsePublicLinkFromPath()
  if (publicLinkId) {
    return <PublicExam linkId={publicLinkId} apiUrl={API_URL} />
  }

  return (
    <Routes>
      <Route path="/login" element={<AuthRoute />} />
      <Route
        path="/public/:linkId"
        element={<PublicExamRoute />}
      />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardView />} />
        <Route path="/assessment/new" element={<AssessmentForm />} />
        <Route path="/assessment/:id/edit" element={<AssessmentForm />} />
        <Route path="/assessment/:id" element={<AssessmentDetail />} />
        <Route path="/analytics" element={<AnalyticsView />} />
        <Route path="/my-responses" element={<MyResponsesView />} />
        <Route path="/profile" element={<ProfileView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function PublicExamRoute() {
  const params = window.location.pathname.match(/^\/public\/([a-f0-9-]{36})\/?$/i)
  const linkId = params?.[1]
  if (!linkId) return <Navigate to="/" replace />
  return <PublicExam linkId={linkId} apiUrl={API_URL} />
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
        <Toaster position="top-right" richColors closeButton />
      </AppProvider>
    </BrowserRouter>
  )
}
