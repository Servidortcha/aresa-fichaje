import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

type Suc = { id:string, nombre:string, provincia?:string, lat:number, lng:number, radio_m:number, activa:boolean }
type Fich = { user_id:string, tipo:string, geocerca_id:string|null, created_at:string, dentro_geocerca:boolean, profiles?:{nombre:string,email:string} }

function formatHoras(ms:number){
  if(ms<0) ms=0
  const m=Math.floor(ms/60000), h=Math.floor(m/60), mm=m%60
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
}

export default function Dashboard(){
  const { profile } = useAuth()
  const [stats, setStats] = useState({ sucursales:0, fichajesHoy:0, empleados:0 })
  const [sucursales, setSucursales] = useState<Suc[]>([])
  const [trabajandoPorSuc, setTrabajandoPorSuc] = useState<Map<string, {nombre:string,email:string, desde:string, ms:number}[]>>(new Map())
  const [now, setNow] = useState(Date.now())

  useEffect(()=>{
    const i=setInterval(()=>setNow(Date.now()), 30000)
    return()=>clearInterval(i)
  },[])

  useEffect(()=>{
    (async()=>{
      const { count: cSuc } = await supabase.from('geocercas').select('*', { count:'exact', head:true })
      const today = new Date().toISOString().slice(0,10)
      const { count: cFich } = await supabase.from('fichajes').select('*', { count:'exact', head:true }).gte('created_at', today)
      const { count: cEmp } = await supabase.from('profiles').select('*', { count:'exact', head:true }).eq('rol','empleado')
      setStats({ sucursales: cSuc??0, fichajesHoy: cFich??0, empleados: cEmp??0 })

      const { data: sucs } = await supabase.from('geocercas').select('id,nombre,provincia,lat,lng,radio_m,activa').order('nombre')
      setSucursales((sucs as any) ?? [])

      const { data: fichs } = await supabase.from('fichajes').select('user_id,tipo,geocerca_id,created_at,dentro_geocerca,profiles(nombre,email)').gte('created_at', today+'T00:00:00').order('created_at', {ascending:false}).limit(500)
      const all = (fichs as any) as Fich[] ?? []
      const lastByUser = new Map<string, Fich>()
      for(const f of all) if(!lastByUser.has(f.user_id)) lastByUser.set(f.user_id, f)
      const map = new Map<string, {nombre:string,email:string, desde:string, ms:number}[]>()
      for(const [uid, f] of lastByUser){
        if(f.tipo === 'entrada'){
          const nombre = (f.profiles as any)?.nombre ?? uid.slice(0,8)
          const email = (f.profiles as any)?.email ?? ''
          const ms = now - new Date(f.created_at).getTime()
          const key = f.geocerca_id ?? '__sin__'
          if(!map.has(key)) map.set(key, [])
          map.get(key)!.push({ nombre, email, desde: f.created_at, ms })
        }
      }
      for(const [, arr] of map) arr.sort((a,b)=> a.desde.localeCompare(b.desde))
      setTrabajandoPorSuc(map)
    })()
  },[now])

  const totalTrabajando = Array.from(trabajandoPorSuc.values()).flat().length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#163A5F] to-[#2E6F9E] rounded-2xl p-6 text-white shadow relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ background: 'repeating-linear-gradient(90deg, #14C3B0 0 8px, transparent 8px 16px)' }}></div>
        <div className="relative flex justify-between items-start">
          <div>
            <p className="text-white/70 text-sm">Bienvenido, {profile?.nombre ?? 'Admin'} · {new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })}</p>
            <h1 className="text-3xl font-display font-bold mt-1">Aresa Fichaje</h1>
            <p className="text-white/80 mt-1">Control en tiempo real de sucursales y fichajes</p>
          </div>
          <div className="hidden md:flex gap-2">
            <Link to="/admin/sucursales/nueva" className="bg-white text-[#163A5F] px-4 py-2 rounded-full font-semibold text-sm shadow hover:bg-paper">+ Nueva sucursal</Link>
            <Link to="/admin/fichajes" className="bg-white/10 backdrop-blur text-white border border-white/30 px-4 py-2 rounded-full font-semibold text-sm">Ver fichajes</Link>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            { label:'Sucursales', value: stats.sucursales, sub: 'frentes activos', icon:'🏢', to:'/admin/sucursales' },
            { label:'Trabajando ahora', value: totalTrabajando, sub: `${stats.fichajesHoy} fichajes hoy`, icon:'🟢', to:'/admin/fichajes' },
            { label:'Empleados', value: stats.empleados, sub: 'operadores', icon:'👷', to:'/admin/fichajes' },
          ].map(c=>(
            <Link key={c.label} to={c.to} className="bg-white/95 rounded-xl p-4 text-gray-900 hover:scale-[1.02] transition">
              <div className="text-sm text-gray-500 flex items-center gap-2"><span>{c.icon}</span> {c.label}</div>
              <div className="text-3xl font-bold mt-1">{c.value}</div>
              <div className="text-xs text-gray-500">{c.sub}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Acciones rápidas - UX mejorada */}
      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/admin/sucursales/nueva" className="group bg-white border rounded-2xl p-5 flex gap-4 items-center hover:shadow-lg hover:border-red-200 transition text-left">
          <div className="w-12 h-12 rounded-xl bg-red-600 text-white grid place-items-center text-xl group-hover:scale-110 transition">＋</div>
          <div className="flex-1">
            <div className="font-bold text-gray-900">Crear nueva sucursal</div>
          </div>
          <span className="text-gray-400 group-hover:text-red-600">→</span>
        </Link>
        <Link to="/admin/fichajes" className="group bg-white border rounded-2xl p-5 flex gap-4 items-center hover:shadow-lg hover:border-gray-300 transition text-left">
          <div className="w-12 h-12 rounded-xl bg-gray-900 text-white grid place-items-center text-xl group-hover:scale-110 transition">☰</div>
          <div className="flex-1">
            <div className="font-bold text-gray-900">Ver registro de fichajes</div>
          </div>
          <span className="text-gray-400 group-hover:text-gray-900">→</span>
        </Link>
      </div>

      {/* Trabajando por sucursal - UX cards */}
      <div className="bg-white rounded-2xl shadow border p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">Trabajando ahora por sucursal</h3>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">{totalTrabajando} activos</span>
        </div>
        {sucursales.length===0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-xl bg-gray-50">
            <p className="text-gray-500">Aún no hay sucursales</p>
            <Link to="/admin/sucursales/nueva" className="inline-block mt-3 bg-red-600 text-white px-4 py-2 rounded-full text-sm">Crear la primera</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {sucursales.map(s=>{
              const lista = trabajandoPorSuc.get(s.id) ?? []
              return (
                <div key={s.id} className="border rounded-xl p-4 hover:shadow-sm transition bg-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold flex items-center gap-2">{s.nombre} <span className={`w-2 h-2 rounded-full ${s.activa?'bg-green-500':'bg-gray-300'}`}></span></div>
                      <div className="text-xs text-gray-500">{(s as any).provincia} · {s.radio_m} m · {s.activa ? 'Activa' : 'Inactiva'}</div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${lista.length>0?'bg-green-600 text-white':'bg-gray-100 text-gray-600'}`}>{lista.length} trabajando</span>
                  </div>
                  {lista.length===0 ? <p className="text-sm text-gray-400 mt-3 bg-gray-50 rounded p-2">Sin personal activo</p> : (
                    <div className="mt-3 space-y-2">
                      {lista.map(p=>(
                        <div key={p.email} className="flex justify-between items-center bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="flex gap-3 items-center">
                            <div className="w-8 h-8 rounded-full bg-green-600 text-white grid place-items-center text-xs font-bold">{p.nombre.slice(0,2).toUpperCase()}</div>
                            <div>
                              <div className="font-medium text-sm">{p.nombre}</div>
                              <div className="text-xs text-gray-600">desde {new Date(p.desde).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-mono font-bold bg-white px-2 py-1 rounded border">{formatHoras(p.ms)}</div>
                            <div className="text-xs text-green-700">en curso</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link to={`/admin/sucursales/${s.id}`} className="text-xs text-blue-600 hover:underline mt-3 inline-block">Ver / Editar sucursal →</Link>
                </div>
              )
            })}
          </div>
        )}
        {trabajandoPorSuc.get('__sin__') && (
          <div className="mt-4 border rounded-xl p-4 bg-amber-50">
            <div className="font-bold text-amber-800">Fuera de sucursal</div>
            <div className="mt-2 space-y-2">
              {trabajandoPorSuc.get('__sin__')!.map(p=>(
                <div key={p.email} className="flex justify-between bg-white border rounded p-2 text-sm"><span>{p.nombre}</span><span className="font-mono font-bold">{formatHoras(p.ms)}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
