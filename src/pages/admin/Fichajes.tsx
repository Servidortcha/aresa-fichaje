import { useEffect, useState } from 'react'
import { supabase, type Fichaje, type Geocerca } from '../../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
// xlsx dinámico para code-split (ver exportExcel/exportPorSucursal/exportSimonetti)
import { distanciaMetros } from '../../lib/geofence'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

type Profile = { id:string, nombre:string, email:string, rol:string }

export default function Fichajes(){
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [sucursales, setSucursales] = useState<Geocerca[]>([])
  const [usuarios, setUsuarios] = useState<Profile[]>([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEmpleado, setFiltroEmpleado] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroSucursal, setFiltroSucursal] = useState('')
  const [editing, setEditing] = useState<Fichaje | null>(null)
  const [editForm, setEditForm] = useState({ tipo:'entrada' as Fichaje['tipo'], sucursal_id:'', fecha:'', hora:'' })
  const [pareja, setPareja] = useState<Fichaje | null>(null)
  const [parejaForm, setParejaForm] = useState({ tipo:'salida' as Fichaje['tipo'], sucursal_id:'', fecha:'', hora:'' })
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState({ user_id:'', tipo:'entrada' as Fichaje['tipo'], sucursal_id:'', fecha:'', hora:'' })
  const [msg, setMsg] = useState<string|null>(null)
  const [exportMes, setExportMes] = useState(new Date().toISOString().slice(0,7))

  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async(opts?:{ append?:boolean, pageNum?:number })=>{
    const pageNum = opts?.pageNum ?? 1
    const append = opts?.append ?? false
    if(!append) setLoading(true)
    // P2: server-side count + range para escalar a >400 (usa head:true para count sin data)
    const { count } = await supabase.from('fichajes').select('*', { count:'exact', head:true })
    if(count !== null) setTotalCount(count)
    // range paginado server-side (50 por fetch) + Realtime recarga página 1
    // Nota: filtros de empleado por nombre requieren !inner join; por ahora filtramos cliente sobre ventana cargada
    // Para escalar a miles, migrar a view materializada o RPC con búsqueda trigram
    const perFetch = 200
    const from = (pageNum-1)*perFetch
    const to = from + perFetch -1
    const { data } = await supabase.from('fichajes').select('*, profiles(nombre,email)').order('created_at',{ascending:false}).range(from, to)
    if(append) setFichajes(prev=> [...prev, ...((data as any) ?? [])])
    else setFichajes((data as any) ?? [])
    const { data:g } = await supabase.from('geocercas').select('*').order('nombre')
    setSucursales((g as any) ?? [])
    const { data:u } = await supabase.from('profiles').select('id,nombre,email,rol').order('nombre')
    setUsuarios((u as any) ?? [])
    // default manual fecha hoy
    const now = new Date()
    const f = now.toISOString().slice(0,10)
    const h = now.toTimeString().slice(0,5)
    setManual(m=> ({...m, fecha: f, hora: h}))
    setLoading(false)
  }
  useEffect(()=>{ load(); const ch=supabase.channel('fichajes-admin').on('postgres_changes',{event:'*',schema:'public',table:'fichajes'},()=>load()).subscribe(); return()=>{supabase.removeChannel(ch)} },[])

  const sucMap = new Map(sucursales.map(s=>[s.id,s]))
  const filtrados = fichajes.filter(f=>{
    if(filtroTipo && f.tipo!==filtroTipo) return false
    if(filtroEmpleado && !f.profiles?.nombre.toLowerCase().includes(filtroEmpleado.toLowerCase()) && !f.profiles?.email.toLowerCase().includes(filtroEmpleado.toLowerCase())) return false
    if(filtroFecha && !f.created_at.startsWith(filtroFecha)) return false
    if(filtroSucursal){
      if(filtroSucursal==='__sin__' && f.geocerca_id) return false
      if(filtroSucursal!=='__sin__' && f.geocerca_id!==filtroSucursal) return false
    }
    return true
  })
  // Paginación cliente (P1): evita render 400 filas, 50 por página
  const [page, setPage] = useState(1)
  const perPage = 50
  useEffect(()=>{ setPage(1) }, [filtroTipo, filtroEmpleado, filtroFecha, filtroSucursal, fichajes.length])
  const totalPages = Math.max(1, Math.ceil(filtrados.length / perPage))
  const paginados = filtrados.slice((page-1)*perPage, page*perPage)

  const exportExcel= async ()=>{
    const { exportFichajesSimple } = await import('../../lib/excelExport')
    const rows=filtrados.map(f=>{
      const suc=f.geocerca_id ? sucMap.get(f.geocerca_id) : null
      return { Fecha:new Date(f.created_at).toLocaleString(), Empleado:f.profiles?.nombre, Email:f.profiles?.email, Tipo:f.tipo, Sucursal:suc?.nombre ?? 'Fuera', Provincia:(suc as any)?.provincia ?? '', Lat:f.lat, Lng:f.lng, Direccion:f.direccion, Dentro:f.dentro_geocerca?'SI':'NO', Distancia_m:f.distancia_m, Foto:f.foto_url }
    })
    await exportFichajesSimple(rows, `Aresa_Fichajes_${new Date().toISOString().slice(0,10)}.xlsx`)
  }
  const exportPorSucursal= async ()=>{
    const { exportFichajesPorSucursal } = await import('../../lib/excelExport')
    const source = filtrados.length ? filtrados : fichajes
    const porSuc = new Map<string, typeof source>()
    for(const f of source){
      const suc = f.geocerca_id ? sucMap.get(f.geocerca_id)?.nombre ?? 'Fuera' : 'Fuera'
      if(!porSuc.has(suc)) porSuc.set(suc, [])
      porSuc.get(suc)!.push(f)
    }
    // preparar mapas de rows por suc
    const mapRows = new Map<string, any[]>()
    for(const [suc, list] of porSuc){
      const rows=list.map(f=>{
        const s=f.geocerca_id ? sucMap.get(f.geocerca_id) : null
        return { Fecha:new Date(f.created_at).toLocaleString(), Empleado:f.profiles?.nombre, Email:f.profiles?.email, Tipo:f.tipo, Sucursal:s?.nombre ?? 'Fuera', Provincia:(s as any)?.provincia ?? '', Lat:f.lat, Lng:f.lng, Direccion:f.direccion, Dentro:f.dentro_geocerca?'SI':'NO', Distancia_m:f.distancia_m, Foto:f.foto_url }
      })
      mapRows.set(suc, rows)
    }
    const allRows=source.map(f=>{
      const s=f.geocerca_id ? sucMap.get(f.geocerca_id) : null
      return { Fecha:new Date(f.created_at).toLocaleString(), Empleado:f.profiles?.nombre, Email:f.profiles?.email, Tipo:f.tipo, Sucursal:s?.nombre ?? 'Fuera', Provincia:(s as any)?.provincia ?? '', Lat:f.lat, Lng:f.lng, Direccion:f.direccion, Dentro:f.dentro_geocerca?'SI':'NO', Distancia_m:f.distancia_m, Foto:f.foto_url }
    })
    await exportFichajesPorSucursal(mapRows, allRows, `Aresa_Fichajes_por_Sucursal_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const exportSimonetti = async()=>{
    try{
      const { exportSimonettiExcelJS } = await import('../../lib/excelExport')
      const start=`${exportMes}-01T00:00:00`
      const end=new Date(exportMes.split('-')[0] as any, Number(exportMes.split('-')[1]),1).toISOString().slice(0,10)+'T00:00:00'
      const { data: fichMes } = await supabase.from('fichajes').select('user_id,tipo,created_at,profiles(nombre)').gte('created_at', start).lt('created_at', end).order('created_at', {ascending:true}).limit(5000)
      const { data: profs } = await supabase.from('profiles').select('id,nombre,email').order('nombre')
      const listaProfs = (profs as any) ?? []
      const fetchTemplate = async()=> { const r=await fetch('/template-fichajes.xlsx'); return await r.arrayBuffer() }
      await exportSimonettiExcelJS({ exportMes, fichMes: (fichMes as any) ?? [], profs: listaProfs, fetchTemplate, setMsg })
      return
    } catch(e:any){ setMsg('Error export Simonetti: '+e.message) }
  }
  const encontrarPareja = (f: Fichaje): Fichaje | null => {
    const dia = f.created_at.slice(0,10)
    const delDia = fichajes.filter(x=> x.user_id===f.user_id && x.created_at.slice(0,10)===dia).sort((a,b)=> a.created_at.localeCompare(b.created_at))
    const idx = delDia.findIndex(x=> x.id===f.id)
    if(idx===-1) return null
    // si es entrada, busca siguiente salida; si es salida, busca anterior entrada
    if(f.tipo==='entrada'){
      for(let i=idx+1;i<delDia.length;i++) if(delDia[i].tipo==='salida') return delDia[i]
      // si no hay salida después, busca salida más cercana del día
      return delDia.find(x=> x.tipo==='salida' && x.id!==f.id) ?? null
    } else if(f.tipo==='salida'){
      for(let i=idx-1;i>=0;i--) if(delDia[i].tipo==='entrada') return delDia[i]
      return delDia.find(x=> x.tipo==='entrada' && x.id!==f.id) ?? null
    }
    // para pausas, muestra entrada del día como contexto
    return delDia.find(x=> (x.tipo==='entrada' || x.tipo==='salida') && x.id!==f.id) ?? null
  }
  const openEdit = (f:Fichaje)=>{
    setEditing(f)
    const d = new Date(f.created_at)
    setEditForm({ tipo:f.tipo, sucursal_id: f.geocerca_id ?? '', fecha: d.toISOString().slice(0,10), hora: d.toTimeString().slice(0,5) })
    const p = encontrarPareja(f)
    setPareja(p)
    if(p){
      const dp = new Date(p.created_at)
      setParejaForm({ tipo:p.tipo, sucursal_id: p.geocerca_id ?? '', fecha: dp.toISOString().slice(0,10), hora: dp.toTimeString().slice(0,5) })
    } else setParejaForm({ tipo:'salida' as any, sucursal_id:'', fecha:'', hora:'' })
    setMsg(null)
  }

  const saveEdit = async()=>{
    if(!editing) return
    const suc = sucursales.find(s=>s.id===editForm.sucursal_id)
    const newDate = new Date(`${editForm.fecha}T${editForm.hora}:00`)
    let lat = editing.lat, lng = editing.lng, distancia = editing.distancia_m, dentro = editing.dentro_geocerca
    let geocerca_id: string | null = editForm.sucursal_id || null
    if(suc){ lat = suc.lat; lng = suc.lng; const d = distanciaMetros(editing.lat, editing.lng, suc.lat, suc.lng); distancia = Math.round(d); dentro = d <= suc.radio_m }
    if(!suc){ geocerca_id = null; dentro = false }
    const { error } = await supabase.from('fichajes').update({
      tipo: editForm.tipo, geocerca_id, lat, lng, distancia_m: distancia, dentro_geocerca: dentro, created_at: newDate.toISOString(),
    }).eq('id', editing.id)
    if(error) return setMsg('Error: '+error.message)
    // si hay pareja y se editó (fecha/hora/sucursal/tipo distintos), guarda también
    if(pareja){
      const pSuc = sucursales.find(s=>s.id===parejaForm.sucursal_id)
      const pDate = new Date(`${parejaForm.fecha}T${parejaForm.hora}:00`)
      const origD = new Date(pareja.created_at)
      const changed = parejaForm.tipo!==pareja.tipo || parejaForm.sucursal_id!==(pareja.geocerca_id??'') || parejaForm.fecha!==origD.toISOString().slice(0,10) || parejaForm.hora!==origD.toTimeString().slice(0,5)
      if(changed){
        let pLat = pareja.lat, pLng = pareja.lng, pDist = pareja.distancia_m, pDentro = pareja.dentro_geocerca
        let pGeocerca_id: string | null = parejaForm.sucursal_id || null
        if(pSuc){ pLat = pSuc.lat; pLng = pSuc.lng; const dd = distanciaMetros(pareja.lat, pareja.lng, pSuc.lat, pSuc.lng); pDist = Math.round(dd); pDentro = dd <= pSuc.radio_m }
        if(!pSuc){ pGeocerca_id = null; pDentro = false }
        const { error: pErr } = await supabase.from('fichajes').update({
          tipo: parejaForm.tipo, geocerca_id: pGeocerca_id, lat: pLat, lng: pLng, distancia_m: pDist, dentro_geocerca: pDentro, created_at: pDate.toISOString(),
        }).eq('id', pareja.id)
        if(pErr) return setMsg('Editado principal ✓ pero pareja falló: '+pErr.message)
      }
    }
    setEditing(null); setPareja(null); load()
  }

  const crearManual = async()=>{
    if(!manual.user_id) return setMsg('Elegí usuario')
    if(!manual.sucursal_id) return setMsg('Elegí sucursal')
    const suc = sucursales.find(s=>s.id===manual.sucursal_id)
    if(!suc) return setMsg('Sucursal no encontrada')
    const dt = new Date(`${manual.fecha}T${manual.hora}:00`)
    // verifica RLS admin - necesita migración supabase_migracion_admin_fichajes.sql
    const { error } = await supabase.from('fichajes').insert({
      user_id: manual.user_id,
      tipo: manual.tipo,
      lat: suc.lat,
      lng: suc.lng,
      direccion: (suc as any).direccion ?? suc.nombre,
      foto_url: null,
      dentro_geocerca: true,
      geocerca_id: suc.id,
      distancia_m: 0,
      created_at: dt.toISOString(),
    })
    if(error) setMsg('Error crear: '+error.message+' — ¿Ejecutaste supabase_migracion_admin_fichajes.sql ?')
    else { setMsg('Fichaje manual creado ✓'); setShowManual(false); load() }
  }

  const borrar = async(id:string)=>{
    if(!confirm('¿Borrar fichaje?')) return
    const { error } = await supabase.from('fichajes').delete().eq('id', id)
    if(error) alert(error.message); else load()
  }

  const center:[number,number]=sucursales[0]?[sucursales[0].lat,sucursales[0].lng]:filtrados[0]?[filtrados[0].lat,filtrados[0].lng]:[-32.2426,-63.542]
  return (
    <div className="space-y-4">
      <div className="bg-white p-3 sm:p-4 rounded-xl shadow">
        <h2 className="text-lg sm:text-xl font-bold">Registro de fichajes — Admin editable</h2>
        <p className="text-xs sm:text-sm text-gray-500">Cada fichaje es un evento. Puedes cambiar sucursal, fecha/hora y tipo. Crear manual asignando usuario y sucursal.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2 sm:gap-3 items-end mt-3">
          <input value={filtroEmpleado} onChange={e=>setFiltroEmpleado(e.target.value)} placeholder="Filtrar empleado" className="border rounded px-3 py-2 w-full lg:w-auto" />
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} className="border rounded px-3 py-2 w-full lg:w-auto">
            <option value="">Todos los tipos</option><option value="entrada">Entrada</option><option value="salida">Salida</option>
          </select>
          <select value={filtroSucursal} onChange={e=>setFiltroSucursal(e.target.value)} className="border rounded px-3 py-2 w-full lg:w-auto lg:min-w-[180px]">
            <option value="">Todas las sucursales</option><option value="__sin__">Fuera de sucursal</option>
            {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <input type="date" value={filtroFecha} onChange={e=>setFiltroFecha(e.target.value)} className="border rounded px-3 py-2 w-full lg:w-auto" />
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <button onClick={exportExcel} className="flex-1 lg:flex-none bg-green-600 text-white px-4 py-2 rounded text-sm">Exportar (filtro)</button>
            <button onClick={exportPorSucursal} className="flex-1 lg:flex-none bg-amber text-white px-4 py-2 rounded text-sm">Por sucursal</button>
            <button onClick={()=>setShowManual(v=>!v)} className="flex-1 lg:flex-none bg-ink text-paper px-4 py-2 rounded text-sm">+ Manual</button>
          </div>
          <div className="flex gap-2 w-full lg:w-auto items-center">
            <input type="month" value={exportMes} onChange={e=>setExportMes(e.target.value)} className="border rounded px-2 py-1 text-sm" />
            <button onClick={exportSimonetti} className="bg-[#163A5F] text-white px-3 py-2 rounded text-sm">Formato Simonetti</button>
          </div>
          <span className="text-xs sm:text-sm text-gray-500 col-span-1 sm:col-span-2 lg:col-span-1">{loading ? 'Cargando...' : `${filtrados.length} en vista · ${totalCount ?? '?'} total · ${usuarios.length} usuarios`}</span>
          {fichajes.length < (totalCount ?? 0) && <button onClick={()=>load({ append:true, pageNum: Math.floor(fichajes.length/200)+1 })} className="text-xs border px-3 py-1 rounded bg-white">Cargar más (200)</button>}
        </div>
      </div>

      {showManual && (
        <div className="bg-white p-4 rounded-xl shadow space-y-3">
          <h3 className="font-bold">Crear fichaje manual</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <select value={manual.user_id} onChange={e=>setManual({...manual, user_id:e.target.value})} className="border rounded px-3 py-2">
              <option value="">Elegí usuario ({usuarios.length})</option>
              {usuarios.map(u=> <option key={u.id} value={u.id}>{u.nombre} · {u.email} · {u.rol}</option>)}
            </select>
            <select value={manual.sucursal_id} onChange={e=>setManual({...manual, sucursal_id:e.target.value})} className="border rounded px-3 py-2">
              <option value="">Elegí sucursal</option>
              {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre} · {(s as any).provincia ?? ''} · {s.lat.toFixed(4)},{s.lng.toFixed(4)}</option>)}
            </select>
            <select value={manual.tipo} onChange={e=>setManual({...manual, tipo:e.target.value as any})} className="border rounded px-3 py-2">
              <option value="entrada">Entrada</option><option value="salida">Salida</option>
            </select>
            <div className="flex gap-2">
              <input type="date" value={manual.fecha} onChange={e=>setManual({...manual, fecha:e.target.value})} className="border rounded px-3 py-2 flex-1" />
              <input type="time" value={manual.hora} onChange={e=>setManual({...manual, hora:e.target.value})} className="border rounded px-3 py-2 w-32" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={crearManual} className="bg-red-600 text-white px-6 py-2 rounded font-bold">Crear fichaje</button>
            <button onClick={()=>setShowManual(false)} className="border px-4 py-2 rounded">Cancelar</button>
          </div>
          <p className="text-xs text-gray-500">Se guardará con coordenadas de la sucursal y marcado como dentro. Si no ejecutaste la migración RLS, te dará error — corre <code>supabase_migracion_admin_fichajes.sql</code>.</p>
        </div>
      )}

      {msg && <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm">{msg}</div>}

      {editing && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-[9999] p-4" onClick={()=>{setEditing(null); setPareja(null)}}>
          <div className="bg-white rounded-xl p-5 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-auto" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold">Editar jornada — {editing.profiles?.nombre}</h3>
            <p className="text-xs text-gray-500">{editing.id.slice(0,8)} · {new Date(editing.created_at).toLocaleString()} {pareja ? `· pareja ${pareja.id.slice(0,8)} · ${new Date(pareja.created_at).toLocaleString()}` : '· sin pareja (jornada abierta)'}</p>
            {/* Fichaje principal */}
            <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
              <div className="flex items-center gap-2"><span className={`px-2 py-1 rounded text-xs font-bold ${editForm.tipo==='entrada'?'bg-green-600 text-white':'bg-red-600 text-white'}`}>{editForm.tipo}</span><span className="text-sm font-semibold">Fichaje seleccionado</span>{editing.foto_url && <a href={editing.foto_url} target="_blank" rel="noreferrer" className="ml-auto"><img src={editing.foto_url} className="w-10 h-10 object-cover rounded border" /></a>}</div>
              <select value={editForm.tipo} onChange={e=>setEditForm({...editForm, tipo:e.target.value as any})} className="w-full border rounded px-3 py-2">
                <option value="entrada">Entrada</option><option value="salida">Salida</option>
              </select>
              <select value={editForm.sucursal_id} onChange={e=>setEditForm({...editForm, sucursal_id:e.target.value})} className="w-full border rounded px-3 py-2">
                <option value="">Sin sucursal (fuera)</option>
                {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre} · {s.lat.toFixed(4)},{s.lng.toFixed(4)}</option>)}
              </select>
              <div className="flex gap-2">
                <input type="date" value={editForm.fecha} onChange={e=>setEditForm({...editForm, fecha:e.target.value})} className="border rounded px-3 py-2 flex-1" />
                <input type="time" value={editForm.hora} onChange={e=>setEditForm({...editForm, hora:e.target.value})} className="border rounded px-3 py-2 w-32" />
              </div>
              <div className="text-xs text-gray-500">{editing.direccion ?? ''} · {editing.lat.toFixed(5)},{editing.lng.toFixed(5)} · {editing.dentro_geocerca ? '✓ Dentro' : `⚠ ${editing.distancia_m}m`}</div>
            </div>
            {/* Pareja si existe */}
            {pareja ? (
              <div className="border rounded-xl p-4 space-y-3 bg-white">
                <div className="flex items-center gap-2"><span className={`px-2 py-1 rounded text-xs font-bold ${parejaForm.tipo==='entrada'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{parejaForm.tipo}</span><span className="text-sm font-semibold">Pareja del mismo día</span><span className="text-xs text-gray-500">{pareja.id.slice(0,8)} · {new Date(pareja.created_at).toLocaleDateString()}</span>{pareja.foto_url && <a href={pareja.foto_url} target="_blank" rel="noreferrer" className="ml-auto"><img src={pareja.foto_url} className="w-10 h-10 object-cover rounded border" /></a>}<button onClick={()=>{ const tmp=editing; const tmpForm=editForm; setEditing(pareja); setEditForm(parejaForm); setPareja(tmp); setParejaForm(tmpForm)}} className="ml-2 text-xs border px-2 py-1 rounded">Intercambiar</button></div>
                <select value={parejaForm.tipo} onChange={e=>setParejaForm({...parejaForm, tipo:e.target.value as any})} className="w-full border rounded px-3 py-2">
                  <option value="entrada">Entrada</option><option value="salida">Salida</option>
                </select>
                <select value={parejaForm.sucursal_id} onChange={e=>setParejaForm({...parejaForm, sucursal_id:e.target.value})} className="w-full border rounded px-3 py-2">
                  <option value="">Sin sucursal (fuera)</option>
                  {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre} · {s.lat.toFixed(4)},{s.lng.toFixed(4)}</option>)}
                </select>
                <div className="flex gap-2">
                  <input type="date" value={parejaForm.fecha} onChange={e=>setParejaForm({...parejaForm, fecha:e.target.value})} className="border rounded px-3 py-2 flex-1" />
                  <input type="time" value={parejaForm.hora} onChange={e=>setParejaForm({...parejaForm, hora:e.target.value})} className="border rounded px-3 py-2 w-32" />
                </div>
                <div className="text-xs text-gray-500">{pareja.direccion ?? ''} · {pareja.lat.toFixed(5)},{pareja.lng.toFixed(5)} · {pareja.dentro_geocerca ? '✓ Dentro' : `⚠ ${pareja.distancia_m}m`} · <a href={`https://www.google.com/maps?q=${pareja.lat},${pareja.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">Ver mapa</a></div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">Se guardarán ambos fichajes al pulsar Guardar. Si solo quieres editar uno, deja el otro sin cambios.</p>
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-xl p-4 text-center text-sm text-gray-500">Jornada abierta — no hay pareja entrada/salida para {new Date(editing.created_at).toLocaleDateString()}. Creá la pareja con + Manual si falta.</div>
            )}
            <div className="flex gap-2">
              <button onClick={saveEdit} className="flex-1 bg-red-600 text-white py-3 rounded font-bold">Guardar {pareja ? 'ambos' : ''} cambios</button>
              <button onClick={()=>{setEditing(null); setPareja(null)}} className="flex-1 border py-3 rounded">Cancelar</button>
            </div>
            <p className="text-xs text-gray-500 text-center">Cambiar sucursal recalculará lat/lng a la sucursal y distancia. Fecha/hora se guarda en UTC.</p>
          </div>
        </div>
      )}

      <div className="bg-white p-3 sm:p-4 rounded-xl shadow">
        <div className="h-[280px] sm:h-[380px] rounded overflow-hidden border">
          <MapContainer center={center} zoom={sucursales.length?6:5} style={{height:'100%',width:'100%'}}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {sucursales.map(s=> <Circle key={s.id} center={[s.lat,s.lng]} radius={s.radio_m} pathOptions={{ color:'#9ca3af', fillOpacity:0.08 }}><Popup>{s.nombre} · {s.radio_m} m</Popup></Circle>)}
            {filtrados.slice(0,100).map(f=> <Marker key={f.id} position={[f.lat,f.lng]}><Popup><b>{f.profiles?.nombre}</b> - {f.tipo}<br/>{new Date(f.created_at).toLocaleString()}<br/>{f.direccion}<br/><a href={f.foto_url??'#'} target="_blank" rel="noreferrer">Ver foto</a></Popup></Marker>)}
          </MapContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="flex justify-between items-center p-3 border-b bg-gray-50">
          <span className="text-xs text-gray-600">Página {page} de {totalPages} · {filtrados.length} filtrados</span>
          <div className="flex gap-2">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1} className="px-3 py-1 border rounded text-xs bg-white disabled:opacity-50">← Anterior</button>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages} className="px-3 py-1 border rounded text-xs bg-white disabled:opacity-50">Siguiente →</button>
          </div>
        </div>
        <div className="overflow-auto max-h-[700px] -mx-3 sm:mx-0">
          <table className="w-full text-xs sm:text-sm min-w-[700px]">
            <thead className="bg-gray-50 sticky top-0"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Empleado</th><th className="p-2">Tipo</th><th className="p-2 text-left">Sucursal</th><th className="p-2">Ubicación</th><th className="p-2">Foto</th><th className="p-2">Acciones</th></tr></thead>
            <tbody>
              {paginados.map(f=>{
                const suc=f.geocerca_id? sucMap.get(f.geocerca_id):null
                return <tr key={f.id} className="border-t hover:bg-gray-50"><td className="p-2 whitespace-nowrap text-xs">{new Date(f.created_at).toLocaleString()}</td><td className="p-2"><div className="font-medium">{f.profiles?.nombre}</div><div className="text-xs text-gray-500">{f.profiles?.email}</div></td><td className="p-2 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${f.tipo==='entrada'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{f.tipo}</span></td><td className="p-2 text-xs">{suc? <><b>{suc.nombre}</b><div className="text-gray-500">{f.dentro_geocerca?'✓ Dentro':`⚠ ${f.distancia_m}m fuera`}</div></>:<span className="text-red-600">Fuera</span>}</td><td className="p-2 text-xs"><a href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{f.lat.toFixed(4)}, {f.lng.toFixed(4)}</a></td><td className="p-2">{f.foto_url? <a href={f.foto_url} target="_blank" rel="noreferrer"><img src={f.foto_url} className="w-12 h-12 object-cover rounded border"/></a>:'—'}</td><td className="p-2 flex gap-1"><button onClick={()=>openEdit(f)} className="px-2 py-1 border rounded text-xs bg-white">Editar</button><button onClick={()=>borrar(f.id)} className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-xs">Borrar</button></td></tr>
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
