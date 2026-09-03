import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-paper relative">
      <header className="bg-white/90 backdrop-blur border-b border-line sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo-horizontal.png" alt="Aresa" className="h-7 w-auto hidden sm:block" />
            <span className="w-8 h-8 bg-ink text-paper grid place-items-center rounded font-display font-bold sm:hidden">A</span>
            <span className="font-display font-semibold text-ink sm:hidden">Aresa Fichaje</span>
            <span className="hidden md:inline text-xs font-normal bg-green/10 text-green px-2 py-1 rounded-full">verificado</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {profile && (
              <>
                <span className="hidden sm:inline text-ink/60">{profile.nombre} · {profile.rol}</span>
                <span className="px-2 py-1 bg-paper border border-line rounded text-xs text-ink">{profile.email}</span>
                {profile.rol === 'admin' && <Link to="/admin" className="px-3 py-1.5 bg-ink text-paper rounded">Admin</Link>}
                {profile.rol === 'empleado' && <><Link to="/fichar" className="px-3 py-1.5 bg-ink text-paper rounded">Fichar</Link><Link to="/mis-fichajes" className="px-3 py-1.5 border border-line bg-white rounded">Fichajes</Link></>}
                {profile.rol === 'admin' && <Link to="/mis-fichajes" className="px-3 py-1.5 border border-line bg-white rounded">Mis fichajes</Link>}
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
