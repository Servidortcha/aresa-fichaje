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

// jornadas individuales - no acumulable: cada entrada/salida es una jornada separada
function extraerJornadas(fichajesAsc: Fichaje[]): { entrada: Fichaje; salida: Fichaje | null; ms: number | null }[] {
  const jornadas: { entrada: Fichaje; salida: Fichaje | null; ms: number | null }[] = []
  let cur: Fichaje | null = null
  for (const f of fichajesAsc) {
    if (f.tipo === 'entrada') {
      if (cur) jornadas.push({ entrada: cur, salida: null, ms: null })
      cur = f
    } else if (f.tipo === 'salida' && cur) {
      const ms = new Date(f.created_at).getTime() - new Date(cur.created_at).getTime()
      jornadas.push({ entrada: cur, salida: f, ms })
      cur = null
    }
  }
  if (cur) jornadas.push({ entrada: cur, salida: null, ms: null })
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

  useEffect(()=>{
    if(!userId) return
    setLoading(true)
    supabase.from('fichajes').select('id,tipo,created_at,direccion,foto_url').eq('user_id', userId).order('created_at', { ascending: false }).limit(500)
      .then(({ data })=>{ setFichajes((data as any) ?? []); setLoading(false) })
  },[userId])

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

  if(loading) return <div className="p-10 text-center">Cargando fichajes...</div>

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-white p-5 rounded-xl shadow flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Mis fichajes</h2>
          <p className="text-sm text-gray-500">Registro solo lectura — no se puede modificar una vez cargado</p>
        </div>
        <Link to="/fichar" className="px-4 py-2 bg-red-600 text-white rounded">← Fichar</Link>
      </div>

      <div className="bg-white p-4 rounded-xl shadow space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium">Filtrar:</span>
          {(['todo','dia','semana','mes'] as const).map(m=>(
            <button key={m} onClick={()=>setFiltro(m)} className={`px-3 py-1 rounded-full text-sm border ${filtro===m?'bg-red-600 text-white border-red-600':'bg-white'}`}>{m==='todo'?'Todo':m==='dia'?'Día':m==='semana'?'Semana':'Mes'}</button>
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
                <img src={f.foto_url ?? ''} className="w-14 h-14 object-cover rounded border bg-gray-100" alt="" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${f.tipo==='entrada'?'bg-green-100 text-green-700':f.tipo==='salida'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-800'}`}>{f.tipo}</span>
                    <span className="text-sm font-mono">{new Date(f.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                  </div>
                  <div className="text-xs text-gray-500 truncate max-w-[260px]">{f.direccion ?? ''}</div>
                </div>
                <div className="text-xs text-gray-400">{new Date(f.created_at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-center text-gray-400">Los fichajes son inmutables — si hay un error contacta al administrador.</p>
    </div>
  )
}
