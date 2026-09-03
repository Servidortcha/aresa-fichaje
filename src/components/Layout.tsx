import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-red-700">
            <span className="w-8 h-8 bg-red-600 text-white grid place-items-center rounded">A</span>
            Aresa Fichaje
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {profile && (
              <>
                <span className="hidden sm:inline text-gray-600">{profile.nombre} · {profile.rol}</span>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs">{profile.email}</span>
                {profile.rol === 'admin' && <Link to="/admin" className="px-3 py-1.5 bg-red-600 text-white rounded">Admin</Link>}
                {profile.rol === 'empleado' && <><Link to="/fichar" className="px-3 py-1.5 bg-red-600 text-white rounded">Fichar</Link><Link to="/mis-fichajes" className="px-3 py-1.5 border bg-white rounded">Fichajes</Link></>}
                {profile.rol === 'admin' && <Link to="/mis-fichajes" className="px-3 py-1.5 border bg-white rounded">Mis fichajes</Link>}
                <button onClick={signOut} className="px-3 py-1.5 border rounded">Salir</button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
