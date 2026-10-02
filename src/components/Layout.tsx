import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  return (
    <div className="min-h-screen bg-paper relative">
      <header className="bg-white/90 backdrop-blur border-b border-line sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            {profile && (
              <button onClick={()=>window.dispatchEvent(new CustomEvent('aresa:menu'))} aria-label="Abrir menú" className="lg:hidden w-9 h-9 grid place-items-center rounded-full border border-line bg-white text-ink text-lg hover:bg-paper">☰</button>
            )}
            <Link to="/" className="flex items-center gap-2 sm:gap-3">
              <img src="/logo-horizontal.png" alt="Aresa" className="h-6 sm:h-7 w-auto" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
              <span className="hidden sm:inline font-display font-semibold text-ink">Aresa Fichaje</span>
              <span className="hidden lg:inline text-xs font-normal bg-green-100 text-green-700 px-2 py-1 rounded-full">verificado</span>
            </Link>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm flex-wrap">
            {profile && (
              <>
                <span className="hidden md:inline text-ink/60 text-xs">{profile.nombre} · {profile.rol}</span>
                <span className="hidden sm:inline px-2 py-1 bg-paper border border-line rounded text-xs text-ink max-w-[160px] truncate">{profile.email}</span>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">{children}</main>
    </div>
  )
}
