import { Link, Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'

const nav = [
  { to: '/admin', label: 'Dashboard', exact: true, icon: '◧' },
  { to: '/admin/sucursales', label: 'Sucursales', icon: '⌖' },
  { to: '/admin/sucursales/nueva', label: 'Nueva Sucursal', icon: '+', primary: true },
  { to: '/admin/fichajes', label: 'Fichajes', icon: '☷' },
  { to: '/admin/solicitudes', label: 'Solicitudes', icon: '✉' },
  { to: '/admin/usuarios', label: 'Usuarios', icon: '◐' },
]

export default function AdminLayout(){
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  // cierra drawer al navegar en mobile
  useEffect(()=>{ setOpen(false) },[loc.pathname])
  // bloquea scroll body cuando drawer abierto en mobile
  useEffect(()=>{ if(open) document.body.style.overflow='hidden'; else document.body.style.overflow=''; return ()=>{ document.body.style.overflow='' } },[open])

  return (
    <div className="flex gap-4">
      {/* Botón hamburguesa mobile */}
      <button onClick={()=>setOpen(v=>!v)} className="lg:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-ink text-white shadow-lg grid place-items-center text-xl">
        {open ? '✕' : '☰'}
      </button>

      {/* Overlay mobile */}
      {open && <div onClick={()=>setOpen(false)} className="lg:hidden fixed inset-0 bg-black/40 z-30" />}

      {/* Sidebar */}
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
          <div className="font-display font-bold text-lg leading-none">Aresa Fichaje</div>
          <div className="text-white/70 text-xs mt-1">Panel admin</div>
        </div>
        <nav className="flex-1 p-3 space-y-1.5 overflow-auto">
          {nav.map(n=>{
            const active = n.exact ? loc.pathname===n.to : loc.pathname.startsWith(n.to)
            const isPrimary = (n as any).primary
            return <Link key={n.to} to={n.to} className={`
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition
              ${isPrimary ? (active ? 'bg-red-600 text-white shadow' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100') : ''}
              ${!isPrimary && active ? 'bg-ink text-white shadow' : ''}
              ${!isPrimary && !active ? 'hover:bg-paper border border-transparent hover:border-line text-ink' : ''}
            `}>
              <span className={`w-8 h-8 grid place-items-center rounded-lg text-xs font-bold shrink-0 ${isPrimary ? 'bg-white/20' : active ? 'bg-white/15' : 'bg-paper border border-line'}`}>{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {active && !isPrimary && <span className="w-2 h-2 rounded-full bg-white/80 shrink-0" />}
            </Link>
          })}
        </nav>
        <div className="p-3 border-t border-line bg-paper text-xs text-gray-500 shrink-0">
          <div className="font-medium text-ink">¿Necesitás ayuda?</div>
          <div>Usá Solicitudes para aprobar horas</div>
          <Link to="/admin/fichajes" className="inline-block mt-2 text-xs border bg-white px-3 py-1 rounded-full hover:bg-white">Ver fichajes →</Link>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Barra superior mobile: muestra sección actual + botón abrir */}
        <div className="lg:hidden bg-white border border-line rounded-xl p-3 flex items-center justify-between shadow-sm">
          <div className="text-sm"><span className="text-gray-500">Admin / </span><span className="font-bold text-ink">{nav.find(n=> n.exact ? loc.pathname===n.to : loc.pathname.startsWith(n.to))?.label ?? 'Panel'}</span></div>
          <button onClick={()=>setOpen(true)} className="px-3 py-1.5 rounded-full bg-ink text-white text-sm">Menú</button>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
