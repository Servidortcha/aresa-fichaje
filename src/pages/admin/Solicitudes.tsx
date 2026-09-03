import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Solicitudes(){
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [sucursales, setSucursales] = useState<any[]>([])
  const [filtro, setFiltro] = useState<'pendiente'|'aprobada'|'rechazada'|'todo'>('pendiente')
  const [msg, setMsg] = useState<string|null>(null)

  const load = async()=>{
    const { data } = await supabase.from('solicitudes_modificacion').select('*').order('created_at', {ascending:false}).limit(200)
    const sols = (data as any) ?? []
    // enrich with profiles and sucursales
    const userIds = [...new Set(sols.map((s:any)=>s.user_id))]
    const { data: profs } = userIds.length ? await supabase.from('profiles').select('id,nombre,email').in('id', userIds) : { data: [] as any }
    const profMap = new Map((profs as any)?.map((p:any)=>[p.id, p]) ?? [])
    const { data: sucsAll } = await supabase.from('geocercas').select('id,nombre,provincia,lat,lng,radio_m').order('nombre')
    setSucursales((sucsAll as any) ?? [])
    const sucMap2 = new Map(((sucsAll as any) ?? []).map((s:any)=>[s.id, s]))
    const enriched = sols.map((s:any)=>({
      ...s,
      profiles: profMap.get(s.user_id),
      geocercas: s.sucursal_id ? sucMap2.get(s.sucursal_id) : null,
    }))
    setSolicitudes(enriched)
  }
  useEffect(()=>{ load() },[])

  const filtradas = solicitudes.filter(s=> filtro==='todo' ? true : s.estado===filtro)

  const aprobar = async(s:any)=>{
    const suc = sucursales.find(x=>x.id===s.sucursal_id)
    const newDate = new Date(`${s.fecha_solicitada}T${s.hora_solicitada}:00`)
    try{
      if(s.tipo==='modificacion' && s.fichaje_id){
        // recalcular coords si hay sucursal
        let lat:number | undefined, lng:number | undefined, geocerca_id:string|null = s.sucursal_id
        if(suc){ lat=suc.lat; lng=suc.lng }
        const update:any = { created_at: newDate.toISOString() }
        if(geocerca_id) { update.geocerca_id=geocerca_id; if(lat!==undefined) { update.lat=lat; update.lng=lng; update.dentro_geocerca=true; update.distancia_m=0 } }
        const { error } = await supabase.from('fichajes').update(update).eq('id', s.fichaje_id)
        if(error) throw error
      } else if(s.tipo==='creacion'){
        // crear fichaje: necesita tipo? por defecto entrada si no hay fichaje_id, inferir por hora? usamos entrada
        const tipo = 'entrada' // podría ser param, pero por ahora entrada
        const payload:any = {
          user_id: s.user_id,
          tipo,
          lat: suc ? suc.lat : -32.2426,
          lng: suc ? suc.lng : -63.542,
          direccion: suc ? suc.nombre : null,
          foto_url: null,
          dentro_geocerca: !!suc,
          geocerca_id: s.sucursal_id,
          distancia_m: 0,
          created_at: newDate.toISOString(),
        }
        const { error } = await supabase.from('fichajes').insert(payload)
        if(error) throw error
      }
      const { error:e2 } = await supabase.from('solicitudes_modificacion').update({ estado:'aprobada', respuesta_admin: 'Aprobada' }).eq('id', s.id)
      if(e2) throw e2
      setMsg('Solicitud aprobada ✓')
      load()
    }catch(e:any){ setMsg('Error: '+e.message) }
  }

  const rechazar = async(s:any)=>{
    const r = prompt('Motivo de rechazo (opcional)')
    const { error } = await supabase.from('solicitudes_modificacion').update({ estado:'rechazada', respuesta_admin: r ?? 'Rechazada' }).eq('id', s.id)
    if(error) setMsg(error.message); else { setMsg('Rechazada'); load() }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl shadow flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Solicitudes de modificación</h2>
          <p className="text-sm text-gray-500">Empleados solicitan corrección de horas — aprueba y se aplica al fichaje</p>
        </div>
        <div className="flex gap-2">
          {(['pendiente','aprobada','rechazada','todo'] as const).map(k=>(
            <button key={k} onClick={()=>setFiltro(k)} className={`px-3 py-1 rounded-full text-sm border ${filtro===k?'bg-ink text-paper':'bg-white'}`}>{k}</button>
          ))}
        </div>
      </div>
      {msg && <div className="bg-blue-50 border p-3 rounded text-sm">{msg}</div>}
      <div className="space-y-3">
        {filtradas.length===0 && <div className="bg-white p-8 rounded-xl shadow text-center text-gray-500">Sin solicitudes {filtro}</div>}
        {filtradas.map(s=>(
          <div key={s.id} className="bg-white border rounded-xl p-4">
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="font-bold">{s.profiles?.nombre} <span className="text-xs text-gray-500">{s.profiles?.email}</span></div>
                <div className="text-sm">{s.tipo==='creacion'?'Alta':'Modificación'} · {s.fecha_solicitada} {s.hora_solicitada.slice(0,5)} {s.geocercas ? `· ${s.geocercas.nombre} · ${s.geocercas.provincia}` : ''}</div>
                <div className="text-xs text-gray-600">Motivo: {s.motivo}</div>
                <div className="text-xs text-gray-400">Creada {new Date(s.created_at).toLocaleString()} {s.fichaje_id ? `· Fichaje ${s.fichaje_id.slice(0,8)}` : ''}</div>
                {s.respuesta_admin && <div className="text-xs text-gray-600 mt-1">Respuesta: {s.respuesta_admin}</div>}
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-bold h-fit ${s.estado==='pendiente'?'bg-yellow-100 text-yellow-800':s.estado==='aprobada'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{s.estado}</span>
            </div>
            {s.estado==='pendiente' && (
              <div className="flex gap-2 mt-3">
                <button onClick={()=>aprobar(s)} className="flex-1 bg-green-600 text-white py-2 rounded font-bold">Aprobar y aplicar</button>
                <button onClick={()=>rechazar(s)} className="flex-1 border py-2 rounded">Rechazar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
