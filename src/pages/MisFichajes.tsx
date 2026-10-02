import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

type Fichaje = {
  id: string
  tipo: 'entrada' | 'pausa_inicio' | 'pausa_fin' | 'salida'
  created_at: string
  direccion: string | null
  foto_url: string | null
}

// jornadas individuales - homogéneo con Empleado.tsx:11 (soporta pausa_inicio/pausa_fin)
function extraerJornadas(fichajesAsc: Fichaje[]): { entrada: Fichaje; salida: Fichaje | null; ms: number | null; conPausa: boolean }[] {
  const jornadas: { entrada: Fichaje; salida: Fichaje | null; ms: number | null; conPausa: boolean }[] = []
  let cur: Fichaje | null = null
  let openStart: number | null = null
  let totalMs = 0
  let conPausa = false
  for (const f of fichajesAsc) {
    const t = new Date(f.created_at).getTime()
    if (f.tipo === 'entrada') {
      if (cur && openStart !== null) {
        // jornada previa sin cerrar
        jornadas.push({ entrada: cur, salida: null, ms: null, conPausa })
      }
      cur = f; openStart = t; totalMs = 0; conPausa = false
    } else if (f.tipo === 'pausa_inicio' && openStart !== null) {
      totalMs += t - openStart; openStart = null; conPausa = true
    } else if (f.tipo === 'pausa_fin' && openStart === null) {
      openStart = t
    } else if (f.tipo === 'salida' && cur) {
      if (openStart !== null) totalMs += t - openStart
      jornadas.push({ entrada: cur, salida: f, ms: totalMs, conPausa })
      cur = null; openStart = null; totalMs = 0; conPausa = false
    }
  }
  if (cur) jornadas.push({ entrada: cur, salida: null, ms: null, conPausa })
  return jornadas
}
function formatHoras(ms: number): string {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')} hs`
}

function getWeekRange(dateStr:string){
  const d=new Date(dateStr+'T12:00:00')
  const day=d.getDay() // 0 dom
  const diff = day===0 ? -6 : 1-day // lunes inicio
  const mon=new Date(d); mon.setDate(d.getDate()+diff)
  const sun=new Date(mon); sun.setDate(mon.getDate()+6)
  return { start: mon.toISOString().slice(0,10), end: sun.toISOString().slice(0,10) }
}

export default function MisFichajes(){
  const { userId } = useAuth()
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'dia'|'semana'|'mes'|'todo'>('todo')
  const [fechaFiltro, setFechaFiltro] = useState<string>(new Date().toISOString().slice(0,10))
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [sucursales, setSucursales] = useState<any[]>([])
  const [showSol, setShowSol] = useState<{ open:boolean, fichaje?:Fichaje, tipo:'modificacion'|'creacion' }>({ open:false, tipo:'creacion' })
  const [solForm, setSolForm] = useState({ fecha:'', hora:'', sucursal_id:'', motivo:'', tipo_fichaje:'entrada' as 'entrada'|'salida' })
  const [msg, setMsg] = useState<string|null>(null)

  useEffect(()=>{
    if(!userId) return
    setLoading(true)
    supabase.from('fichajes').select('id,tipo,created_at,direccion,foto_url').eq('user_id', userId).order('created_at', { ascending: false }).limit(500)
      .then(({ data })=>{ setFichajes((data as any) ?? []); setLoading(false) })
    supabase.from('solicitudes_modificacion').select('*').eq('user_id', userId).order('created_at', {ascending:false}).then(({ data })=> setSolicitudes((data as any) ?? []))
    supabase.from('geocercas').select('id,nombre,provincia').eq('activa', true).order('nombre').then(({ data })=> setSucursales((data as any) ?? []))
  },[userId])

  const reloadSols = async()=>{
    const { data } = await supabase.from('solicitudes_modificacion').select('*').eq('user_id', userId!).order('created_at', {ascending:false})
    setSolicitudes((data as any) ?? [])
  }

  const fichajesFiltrados = useMemo(()=>{
    if(filtro==='todo') return fichajes
    if(filtro==='dia') return fichajes.filter(f=> f.created_at.slice(0,10)===fechaFiltro)
    if(filtro==='mes') return fichajes.filter(f=> f.created_at.slice(0,7)===fechaFiltro.slice(0,7))
    if(filtro==='semana'){
      const { start, end } = getWeekRange(fechaFiltro)
      return fichajes.filter(f=>{ const d=f.created_at.slice(0,10); return d>=start && d<=end })
    }
    return fichajes
  },[fichajes, filtro, fechaFiltro])

  const porDia = useMemo(()=>{
    const map = new Map<string, Fichaje[]>()
    for(const f of fichajesFiltrados){
      const dia = f.created_at.slice(0,10)
      if(!map.has(dia)) map.set(dia, [])
      map.get(dia)!.push(f)
    }
    const entries = Array.from(map.entries()).sort((a,b)=> b[0].localeCompare(a[0]))
    return entries.map(([dia, list])=>{
      const asc = [...list].sort((a,b)=> a.created_at.localeCompare(b.created_at))
      const jornadas = extraerJornadas(asc)
      const tieneAbierto = jornadas.some(j=> j.salida===null)
      return { dia, list: list.sort((a,b)=> a.created_at.localeCompare(b.created_at)), jornadas, tieneAbierto }
    })
  },[fichajesFiltrados])

  const openSolicitud = (tipo:'modificacion'|'creacion', f?:Fichaje)=>{
    const now=new Date()
    if(tipo==='modificacion' && f){
      const d=new Date(f.created_at)
      setSolForm({ fecha: d.toISOString().slice(0,10), hora: d.toTimeString().slice(0,5), sucursal_id:'', motivo:'', tipo_fichaje: f.tipo==='salida' ? 'salida':'entrada' })
    } else {
      setSolForm({ fecha: now.toISOString().slice(0,10), hora: now.toTimeString().slice(0,5), sucursal_id:'', motivo:'', tipo_fichaje:'entrada' })
    }
    setShowSol({ open:true, fichaje:f, tipo })
    setMsg(null)
  }

  const enviarSolicitud = async()=>{
    if(!solForm.fecha || !solForm.hora || !solForm.motivo.trim()) return setMsg('Completa fecha, hora y motivo')
    if(!userId) return
    const payload:any = {
      user_id: userId,
      tipo: showSol.tipo,
      fecha_solicitada: solForm.fecha,
      hora_solicitada: solForm.hora,
      sucursal_id: solForm.sucursal_id || null,
      motivo: solForm.motivo.trim(),
      estado: 'pendiente',
      tipo_fichaje: solForm.tipo_fichaje, // P0 fix: permite alta como entrada o salida
    }
    if(showSol.tipo==='modificacion' && showSol.fichaje) payload.fichaje_id = showSol.fichaje.id
    const { error } = await supabase.from('solicitudes_modificacion').insert(payload)
    if(error) {
      // fallback si columna tipo_fichaje no existe (migración pendiente)
      if(error.message.includes('tipo_fichaje')) {
        delete payload.tipo_fichaje
        const { error:e2 } = await supabase.from('solicitudes_modificacion').insert(payload)
        if(e2) return setMsg('Error: '+e2.message)
      } else return setMsg('Error: '+error.message)
    }
    setShowSol({ open:false, tipo:'creacion' }); setMsg('Solicitud enviada ✓ — queda pendiente de aprobación'); reloadSols()
  }

  if(loading) return <div className="p-10 text-center">Cargando fichajes...</div>

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden shadow-lg text-white bg-gradient-to-br from-ink via-[#1E4A7A] to-[#2E6F9E] relative">
        <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 14px)' }} />
        <div className="relative p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-display font-bold">Mis fichajes</h2>
              <p className="text-white/70 text-sm">Tus horas, claras y sin vueltas</p>
            </div>
            <button onClick={()=>openSolicitud('creacion')} className="shrink-0 px-4 py-2 bg-white text-ink rounded-full text-sm font-bold shadow hover:bg-paper transition">+ Solicitar alta</button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-5 text-center">
            {[
              { label:'Jornadas', value: porDia.flatMap(d=>d.jornadas).length },
              { label:'Días', value: porDia.length },
              { label:'Registros', value: fichajesFiltrados.length },
            ].map(s=>(
              <div key={s.label} className="bg-white/10 border border-white/20 rounded-xl p-3">
                <div className="text-2xl font-bold leading-none">{s.value}</div>
                <div className="text-[11px] text-white/70 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center mt-4">
            {(['todo','dia','semana','mes'] as const).map(m=>(
              <button key={m} onClick={()=>setFiltro(m)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${filtro===m?'bg-white text-ink border-white':'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}>{m==='todo'?'Todo':m==='dia'?'Día':m==='semana'?'Semana':'Mes'}</button>
            ))}
            {filtro==='dia' && <input type="date" value={fechaFiltro} onChange={e=>setFechaFiltro(e.target.value)} className="bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-xs text-white [color-scheme:dark]" />}
            {filtro==='semana' && <input type="date" value={fechaFiltro} onChange={e=>setFechaFiltro(e.target.value)} className="bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-xs text-white [color-scheme:dark]" />}
            {filtro==='mes' && <input type="month" value={fechaFiltro.slice(0,7)} onChange={e=>setFechaFiltro(e.target.value+'-01')} className="bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-xs text-white [color-scheme:dark]" />}
          </div>
          {filtro!=='todo' && <p className="text-xs text-white/60 mt-2">{filtro==='semana' ? `Semana ${getWeekRange(fechaFiltro).start} al ${getWeekRange(fechaFiltro).end} · ` : ''}{fichajesFiltrados.length} registros</p>}
        </div>
      </div>

      {solicitudes.length>0 && (
        <div className="bg-white border p-4 rounded-2xl shadow">
          <h3 className="font-bold text-sm">Mis solicitudes ({solicitudes.length})</h3>
          <div className="mt-2 space-y-2">
            {solicitudes.slice(0,5).map(s=>(
              <div key={s.id} className="flex justify-between items-center bg-paper border border-line rounded-xl p-2 text-xs">
                <span>{s.tipo==='creacion'?'Alta':'Modificación'} · {s.fecha_solicitada} {s.hora_solicitada.slice(0,5)} · {s.motivo.slice(0,40)}</span>
                <span className={`px-2 py-1 rounded-full font-bold ${s.estado==='pendiente'?'bg-yellow-100 text-yellow-800':s.estado==='aprobada'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{s.estado}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <div className="p-3 rounded-xl border text-sm bg-blue-50 border-blue-200">{msg}</div>}

      {porDia.length===0 && (
        <div className="bg-white p-8 rounded-2xl shadow text-center">
          <img src="/icono.png" alt="" className="w-14 h-14 mx-auto opacity-40" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
          <p className="text-sm text-gray-500 mt-3">Aún no tienes fichajes<br />cuando fiches, aparecen acá</p>
          <Link to="/fichar" className="inline-block mt-4 px-5 py-2.5 bg-ink text-paper rounded-xl text-sm font-bold">Ir a fichar →</Link>
        </div>
      )}

      {porDia.map(({ dia, list, jornadas, tieneAbierto })=>(
        <div key={dia} className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <div className="flex justify-between items-center gap-2">
              <div className="font-bold capitalize">{new Date(dia+'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'2-digit', month:'long' })}</div>
              {tieneAbierto && <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-bold">en curso</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{jornadas.length} {jornadas.length === 1 ? 'jornada' : 'jornadas'} · {list.length} registros</div>
            {jornadas.length>0 && (
              <div className="mt-3 grid gap-2">
                {jornadas.map((j, idx)=>(
                  <div key={idx} className="flex justify-between items-center bg-white border border-line rounded-xl px-3 py-2 text-sm">
                    <span><span className="text-gray-500">Jornada {idx+1}</span> · {new Date(j.entrada.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} → {j.salida ? new Date(j.salida.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '...'}</span>
                    <span className="font-mono font-bold">{j.ms !== null ? formatHoras(j.ms) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-2">
            <div className="ml-2 border-l-2 border-gray-100">
              {list.map(f=>(
                <div key={f.id} className="relative pl-5 py-2.5">
                  <span className={`absolute -left-[7px] top-4 w-3 h-3 rounded-full ring-4 ring-white ${f.tipo==='entrada'?'bg-green-500':f.tipo==='salida'?'bg-red-500':'bg-amber-500'}`} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold capitalize text-sm">{f.tipo.replace('_', ' ')}</span>
                    <span className="text-sm font-mono text-gray-500">{new Date(f.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    <button onClick={()=>openSolicitud('modificacion', f)} className="ml-auto text-xs border border-line px-2.5 py-1 rounded-full bg-white hover:bg-paper">Solicitar corrección</button>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{f.direccion ?? ''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {showSol.open && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-[9999] p-4" onClick={()=>setShowSol({ open:false, tipo:'creacion' })}>
          <div className="bg-white rounded-xl p-5 w-full max-w-md space-y-3" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold">{showSol.tipo==='creacion' ? 'Solicitar alta de fichaje' : 'Solicitar modificación'}</h3>
            {showSol.fichaje && <p className="text-xs text-gray-500">Fichaje original: {showSol.fichaje.tipo} · {new Date(showSol.fichaje.created_at).toLocaleString()}</p>}
            <div className="grid gap-2">
              <label className="text-sm">Fecha solicitada<input type="date" value={solForm.fecha} onChange={e=>setSolForm({...solForm, fecha:e.target.value})} className="w-full border rounded px-3 py-2" /></label>
              <label className="text-sm">Hora solicitada<input type="time" value={solForm.hora} onChange={e=>setSolForm({...solForm, hora:e.target.value})} className="w-full border rounded px-3 py-2" /></label>
              <label className="text-sm">Tipo de fichaje
                <select value={solForm.tipo_fichaje} onChange={e=>setSolForm({...solForm, tipo_fichaje:e.target.value as any})} className="w-full border rounded px-3 py-2">
                  <option value="entrada">Entrada</option>
                  <option value="salida">Salida</option>
                </select>
              </label>
              <label className="text-sm">Sucursal solicitada
                <select value={solForm.sucursal_id} onChange={e=>setSolForm({...solForm, sucursal_id:e.target.value})} className="w-full border rounded px-3 py-2">
                  <option value="">Sin asignar / igual</option>
                  {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre} · {s.provincia}</option>)}
                </select>
              </label>
              <label className="text-sm">Motivo<input value={solForm.motivo} onChange={e=>setSolForm({...solForm, motivo:e.target.value})} placeholder="Olvidé fichar, error horario..." className="w-full border rounded px-3 py-2" /></label>
            </div>
            <div className="flex gap-2">
              <button onClick={enviarSolicitud} className="flex-1 bg-ink text-paper py-2 rounded font-bold">Enviar solicitud</button>
              <button onClick={()=>setShowSol({ open:false, tipo:'creacion' })} className="flex-1 border py-2 rounded">Cancelar</button>
            </div>
            <p className="text-xs text-gray-500">Quedará pendiente hasta que el administrador la apruebe y se aplique al registro.</p>
          </div>
        </div>
      )}

      <p className="text-xs text-center text-gray-400">Los fichajes son inmutables — usa solicitudes para correcciones.</p>
    </div>
  )
}
