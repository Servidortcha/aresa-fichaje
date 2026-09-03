import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Empleado from './pages/Empleado'
import Admin from './pages/Admin'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import Sucursales from './pages/admin/Sucursales'
import SucursalForm from './pages/admin/SucursalForm'
import Fichajes from './pages/admin/Fichajes'
import Solicitudes from './pages/admin/Solicitudes'
import MisFichajes from './pages/MisFichajes'

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
          <Route path="/mis-fichajes" element={<Layout><Protected roles={['empleado', 'admin']}><MisFichajes /></Protected></Layout>} />
          {/* Admin con páginas separadas - src/pages/admin/AdminLayout.tsx:1 */}
          <Route path="/admin" element={<Layout><Protected roles={['admin']}><AdminLayout /></Protected></Layout>}>
            <Route index element={<Dashboard />} />
            <Route path="sucursales" element={<Sucursales />} />
            <Route path="sucursales/nueva" element={<SucursalForm />} />
            <Route path="sucursales/:id" element={<SucursalForm />} />
            <Route path="fichajes" element={<Fichajes />} />
            <Route path="solicitudes" element={<Solicitudes />} />
          </Route>
          {/* legacy single page */}
          <Route path="/admin-old" element={<Layout><Protected roles={['admin']}><Admin /></Protected></Layout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
