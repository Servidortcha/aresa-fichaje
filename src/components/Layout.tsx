import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-paper relative">
      <header className="bg-white/90 backdrop-blur border-b border-line sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 sm:gap-3">
            <img src="/logo-horizontal.png" alt="Aresa" className="h-6 sm:h-7 w-auto hidden sm:block" />
            <span className="w-7 h-7 sm:w-8 sm:h-8 bg-ink text-paper grid place-items-center rounded font-display font-bold sm:hidden text-sm">A</span>
            <span className="font-display font-semibold text-ink sm:hidden text-sm">Aresa</span>
            <span className="hidden lg:inline text-xs font-normal bg-green/10 text-green px-2 py-1 rounded-full">verificado</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm flex-wrap">
            {profile && (
              <>
                <span className="hidden md:inline text-ink/60 text-xs">{profile.nombre} · {profile.rol}</span>
                <span className="hidden sm:inline px-2 py-1 bg-paper border border-line rounded text-xs text-ink max-w-[160px] truncate">{profile.email}</span>
                {profile.rol === 'admin' && <Link to="/admin" className="px-2.5 sm:px-3 py-1.5 bg-ink text-paper rounded text-xs sm:text-sm">Admin</Link>}
                {profile.rol === 'empleado' && <><Link to="/fichar" className="px-2.5 sm:px-3 py-1.5 bg-ink text-paper rounded text-xs sm:text-sm">Fichar</Link><Link to="/mis-fichajes" className="px-2.5 sm:px-3 py-1.5 border border-line bg-white rounded text-xs sm:text-sm">Fichajes</Link></>}
                {profile.rol === 'admin' && <Link to="/mis-fichajes" className="px-2.5 sm:px-3 py-1.5 border border-line bg-white rounded text-xs sm:text-sm hidden sm:inline">Mis fichajes</Link>}
                <button onClick={signOut} className="px-2.5 sm:px-3 py-1.5 border border-line rounded bg-white text-xs sm:text-sm">Salir</button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">{children}</main>
    </div>
  )
}
