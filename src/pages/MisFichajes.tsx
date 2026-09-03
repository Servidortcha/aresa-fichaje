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

// calcula horas por día - solo lectura
function calcularHorasDia(fichajesAsc: Fichaje[]): number {
  let total = 0
  let open: number | null = null
  for (const f of fichajesAsc) {
    const t = new Date(f.created_at).getTime()
    if (f.tipo === 'entrada' || f.tipo === 'pausa_fin') open = t
    else if (f.tipo === 'pausa_inicio' || f.tipo === 'salida') {
      if (open !== null) { total += t - open; open = null }
    }
  }
  // si quedó abierto (sin salida), no se cuenta hasta cerrar - solo total cerrado
  return total
}
function formatHoras(ms: number): string {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')} hs`
}

export default function MisFichajes(){
  const { userId } = useAuth()
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    if(!userId) return
    setLoading(true)
    supabase.from('fichajes').select('id,tipo,created_at,direccion,foto_url').eq('user_id', userId).order('created_at', { ascending: false }).limit(500)
      .then(({ data })=>{ setFichajes((data as any) ?? []); setLoading(false) })
  },[userId])

  const porDia = useMemo(()=>{
    const map = new Map<string, Fichaje[]>()
    for(const f of fichajes){
      const dia = f.created_at.slice(0,10)
      if(!map.has(dia)) map.set(dia, [])
      map.get(dia)!.push(f)
    }
    // ordenar días desc
    const entries = Array.from(map.entries()).sort((a,b)=> b[0].localeCompare(a[0]))
    return entries.map(([dia, list])=>{
      const asc = [...list].sort((a,b)=> a.created_at.localeCompare(b.created_at))
      const ms = calcularHorasDia(asc)
      const tieneAbierto = asc.length>0 && (asc[asc.length-1].tipo === 'entrada' || asc[asc.length-1].tipo === 'pausa_fin')
      return { dia, list: list.sort((a,b)=> a.created_at.localeCompare(b.created_at)), ms, tieneAbierto }
    })
  },[fichajes])

  const totalGeneral = useMemo(()=> porDia.reduce((acc, d)=> acc + d.ms, 0), [porDia])

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

      <div className="bg-white p-4 rounded-xl shadow flex gap-4 text-center">
        <div className="flex-1 border rounded p-3 bg-gray-50">
          <div className="text-xs text-gray-600">Total acumulado</div>
          <div className="text-2xl font-mono font-bold">{formatHoras(totalGeneral)}</div>
        </div>
        <div className="flex-1 border rounded p-3">
          <div className="text-xs text-gray-600">Días con fichajes</div>
          <div className="text-2xl font-bold">{porDia.length}</div>
        </div>
        <div className="flex-1 border rounded p-3">
          <div className="text-xs text-gray-600">Fichajes totales</div>
          <div className="text-2xl font-bold">{fichajes.length}</div>
        </div>
      </div>

      {porDia.length===0 && <div className="bg-white p-8 rounded-xl shadow text-center text-gray-500">Aún no tienes fichajes</div>}

      {porDia.map(({ dia, list, ms, tieneAbierto })=>(
        <div key={dia} className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 py-3 border-b flex justify-between items-center bg-gray-50">
            <div>
              <div className="font-bold">{new Date(dia+'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}</div>
              <div className="text-xs text-gray-500">{dia} · {list.length} fichajes</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-mono font-bold">{formatHoras(ms)}{tieneAbierto && <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">en curso</span>}</div>
              <div className="text-xs text-gray-500">horas del día</div>
            </div>
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
