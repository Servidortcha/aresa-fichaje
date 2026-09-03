import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type Suc = { id:string, nombre:string, provincia?:string, lat:number, lng:number, radio_m:number, activa:boolean }
type Fich = { user_id:string, tipo:string, geocerca_id:string|null, created_at:string, dentro_geocerca:boolean, profiles?:{nombre:string,email:string} }

function formatHoras(ms:number){
  if(ms<0) ms=0
  const m=Math.floor(ms/60000), h=Math.floor(m/60), mm=m%60
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')} hs`
}

export default function Dashboard(){
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

      // traer últimos fichajes de hoy con perfiles
      const { data: fichs } = await supabase.from('fichajes').select('user_id,tipo,geocerca_id,created_at,dentro_geocerca,profiles(nombre,email)').gte('created_at', today+'T00:00:00').order('created_at', {ascending:false}).limit(500)
      const all = (fichs as any) as Fich[] ?? []
      // ultimo por usuario
      const lastByUser = new Map<string, Fich>()
      for(const f of all){
        if(!lastByUser.has(f.user_id)) lastByUser.set(f.user_id, f)
      }
      const map = new Map<string, {nombre:string,email:string, desde:string, ms:number}[]>()

      for(const [uid, f] of lastByUser){
        if(f.tipo === 'entrada'){
          const nombre = (f.profiles as any)?.nombre ?? uid.slice(0,8)
          const email = (f.profiles as any)?.email ?? ''
          const desde = f.created_at
          const ms = now - new Date(f.created_at).getTime()
          const key = f.geocerca_id ?? '__sin__'
          if(!map.has(key)) map.set(key, [])
          map.get(key)!.push({ nombre, email, desde, ms })
        } else if(f.tipo === 'salida'){
          // no trabajando
        } else {
          // pausas no se usan, si está en pausa igual se considera trabajando? ya no hay pausa
        }
      }
      // ordenar por tiempo
      for(const [, arr] of map) arr.sort((a,b)=> a.desde.localeCompare(b.desde))
      setTrabajandoPorSuc(map)
    })()
  },[now])



  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-2xl font-bold">Admin — Aresa Fichaje</h2>
        <p className="text-gray-500">Quién está trabajando ahora en cada sucursal (tiempo real, jornada individual)</p>
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="border rounded-xl p-4 bg-blue-50">
            <div className="text-sm text-gray-600">Sucursales / Frentes</div>
            <div className="text-3xl font-bold">{stats.sucursales}</div>
            <Link to="/admin/sucursales" className="text-sm text-blue-700 underline">Ver sucursales →</Link>
          </div>
          <div className="border rounded-xl p-4 bg-green-50">
            <div className="text-sm text-gray-600">Fichajes hoy</div>
            <div className="text-3xl font-bold">{stats.fichajesHoy}</div>
            <Link to="/admin/fichajes" className="text-sm text-green-700 underline">Ver fichajes →</Link>
          </div>
          <div className="border rounded-xl p-4 bg-amber-50">
            <div className="text-sm text-gray-600">Empleados</div>
            <div className="text-3xl font-bold">{stats.empleados}</div>
            <Link to="/admin/sucursales/nueva" className="text-sm text-amber-700 underline">+ Nueva sucursal</Link>
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-3">Trabajando ahora por sucursal</h3>
        {sucursales.length===0 && <p className="text-sm text-gray-500">Sin sucursales aún</p>}
        <div className="grid md:grid-cols-2 gap-4">
          {sucursales.map(s=>{
            const lista = trabajandoPorSuc.get(s.id) ?? []
            return (
              <div key={s.id} className="border rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold">{s.nombre} <span className="text-xs font-normal text-gray-500">{(s as any).provincia}</span></div>
                    <div className="text-xs text-gray-500">{s.lat.toFixed(4)}, {s.lng.toFixed(4)} · {s.radio_m} m · {s.activa ? 'Activa':'Inactiva'}</div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${lista.length>0?'bg-green-600 text-white':'bg-gray-100 text-gray-600'}`}>{lista.length} trabajando</span>
                </div>
                {lista.length===0 ? <p className="text-sm text-gray-400 mt-3">Nadie fichado como trabajando en esta sucursal hoy</p> : (
                  <div className="mt-3 space-y-2">
                    {lista.map(p=>(
                      <div key={p.email} className="flex justify-between items-center bg-green-50 border border-green-200 rounded p-2">
                        <div>
                          <div className="font-medium text-sm">{p.nombre}</div>
                          <div className="text-xs text-gray-600">{p.email} · desde {new Date(p.desde).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                        </div>
                        <div className="text-sm font-mono font-bold">{formatHoras(p.ms)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {/* fuera de sucursal */}
        {trabajandoPorSuc.get('__sin__') && (
          <div className="mt-4 border rounded-xl p-4 bg-yellow-50">
            <div className="font-bold">Fuera de sucursal / sin geocerca</div>
            <div className="mt-2 space-y-2">
              {trabajandoPorSuc.get('__sin__')!.map(p=>(
                <div key={p.email} className="flex justify-between bg-white border rounded p-2 text-sm"><span>{p.nombre} · {p.email}</span><span className="font-mono">{formatHoras(p.ms)}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/admin/sucursales/nueva" className="bg-red-600 text-white p-6 rounded-xl shadow text-center font-bold text-lg">+ Crear nueva sucursal<br/><span className="text-sm font-normal">DMS: 32°14'39.7"S 63°59'07.4"W · click en mapa · radio variable</span></Link>
        <Link to="/admin/fichajes" className="bg-gray-900 text-white p-6 rounded-xl shadow text-center font-bold text-lg">Ver registro de fichajes<br/><span className="text-sm font-normal">Tabla + mapa + filtros + Excel + editar</span></Link>
      </div>
    </div>
  )
}
