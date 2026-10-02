import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export default function EmpleadoLayout(){
  const loc = useLocation()
  const nav = useNavigate()
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  useEffect(()=>{ setOpen(false) },[loc.pathname])
  useEffect(()=>{ if(open) document.body.style.overflow='hidden'; else document.body.style.overflow=''; return ()=>{ document.body.style.overflow='' } },[open])

  const items = [
    { to: '/fichar', label: 'Inicio', desc: 'Fichar jornada', icon: '◧' },
    { to: '/mis-fichajes', label: 'Mis fichajes', desc: 'Horas por día', icon: '☷' },
  ]
  if (profile?.rol === 'admin') items.push({ to: '/admin', label: 'Panel admin', desc: 'Gestión general', icon: '◐' })

  const salir = async()=>{ await signOut(); nav('/login', { replace:true }) }
  const actual = items.find(n=> loc.pathname===n.to)?.label ?? 'Panel'

  return (
    <div className="flex gap-4">
      <button onClick={()=>setOpen(v=>!v)} className="lg:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-ink text-white shadow-lg grid place-items-center text-xl">
        {open ? '✕' : '☰'}
      </button>

      {open && <div onClick={()=>setOpen(false)} className="lg:hidden fixed inset-0 bg-black/40 z-30" />}

      <aside className={`
        fixed lg:sticky top-0 lg:top-[68px] z-30 h-[100dvh] lg:h-[calc(100vh-76px)]
        w-[78vw] max-w-[300px] lg:w-[240px] shrink-0
        bg-white border border-line lg:rounded-2xl shadow-xl lg:shadow
        flex flex-col overflow-hidden
        transition-transform duration-300 lg:transition-none
        ${open ? 'translate-x-0 left-0' : '-translate-x-full lg:translate-x-0'}
        lg:left-auto
      `}>
        <div className="p-4 border-b border-line bg-gradient-to-br from-ink to-[#2E6F9E] text-white shrink-0">
          <img src="/logo-blanco.png" alt="Aresa" className="h-7 w-auto" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
          <div className="text-sm font-medium mt-2 truncate">{profile?.nombre ?? 'Mi cuenta'}</div>
          <div className="text-white/70 text-xs truncate">{profile?.email ?? ''}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1.5 overflow-auto">
          {items.map(n=>{
            const active = loc.pathname===n.to
            return <Link key={n.to} to={n.to} className={`
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition
              ${active ? 'bg-ink text-white shadow' : 'hover:bg-paper border border-transparent hover:border-line text-ink'}
            `}>
              <span className={`w-8 h-8 grid place-items-center rounded-lg text-xs font-bold shrink-0 ${active ? 'bg-white/15' : 'bg-paper border border-line'}`}>{n.icon}</span>
              <span className="flex-1"><span className="block">{n.label}</span><span className={`block text-[11px] font-normal ${active ? 'text-white/70' : 'text-gray-500'}`}>{n.desc}</span></span>
              {active && <span className="w-2 h-2 rounded-full bg-white/80 shrink-0" />}
            </Link>
          })}
        </nav>
        <div className="p-3 border-t border-line bg-paper shrink-0">
          <button onClick={salir} className="w-full py-2.5 rounded-xl border bg-white text-sm font-medium hover:bg-gray-50">Salir</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-4">
        <div className="lg:hidden bg-white border border-line rounded-xl p-3 flex items-center justify-between shadow-sm">
          <div className="text-sm"><span className="text-gray-500">Aresa / </span><span className="font-bold text-ink">{actual}</span></div>
          <button onClick={()=>setOpen(true)} className="px-3 py-1.5 rounded-full bg-ink text-white text-sm">Menú</button>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
