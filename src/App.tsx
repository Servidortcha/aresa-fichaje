import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Empleado from './pages/Empleado'
import Admin from './pages/Admin'

function Protected({ children, roles }: { children: React.ReactNode; roles?: ('admin' | 'empleado')[] }) {
  const { userId, profile, loading } = useAuth()
  if (loading) return <div className="p-10 text-center">Cargando...</div>
  if (!userId) return <Navigate to="/login" replace />
  if (roles && profile && !roles.includes(profile.rol)) {
    return <Navigate to={profile.rol === 'admin' ? '/admin' : '/fichar'} replace />
  }
  return <>{children}</>
}

function HomeRedirect() {
  const { profile, userId, loading } = useAuth()
  if (loading) return <div className="p-10 text-center">Cargando...</div>
  if (!userId) return <Navigate to="/login" replace />
  if (profile?.rol === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/fichar" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout><HomeRedirect /></Layout>} />
          <Route path="/fichar" element={<Layout><Protected roles={['empleado', 'admin']}><Empleado /></Protected></Layout>} />
          <Route path="/admin" element={<Layout><Protected roles={['admin']}><Admin /></Protected></Layout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
