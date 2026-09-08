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
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-white p-5 rounded-xl shadow flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Mis fichajes</h2>
          <p className="text-sm text-gray-500">Registro solo lectura — solicita modificación si hay error</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>openSolicitud('creacion')} className="px-3 py-2 bg-ink text-paper rounded text-sm">+ Solicitar alta</button>
          <Link to="/fichar" className="px-4 py-2 bg-gray-100 border rounded text-sm">← Fichar</Link>
        </div>
      </div>

      {solicitudes.length>0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          <h3 className="font-bold text-sm">Mis solicitudes ({solicitudes.length})</h3>
          <div className="mt-2 space-y-2">
            {solicitudes.slice(0,5).map(s=>(
              <div key={s.id} className="flex justify-between items-center bg-white border rounded p-2 text-xs">
                <span>{s.tipo==='creacion'?'Alta':'Modificación'} · {s.fecha_solicitada} {s.hora_solicitada.slice(0,5)} · {s.motivo.slice(0,40)}</span>
                <span className={`px-2 py-1 rounded font-bold ${s.estado==='pendiente'?'bg-yellow-100 text-yellow-800':s.estado==='aprobada'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{s.estado}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <div className="p-3 rounded border text-sm bg-blue-50">{msg}</div>}

      <div className="bg-white p-4 rounded-xl shadow space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium">Filtrar:</span>
          {(['todo','dia','semana','mes'] as const).map(m=>(
            <button key={m} onClick={()=>setFiltro(m)} className={`px-3 py-1 rounded-full text-sm border ${filtro===m?'bg-ink text-paper border-ink':'bg-white'}`}>{m==='todo'?'Todo':m==='dia'?'Día':m==='semana'?'Semana':'Mes'}</button>
          ))}
          {filtro==='dia' && <input type="date" value={fechaFiltro} onChange={e=>setFechaFiltro(e.target.value)} className="border rounded px-3 py-1" />}
          {filtro==='semana' && <input type="date" value={fechaFiltro} onChange={e=>setFechaFiltro(e.target.value)} className="border rounded px-3 py-1" />}
          {filtro==='mes' && <input type="month" value={fechaFiltro.slice(0,7)} onChange={e=>setFechaFiltro(e.target.value+'-01')} className="border rounded px-3 py-1" />}
          {filtro!=='todo' && <span className="text-xs text-gray-500">{filtro==='semana' ? `Semana ${getWeekRange(fechaFiltro).start} al ${getWeekRange(fechaFiltro).end}` : ''} · {fichajesFiltrados.length} fichajes</span>}
        </div>
        <div className="flex gap-4 text-center">
          <div className="flex-1 border rounded p-3 bg-gray-50">
            <div className="text-xs text-gray-600">Jornadas</div>
            <div className="text-2xl font-bold">{porDia.flatMap(d=>d.jornadas).length}</div>
          </div>
          <div className="flex-1 border rounded p-3">
            <div className="text-xs text-gray-600">Días con fichajes</div>
            <div className="text-2xl font-bold">{porDia.length}</div>
          </div>
          <div className="flex-1 border rounded p-3">
            <div className="text-xs text-gray-600">Fichajes totales</div>
            <div className="text-2xl font-bold">{fichajesFiltrados.length}</div>
          </div>
        </div>
      </div>

      {porDia.length===0 && <div className="bg-white p-8 rounded-xl shadow text-center text-gray-500">Aún no tienes fichajes</div>}

      {porDia.map(({ dia, list, jornadas, tieneAbierto })=>(
        <div key={dia} className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold">{new Date(dia+'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</div>
                <div className="text-xs text-gray-500">{dia} · {jornadas.length} jornada(s) · {list.length} fichajes {tieneAbierto && <span className="ml-2 bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">en curso</span>}</div>
              </div>
            </div>
            {jornadas.length>0 && (
              <div className="mt-3 grid gap-2">
                {jornadas.map((j, idx)=>(
                  <div key={idx} className="flex justify-between items-center bg-white border rounded p-2 text-sm">
                    <span> Jornada {idx+1}: {new Date(j.entrada.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} → {j.salida ? new Date(j.salida.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '...'}</span>
                    <span className="font-mono font-bold">{j.ms !== null ? formatHoras(j.ms) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="divide-y">
            {list.map(f=>(
              <div key={f.id} className="flex gap-3 p-3 items-center">
                <div className={`w-14 h-14 rounded-lg grid place-items-center text-white text-xs font-bold shrink-0 ${f.tipo==='entrada'?'bg-green-600':f.tipo==='salida'?'bg-red-600':'bg-amber-500'}`}>{f.tipo.slice(0,2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${f.tipo==='entrada'?'bg-green-100 text-green-700':f.tipo==='salida'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-800'}`}>{f.tipo}</span>
                    <span className="text-sm font-mono">{new Date(f.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    <button onClick={()=>openSolicitud('modificacion', f)} className="ml-auto text-xs border px-2 py-1 rounded bg-white">Solicitar corrección</button>
                  </div>
                  <div className="text-xs text-gray-500 truncate max-w-[260px]">{f.direccion ?? ''}</div>
                </div>
              </div>
            ))}
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
