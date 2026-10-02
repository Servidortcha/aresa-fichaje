import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, type Geocerca } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { dentroDeGeocerca, reverseGeocode } from '../lib/geofence'
import { isMockLocation, watermarkFoto, canFichar } from '../lib/security'
import { enqueue, getQueue, dequeue } from '../lib/offlineQueue'
import { celebrarFichaje } from '../lib/celebrate'

type Tipo = 'entrada' | 'pausa_inicio' | 'pausa_fin' | 'salida'

// helpers jornada - individual por entrada/salida (no acumulable por día)
function calcularJornada(fichajesAsc: any[]) {
  let totalMs = 0
  let openStart: number | null = null
  for (const f of fichajesAsc) {
    const t = new Date(f.created_at).getTime()
    if (f.tipo === 'entrada' || f.tipo === 'pausa_fin') openStart = t
    else if (f.tipo === 'pausa_inicio' || f.tipo === 'salida') {
      if (openStart !== null) { totalMs += t - openStart; openStart = null }
    }
  }
  const last = fichajesAsc[fichajesAsc.length - 1]
  const trabajando = !!last && (last.tipo === 'entrada' || last.tipo === 'pausa_fin')
  const enPausa = !!last && last.tipo === 'pausa_inicio'
  const finalizada = !!last && last.tipo === 'salida'
  const inicioMs = openStart // inicio de la jornada actual abierta
  // para finalizada, buscar inicio de la última jornada individual
  let ultimaJornadaMs: number | null = null
  if (finalizada) {
    const idxSalida = fichajesAsc.length - 1
    for (let i = idxSalida - 1; i >= 0; i--) {
      if (fichajesAsc[i].tipo === 'entrada') {
        ultimaJornadaMs = new Date(fichajesAsc[idxSalida].created_at).getTime() - new Date(fichajesAsc[i].created_at).getTime()
        break
      }
    }
  }
  return { totalMs, openStart, trabajando, enPausa, finalizada, inicioMs, ultimaJornadaMs, lastTipo: last?.tipo ?? null }
}

function formatHoras(ms: number) {
  if (ms < 0) ms = 0
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} hs`
}

// Reloj con la hora real (manecillas según `when`)
function RelojAresa({ when }: { when: number }) {
  const d = new Date(when)
  const m = d.getMinutes() + d.getSeconds() / 60
  const h = (d.getHours() % 12) + m / 60
  const hand = (ang: number, len: number, w: number, color: string) => {
    const r = ((ang - 90) * Math.PI) / 180
    return <line x1={48} y1={48} x2={48 + len * Math.cos(r)} y2={48 + len * Math.sin(r)} stroke={color} strokeWidth={w} strokeLinecap="round" />
  }
  return (
    <svg viewBox="0 0 96 96" className="w-24 h-24 mx-auto drop-shadow-lg">
      <circle cx={48} cy={48} r={45} fill="rgba(255,255,255,0.14)" />
      <circle cx={48} cy={48} r={37} fill="#ffffff" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180
        const inner = i % 3 === 0 ? 26 : 28.5
        return <line key={i} x1={48 + 31 * Math.cos(a)} y1={48 + 31 * Math.sin(a)} x2={48 + inner * Math.cos(a)} y2={48 + inner * Math.sin(a)} stroke={i % 3 === 0 ? '#203575' : '#94A3B8'} strokeWidth={i % 3 === 0 ? 2.5 : 1.5} strokeLinecap="round" />
      })}
      {hand((h / 12) * 360, 18, 4, '#203575')}
      {hand((m / 60) * 360, 26, 3, '#2E6F9E')}
      <circle cx={48} cy={48} r={3.5} fill="#F4791E" />
    </svg>
  )
}

export default function Empleado() {
  const { userId } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [direccion, setDireccion] = useState<string | null>(null)
  const [sucursales, setSucursales] = useState<Geocerca[]>([])
  const [selectedId] = useState<string>('auto')
  const [loadingLoc, setLoadingLoc] = useState(false)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [historialHoy, setHistorialHoy] = useState<any[]>([])
  const [view, setView] = useState<'home' | 'fichar'>('home')
  const [ficharTipo, setFicharTipo] = useState<Tipo>('entrada')
  const [now, setNow] = useState(Date.now())

  // timer para horas trabajadas
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(i)
  }, [])

  const loadHistorial = async () => {
    if (!userId) return
    const { data } = await supabase.from('fichajes').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20)
    setHistorial(data ?? [])
    // filtrar hoy
    const hoy = new Date().toISOString().slice(0, 10)
    const hoyList = (data ?? []).filter((f: any) => f.created_at.startsWith(hoy)).reverse() // asc
    setHistorialHoy(hoyList)
  }

  const [queueCount, setQueueCount] = useState(0)
  const refreshQueue = () => setQueueCount(getQueue().filter(q=> q.user_id===userId).length)
  useEffect(() => {
    supabase.from('geocercas').select('*').eq('activa', true).order('nombre').then(({ data }) => setSucursales((data as Geocerca[]) ?? []))
    loadHistorial()
    refreshQueue()
    const onOnline = async()=> { await reintentarCola(); refreshQueue(); await loadHistorial() }
    window.addEventListener('online', onOnline)
    // reintento inicial si hay cola y hay conexión
    if(navigator.onLine) reintentarCola().then(refreshQueue)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const reintentarCola = async()=>{
    const q = getQueue().filter(x=> x.user_id===userId)
    for(const item of q){
      try{
        const blob = await (await fetch(item.foto_dataUrl)).blob()
        const path = `${item.user_id}/${Date.now()}-${item.id.slice(0,4)}.jpg`
        const { error: upErr } = await supabase.storage.from('fichajes-fotos').upload(path, blob, { contentType:'image/jpeg', upsert:false })
        if(upErr) throw upErr
        const foto_url: string = path
        const { error } = await supabase.from('fichajes').insert({
          user_id: item.user_id, tipo: item.tipo as any, lat:item.lat, lng:item.lng, direccion:item.direccion, foto_url, dentro_geocerca:item.dentro_geocerca, geocerca_id:item.geocerca_id, distancia_m:item.distancia_m, created_at: item.created_at
        })
        if(error) throw error
        dequeue(item.id)
      }catch(e){ console.warn('queue retry fail', e); break }
    }
  }

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      setStream(s)
      if (videoRef.current) videoRef.current.srcObject = s
      setMsg(null)
    } catch (e: any) {
      setMsg('No se pudo abrir la cámara: ' + e.message + ' - Debe permitir cámara.')
    }
  }
  const stopCamera = () => { stream?.getTracks().forEach(t => t.stop()); setStream(null) }

  const getLocation = async () => {
    setLoadingLoc(true); setMsg(null)
    if (!navigator.geolocation) { setMsg('Geolocalización no soportada'); setLoadingLoc(false); return }
    navigator.geolocation.getCurrentPosition(async pos => {
      const chk = isMockLocation(pos)
      if(chk.mock){ setMsg('Ubicación no confiable: '+chk.reason+' — desactiva mock/GPS falso y reintenta.'); setLoadingLoc(false); return }
      const lat = pos.coords.latitude; const lng = pos.coords.longitude
      setCoords({ lat, lng })
      setDireccion(await reverseGeocode(lat, lng))
      setLoadingLoc(false)
    }, err => { setMsg('Error GPS: ' + err.message + ' - Debe permitir ubicación precisa.'); setLoadingLoc(false) },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  const capturarFoto = async () => {
    if (!videoRef.current || !canvasRef.current) return
    if (!canFichar(userId ?? 'anon', 30000)) { setMsg('Espera 30s entre fichajes — evita toques accidentales.'); return }
    const v = videoRef.current; const c = canvasRef.current
    c.width = v.videoWidth; c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(v, 0, 0)
    // watermark con fecha/hora y coords para auditoría (no se permite galería)
    const lat = coords?.lat ?? 0, lng = coords?.lng ?? 0
    watermarkFoto(c, lat, lng, new Date(), undefined)
    const dataUrl = c.toDataURL('image/jpeg', 0.85)
    setFotoPreview(dataUrl)
    if (!coords) {
      setMsg('Foto capturada ✓ — obteniendo GPS...')
      await getLocation()
      setTimeout(()=> ficharAuto(dataUrl), 800)
    } else {
      ficharAuto(dataUrl)
    }
  }

  // Helpers deduplicados (P0 refactor): geocerca más cercana + persistencia única
  const sucursalesOrdenadas = coords ? [...sucursales].map(s=>{
    const r = dentroDeGeocerca(coords.lat, coords.lng, s.lat, s.lng, s.radio_m)
    return { ...s, _dist: r.distancia, _dentro: r.dentro }
  }).sort((a:any,b:any)=>a._dist-b._dist) : sucursales as any[]

  const resolverGeocerca = (curCoords: {lat:number,lng:number}) => {
    let target: Geocerca | null = null
    let dentro=false, distancia:number|null=null
    if(selectedId === 'auto'){
      let min=Infinity
      for(const g of sucursales){
        const r = dentroDeGeocerca(curCoords.lat, curCoords.lng, g.lat, g.lng, g.radio_m)
        if(r.distancia < min){ min=r.distancia; target=g; dentro=r.dentro; distancia=r.distancia }
      }
    } else {
      target = sucursales.find(s=>s.id===selectedId) ?? null
      if(target){
        const r = dentroDeGeocerca(curCoords.lat, curCoords.lng, target.lat, target.lng, target.radio_m)
        dentro=r.dentro; distancia=r.distancia
      }
    }
    const geocerca_id = target?.id ?? (sucursalesOrdenadas[0] as any)?.id ?? null
    return { target, dentro, distancia, geocerca_id }
  }

  const persistirFichaje = async (tipo: Tipo, curCoords: {lat:number,lng:number}, fotoDataUrl: string) => {
    if (!userId) { setMsg('No autenticado'); return }
    if (!fotoDataUrl) { setMsg('Foto no capturada'); return }
    setEnviando(true); setMsg('Registrando fichaje...')
    try {
      const { dentro, distancia, geocerca_id } = resolverGeocerca(curCoords)
      const blob = await (await fetch(fotoDataUrl)).blob()
      const path = `${userId}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('fichajes-fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      // Guarda solo el path para que la foto no expire (se genera URL fresca al mostrar) - fix InvalidJWT
      const foto_url: string = path
      // dentro/distancia se recalculan server-side por trigger validar_fichaje, pero enviamos para UX inmediata
      const { error } = await supabase.from('fichajes').insert({
        user_id: userId, tipo, lat: curCoords.lat, lng: curCoords.lng, direccion, foto_url, dentro_geocerca: dentro, geocerca_id, distancia_m: distancia,
      })
      if (error) throw error
      setFotoPreview(null)
      stopCamera()
      await loadHistorial()
      setView('home')
      celebrarFichaje()
      if (!dentro && sucursales.length>0) setMsg(`Registrado — fuera de geocerca (${distancia}m), igual queda asentado`)
      else setMsg(`Listo — ${tipo} registrado a las ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`)
      refreshQueue()
    } catch (e: any) {
      // P3 offline queue: si falla por red, encola para reintento
      const isNetwork = !navigator.onLine || String(e.message ?? '').toLowerCase().includes('fetch') || String(e.message ?? '').includes('network')
      if(isNetwork){
        try{
          const { dentro, distancia, geocerca_id } = resolverGeocerca(curCoords)
          enqueue({ id: crypto.randomUUID(), user_id: userId!, tipo, lat: curCoords.lat, lng: curCoords.lng, direccion, foto_dataUrl: fotoDataUrl, dentro_geocerca: dentro, geocerca_id, distancia_m: distancia, created_at: new Date().toISOString(), attempts: 0 })
          refreshQueue()
          setMsg('⚠ Sin conexión — fichaje guardado offline y se enviará al reconectar ✓ (queda en cola)')
          setFotoPreview(null); stopCamera(); setView('home')
        } catch(qe:any){ setMsg('Error al fichar: '+e.message+' (queue: '+qe.message+')') }
      } else { setMsg('Error al fichar: ' + e.message) }
    } finally { setEnviando(false) }
  }

  const ficharAuto = async (fotoDataUrl: string) => {
    if (!coords) { setMsg('Esperando GPS...'); return }
    await persistirFichaje(ficharTipo, coords, fotoDataUrl)
  }

  const jornada = calcularJornada(historialHoy)
  // individual: solo la jornada actual, no acumulable del día
  const elapsedMs = (() => {
    if (jornada.trabajando && jornada.openStart) return Math.max(0, now - jornada.openStart)
    if (jornada.finalizada && jornada.ultimaJornadaMs !== null) return Math.max(0, jornada.ultimaJornadaMs)
    return 0
  })()

  const iniciarFlujo = (tipo: Tipo) => {
    setFicharTipo(tipo)
    setFotoPreview(null)
    setMsg(null)
    setCoords(null)
    setDireccion(null)
    setView('fichar')
  }

  // Acción directa desde el botón flotante (?accion=entrada|salida)
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(()=>{
    const accion = searchParams.get('accion')
    if(accion==='entrada' || accion==='salida'){
      setSearchParams({}, { replace:true })
      iniciarFlujo(accion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[searchParams])

  const fichar = async () => {
    if (!coords) return setMsg('Obteniendo ubicación — esperá un segundo')
    if (!fotoPreview) return setMsg('Primero sacá la foto')
    await persistirFichaje(ficharTipo, coords, fotoPreview)
  }
  void fichar

  // Auto-arranca cámara y GPS al entrar a fichar (no pide de nuevo si ya diste permiso)
  useEffect(()=>{
    if(view !== 'fichar') return
    let cancelled = false
    // intenta recordar permiso: si ya está granted, arranca sin interacción extra
    const tryAuto = async()=>{
      try{
        // @ts-ignore permissions API puede no existir en iOS
        const perm = await navigator.permissions?.query({ name: 'camera' as any })
        if(perm?.state === 'granted' || localStorage.getItem('aresa_cam_ok')==='1'){
          await startCamera()
          if(cancelled) return
        }
      } catch {}
      // GPS siempre auto
      getLocation()
      // si no arrancó auto, el usuario verá el botón Permitir
    }
    const t = setTimeout(tryAuto, 200)
    return ()=>{ cancelled=true; clearTimeout(t) }
  },[view])

  useEffect(()=>{ if(stream) localStorage.setItem('aresa_cam_ok','1') },[stream])
  useEffect(()=>()=>{ stream?.getTracks().forEach(t => t.stop()) },[stream])

  // HOME VIEW
  if (view === 'home') {
    const sinIniciar = historialHoy.length === 0
    const hh = new Date().getHours()
    const saludo = hh < 12 ? 'Buen día' : hh < 20 ? 'Buenas tardes' : 'Buenas noches'
    const fechaLarga = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <div className="rounded-2xl overflow-hidden shadow-lg text-white bg-gradient-to-br from-ink via-[#1E4A7A] to-[#2E6F9E] relative">
          <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 14px)' }} />
          <div className="relative p-6 text-center">
            <img src="/logo-blanco.png" alt="Aresa" className="h-7 mx-auto" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
            <span className="inline-block mt-3 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-xs text-white/90 capitalize">{fechaLarga}</span>

            {sinIniciar ? (
              <>
                <div className="my-5"><RelojAresa when={now} /></div>
                <h2 className="text-2xl font-display font-bold">{saludo} — ¿arrancamos?</h2>
                <p className="text-white/75 text-sm mt-1">Un toque y quedas registrado, con foto y ubicación</p>
                <button onClick={() => iniciarFlujo('entrada')} className="mt-5 w-full bg-white text-ink text-xl font-bold py-4 rounded-2xl shadow-lg hover:bg-paper transition active:scale-[0.99]">
                  Iniciar jornada
                </button>
                <p className="text-white/50 text-xs mt-2">Foto y GPS se toman en el momento</p>
              </>
            ) : jornada.trabajando ? (
              <>
                <div className="mt-5 inline-flex items-center gap-2 px-3 py-1 bg-white/15 border border-white/25 rounded-full text-sm font-bold"><span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />En curso</div>
                <div className="text-6xl font-mono font-bold mt-3 tracking-tight">{formatHoras(elapsedMs).replace(' hs', '')}</div>
                <div className="text-sm text-white/75">Vas bien — tiempo de esta jornada</div>
                {jornada.inicioMs && <div className="text-xs text-white/55 mt-1">Desde las {new Date(jornada.inicioMs).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>}
                <button onClick={() => iniciarFlujo('salida')} className="mt-5 w-full bg-white text-ink py-4 rounded-2xl font-bold shadow-lg hover:bg-paper transition active:scale-[0.99]">Finalizar jornada</button>
              </>
            ) : jornada.finalizada ? (
              <>
                <img src="/icono.png" alt="" className="w-20 h-20 mx-auto mt-5 drop-shadow-lg" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
                <div className="text-5xl font-mono font-bold mt-3">{formatHoras(elapsedMs).replace(' hs', '')}</div>
                <div className="text-sm text-white/75">Jornada completa — bien hecho hoy</div>
                <p className="text-xs text-white/55 mt-2">Si necesitas volver a fichar, podés iniciar otra.</p>
                <button onClick={() => iniciarFlujo('entrada')} className="mt-4 w-full bg-white/15 border border-white/30 text-white py-3.5 rounded-2xl font-bold hover:bg-white/25 transition">Iniciar nueva jornada</button>
              </>
            ) : null}

            {msg && <div className="mt-4 p-3 rounded-xl border border-white/20 text-sm text-left" style={{ background: 'rgba(255,255,255,0.12)' }}>{msg}</div>}
            {queueCount>0 && <div className="mt-3 p-3 rounded-xl border border-white/20 text-sm flex justify-between items-center" style={{ background: 'rgba(255,255,255,0.12)' }}><span>{queueCount} fichaje(s) offline en cola</span><button onClick={async()=>{ await reintentarCola(); refreshQueue(); await loadHistorial(); setMsg('Reintento cola completado') }} className="px-3 py-1 bg-white text-ink rounded-full text-xs font-bold">Reintentar ahora</button></div>}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow">
          <div className="flex items-center gap-2">
            <img src="/icono.png" alt="" className="w-6 h-6" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
            <h3 className="font-bold">Hoy · {historialHoy.length} {historialHoy.length === 1 ? 'registro' : 'registros'}</h3>
          </div>
          {historialHoy.length === 0 ? (
            <div className="text-center py-6">
              <img src="/icono.png" alt="" className="w-14 h-14 mx-auto opacity-40" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
              <p className="text-sm text-gray-500 mt-3">Todavía sin movimientos hoy<br />cuando fiches, aparece acá</p>
            </div>
          ) : (
            <div className="mt-3 ml-2 border-l-2 border-gray-100 space-y-1">
              {[...historialHoy].reverse().map(f=>(
                <div key={f.id} className="relative pl-5 py-2">
                  <span className={`absolute -left-[7px] top-4 w-3 h-3 rounded-full ring-4 ring-white ${f.tipo==='entrada'?'bg-green-500':f.tipo==='salida'?'bg-red-500':'bg-amber-500'}`} />
                  <div className="flex items-center gap-2">
                    <span className="font-bold capitalize text-sm">{f.tipo.replace('_', ' ')}</span>
                    <span className="text-sm font-mono text-gray-500">{new Date(f.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{f.direccion}</div>
                </div>
              ))}
            </div>
          )}
          <Link to="/mis-fichajes" className="block text-center mt-4 w-full bg-ink text-paper py-2.5 rounded-xl font-medium hover:bg-black transition">Ver mis fichajes por día →</Link>
          <details className="mt-3">
            <summary className="text-sm text-gray-600 cursor-pointer list-none inline-block px-3 py-1.5 bg-gray-50 border rounded-full">Historial reciente ({historial.length})</summary>
            <div className="space-y-2 mt-3">
              {historial.map(f=>(
                <div key={f.id} className="flex gap-2 border rounded-xl p-2 text-xs items-center">
                  <div className={`w-9 h-9 rounded-lg grid place-items-center text-white text-[10px] font-bold shrink-0 ${f.tipo==='entrada'?'bg-green-600':f.tipo==='salida'?'bg-red-600':'bg-amber-500'}`}>{f.tipo.slice(0,2).toUpperCase()}</div>
                  <div className="min-w-0"><div className="font-semibold capitalize">{f.tipo.replace('_', ' ')} · {new Date(f.created_at).toLocaleString()}</div><div className="text-gray-600 truncate max-w-[200px]">{f.direccion}</div></div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    )
  }

  // FICHAR VIEW - simple y sin fricción (PWA recuerda permisos)
  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl shadow overflow-hidden">
      <div className="p-4 flex items-center gap-3 border-b">
        <button onClick={()=>{ stopCamera(); setView('home') }} className="w-9 h-9 grid place-items-center rounded-full border hover:bg-gray-50">←</button>
        <div className="flex-1">
          <h2 className="font-bold leading-none">{ficharTipo==='entrada' ? 'Iniciar jornada' : 'Finalizar jornada'}</h2>
          <p className="text-xs text-gray-500">Foto y ubicación se toman juntas</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${coords ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{coords ? 'GPS listo' : loadingLoc ? 'GPS...' : 'Sin GPS'}</span>
      </div>

      <div className="p-3 space-y-3">
        <div className="relative bg-black rounded-2xl overflow-hidden aspect-[3/4] max-h-[62vh] w-full grid place-items-center">
          <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!stream ? 'hidden' : ''}`} />
          {!stream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-white/10 grid place-items-center text-2xl">📷</div>
              <div>
                <div className="text-white font-medium">Cámara lista</div>
                <div className="text-white/60 text-xs mt-1">Se recuerda el permiso — no vuelve a pedir</div>
              </div>
              <button onClick={startCamera} className="px-6 py-3 bg-white text-black rounded-full font-bold shadow">Permitir cámara</button>
            </div>
          )}
          {stream && (
            <>
              <div className="absolute inset-0 pointer-events-none border-[3px] border-white/20 rounded-2xl" />
              <div className="absolute inset-0 pointer-events-none grid place-items-center">
                <div className="w-[68%] aspect-[3/4] rounded-full border-2 border-white/30" />
              </div>
            </>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {/* Estado GPS minimal */}
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border ${coords ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <span className="text-base">{coords ? '📍' : '◌'}</span>
          <span className="flex-1 truncate text-xs">{coords ? (direccion ?? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`) : loadingLoc ? 'Obteniendo ubicación...' : 'Esperando GPS — se activa solo'}</span>
          {!coords && <button onClick={getLocation} className="text-xs underline shrink-0">Reintentar</button>}
        </div>

        <button onClick={capturarFoto} disabled={!stream || enviando} className="w-full bg-ink hover:bg-black text-white py-4 rounded-xl font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed">
          {enviando ? 'Registrando...' : fotoPreview ? 'Procesando...' : 'Tomar foto y registrar'}
        </button>
        <p className="text-xs text-center text-gray-500">{!stream ? 'Primero permití la cámara' : !coords ? 'Esperando GPS un segundo...' : 'Un solo toque — no hace falta confirmar'}</p>

        {fotoPreview && <img src={fotoPreview} className="w-full rounded-xl border" />}
        {msg && <div className="p-3 rounded-xl border text-sm" style={{ background: msg.startsWith('Listo') || msg.startsWith('Registrado') ? '#ecfdf5' : msg.startsWith('⚠') ? '#fffbeb' : '#fef2f2' }}>{msg}</div>}
      </div>
    </div>
  )
}
