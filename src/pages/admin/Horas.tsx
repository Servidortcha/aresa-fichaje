import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Jornada = {
  user_id: string
  nombre: string
  email: string
  fecha: string // AAAA-MM-DD de la entrada
  quincena: '1' | '2'
  entrada: string
  salida: string | null
  ms: number | null
  sucursal: string
}

function fmtHM(ms: number): string {
  if (ms < 0) ms = 0
  const m = Math.floor(ms / 60000)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} hs`
}

export default function Horas(){
  const [mes, setMes] = useState(new Date().toISOString().slice(0,7))
  const [quincena, setQuincena] = useState<'1' | '2' | 'ambas'>('ambas')
  const [persona, setPersona] = useState('')
  const [fichajes, setFichajes] = useState<any[]>([])
  const [sucursales, setSucursales] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async()=>{
    setLoading(true); setMsg(null)
    const [y, m] = mes.split('-').map(Number)
    const start = `${mes}-01T00:00:00`
    const end = new Date(y, m, 1).toISOString().slice(0,10) + 'T00:00:00'
    const { data, error } = await supabase.from('fichajes')
      .select('user_id,tipo,created_at,geocerca_id')
      .gte('created_at', start).lt('created_at', end)
      .order('created_at', { ascending: true }).limit(5000)
    if(error) setMsg('Error: ' + error.message)
    setFichajes((data as any) ?? [])
    const { data: g } = await supabase.from('geocercas').select('id,nombre').order('nombre')
    setSucursales((g as any) ?? [])
    const { data: u } = await supabase.from('profiles').select('id,nombre,email').order('nombre')
    setUsuarios((u as any) ?? [])
    setLoading(false)
  }
  useEffect(()=>{ load() },[mes])

  const jornadas = useMemo(()=>{
    const sucMap = new Map<string, string>(sucursales.map((s: any)=>[s.id, s.nombre]))
    const profMap = new Map<string, any>(usuarios.map((u: any)=>[u.id, u]))
    const byUser = new Map<string, any[]>()
    for(const f of fichajes){
      if(!byUser.has(f.user_id)) byUser.set(f.user_id, [])
      byUser.get(f.user_id)!.push(f)
    }
    const out: Jornada[] = []
    const mk = (entrada: any, salida: any | null, ms: number | null, prof: any): Jornada => {
      const fecha = entrada.created_at.slice(0, 10)
      return {
        user_id: entrada.user_id,
        nombre: prof?.nombre ?? entrada.user_id.slice(0, 8),
        email: prof?.email ?? '',
        fecha,
        quincena: Number(fecha.slice(8, 10)) <= 15 ? '1' : '2',
        entrada: entrada.created_at,
        salida: salida?.created_at ?? null,
        ms,
        sucursal: entrada.geocerca_id ? (sucMap.get(entrada.geocerca_id) ?? 'Sucursal eliminada') : 'Fuera de sucursal',
      }
    }
    for(const [uid, list] of byUser){
      const prof = profMap.get(uid)
      let cur: { entrada: any; acc: number; openStart: number | null } | null = null
      for(const f of list){
        const t = new Date(f.created_at).getTime()
        if(f.tipo === 'entrada'){
          if(cur) out.push(mk(cur.entrada, null, null, prof)) // jornada previa sin cerrar
          cur = { entrada: f, acc: 0, openStart: t }
        } else if(f.tipo === 'pausa_inicio' && cur && cur.openStart !== null){
          cur.acc += t - cur.openStart; cur.openStart = null
        } else if(f.tipo === 'pausa_fin' && cur && cur.openStart === null){
          cur.openStart = t
        } else if(f.tipo === 'salida' && cur){
          if(cur.openStart !== null) cur.acc += t - cur.openStart
          out.push(mk(cur.entrada, f, cur.acc, prof)); cur = null
        }
      }
      if(cur) out.push(mk(cur.entrada, null, null, prof))
    }
    return out
      .filter(j => quincena === 'ambas' || j.quincena === quincena)
      .filter(j => !persona || j.user_id === persona)
      .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.fecha.localeCompare(b.fecha) || a.entrada.localeCompare(b.entrada))
  },[fichajes, sucursales, usuarios, quincena, persona])

  const porPersona = useMemo(()=>{
    const map = new Map<string, { nombre: string; email: string; totalMs: number; jornadas: number; abiertas: number; porSuc: Map<string, { ms: number; jornadas: number }> }>()
    for(const j of jornadas){
      if(!map.has(j.user_id)) map.set(j.user_id, { nombre: j.nombre, email: j.email, totalMs: 0, jornadas: 0, abiertas: 0, porSuc: new Map() })
      const p = map.get(j.user_id)!
      if(j.ms === null){ p.abiertas++ }
      else {
        p.totalMs += j.ms; p.jornadas++
        if(!p.porSuc.has(j.sucursal)) p.porSuc.set(j.sucursal, { ms: 0, jornadas: 0 })
        const s = p.porSuc.get(j.sucursal)!
        s.ms += j.ms; s.jornadas++
      }
    }
    return Array.from(map.values()).sort((a, b)=> a.nombre.localeCompare(b.nombre))
  },[jornadas])

  const totalGeneral = porPersona.reduce((a, p)=> a + p.totalMs, 0)
  const maxPersona = Math.max(0, ...porPersona.map(p=> p.totalMs))

  const exportar = async()=>{
    const { exportHoras } = await import('../../lib/excelExport')
    const [y, m] = mes.split('-').map(Number)
    const qLabel = quincena === 'ambas' ? 'Q1-Q2' : `Q${quincena}`
    await exportHoras(
      porPersona.flatMap(p => Array.from(p.porSuc.entries()).map(([suc, s])=>({ empleado: p.nombre, email: p.email, sucursal: suc, minutos: Math.round(s.ms / 60000), jornadas: s.jornadas }))),
      jornadas.filter(j=> j.ms !== null).map(j=>({ empleado: j.nombre, fecha: j.fecha, entrada: new Date(j.entrada).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), salida: j.salida ? new Date(j.salida).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '', sucursal: j.sucursal, minutos: Math.round((j.ms ?? 0) / 60000) })),
      `Aresa_Horas_${y}-${String(m).padStart(2,'0')}_${qLabel}.xlsx`
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden shadow-lg text-white bg-gradient-to-br from-ink via-[#1E4A7A] to-[#2E6F9E] relative">
        <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 14px)' }} />
        <div className="relative p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-2xl font-display font-bold">Horas por persona y sucursal</h2>
              <p className="text-white/70 text-sm">Rendición por quincena — cada jornada suma en su sucursal</p>
            </div>
            <button onClick={exportar} disabled={!porPersona.length} className="shrink-0 px-4 py-2 bg-white text-ink rounded-full text-sm font-bold shadow hover:bg-paper transition disabled:opacity-50">Exportar Excel</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 items-center">
            <select value={persona} onChange={e=>setPersona(e.target.value)} className="bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-sm text-white max-w-[220px]">
              <option value="" className="text-black">Todas las personas</option>
              {usuarios.map(u=> <option key={u.id} value={u.id} className="text-black">{u.nombre}</option>)}
            </select>
            <input type="month" value={mes} onChange={e=>setMes(e.target.value)} className="bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-sm text-white [color-scheme:dark]" />
            {(['1','2','ambas'] as const).map(q=>(
              <button key={q} onClick={()=>setQuincena(q)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${quincena===q ? 'bg-white text-ink border-white' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}>
                {q==='ambas' ? 'Mes completo' : q==='1' ? 'Quincena 1 (1-15)' : 'Quincena 2 (16-fin)'}
              </button>
            ))}
          </div>
          <div className="mt-4 text-sm text-white/80">
            {loading ? 'Cargando...' : <><b className="text-white text-lg">{fmtHM(totalGeneral)}</b> en total · {porPersona.length} {porPersona.length === 1 ? 'persona' : 'personas'}</>}
          </div>
        </div>
      </div>

      {msg && <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-sm">{msg}</div>}

      {porPersona.length===0 && !loading && (
        <div className="bg-white p-8 rounded-2xl shadow text-center">
          <img src="/icono.png" alt="" className="w-14 h-14 mx-auto opacity-40" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
          <p className="text-sm text-gray-500 mt-3">Sin jornadas en este período</p>
        </div>
      )}

      {porPersona.map(p=>{
        const maxSuc = Math.max(1, ...Array.from(p.porSuc.values()).map(s=> s.ms))
        return (
          <div key={p.email} className="bg-white rounded-2xl shadow overflow-hidden">
            <div className="px-5 pt-4 flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold truncate">{p.nombre}</div>
                <div className="text-xs text-gray-500 truncate">{p.email} · {p.jornadas} {p.jornadas === 1 ? 'jornada' : 'jornadas'}{p.abiertas > 0 ? ` · ${p.abiertas} abierta(s)` : ''}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-lg">{fmtHM(p.totalMs)}</div>
                <div className="h-1.5 w-24 bg-gray-100 rounded-full mt-1 ml-auto"><div className="h-full bg-ink rounded-full" style={{ width: `${maxPersona ? Math.round(p.totalMs / maxPersona * 100) : 0}%` }} /></div>
              </div>
            </div>
            <div className="px-5 py-3 space-y-2">
              {Array.from(p.porSuc.entries()).sort((a,b)=> b[1].ms - a[1].ms).map(([suc, s])=>(
                <div key={suc} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate font-medium">{suc}</span>
                  <div className="hidden sm:block h-2 w-32 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-steel rounded-full" style={{ width: `${Math.round(s.ms / maxSuc * 100)}%` }} /></div>
                  <span className="text-xs text-gray-500 w-20 text-right">{s.jornadas} jor.</span>
                  <span className="font-mono font-bold w-24 text-right">{fmtHM(s.ms)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <p className="text-xs text-center text-gray-400">Cada jornada entrada → salida suma neta (descuenta pausas) en la sucursal de la entrada.</p>
    </div>
  )
}
