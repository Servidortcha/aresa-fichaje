import { Link, Outlet, useLocation } from 'react-router-dom'

const nav = [
  { to: '/admin', label: 'Dashboard', exact: true },
  { to: '/admin/sucursales', label: 'Sucursales' },
  { to: '/admin/sucursales/nueva', label: '+ Nueva Sucursal' },
  { to: '/admin/fichajes', label: 'Fichajes' },
]

export default function AdminLayout(){
  const loc = useLocation()
  return (
    <div className="space-y-4">
      <div className="bg-white p-3 rounded-xl shadow flex flex-wrap gap-2">
        {nav.map(n=>{
          const active = n.exact ? loc.pathname===n.to : loc.pathname.startsWith(n.to)
          return <Link key={n.to} to={n.to} className={`px-4 py-2 rounded text-sm font-medium ${active?'bg-red-600 text-white':'bg-gray-100 hover:bg-gray-200'}`}>{n.label}</Link>
        })}
      </div>
      <Outlet />
    </div>
  )
}
