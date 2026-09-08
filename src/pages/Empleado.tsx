import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
    return (
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white p-6 rounded-xl shadow text-center">
          <h2 className="text-2xl font-bold">Aresa Fichaje</h2>
          <p className="text-sm text-gray-500">Jornada de hoy · {new Date().toLocaleDateString()}</p>

          {sinIniciar ? (
            <>
              <div className="my-6 p-6 bg-gray-50 rounded-xl border-2 border-dashed">
                <div className="text-5xl mb-3">🕐</div>
                <p className="font-medium">Buen día — ¿arrancamos?</p>
                <p className="text-sm text-gray-500">Un toque y quedas registrado, con foto y ubicación</p>
              </div>
              <button onClick={() => iniciarFlujo('entrada')} className="w-full bg-ink hover:bg-[#1A2B4A] text-white text-xl font-bold py-5 rounded-xl shadow">
                Iniciar jornada
              </button>
              <p className="text-xs text-gray-400 mt-2">Foto y GPS se toman en el momento</p>
            </>
          ) : jornada.trabajando ? (
            <>
              <div className="my-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-full text-sm font-bold animate-pulse">● En curso</div>
                <div className="text-5xl font-mono font-bold mt-3">{formatHoras(elapsedMs)}</div>
                <div className="text-sm text-gray-600">Vas bien — tiempo de esta jornada</div>
                {jornada.inicioMs && <div className="text-xs text-gray-500">Desde las {new Date(jornada.inicioMs).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>}
              </div>
              <button onClick={() => iniciarFlujo('salida')} className="w-full bg-ink hover:bg-black text-white py-4 rounded-xl font-bold">Finalizar jornada</button>
            </>
          ) : jornada.finalizada ? (
            <>
              <div className="my-4 p-4 bg-gray-100 border rounded-xl">
                <div className="inline-flex px-3 py-1 bg-gray-800 text-white rounded-full text-sm font-bold">Jornada completa</div>
                <div className="text-5xl font-mono font-bold mt-3">{formatHoras(elapsedMs)}</div>
                <div className="text-sm text-gray-600">Bien hecho hoy</div>
              </div>
              <p className="text-sm text-gray-500 mb-3">Si necesitas volver a fichar, podés iniciar otra.</p>
              <button onClick={() => iniciarFlujo('entrada')} className="w-full bg-white border border-line text-ink py-4 rounded-xl font-bold">Iniciar nueva jornada</button>
            </>
          ) : null}

          {msg && <div className="mt-4 p-3 rounded border text-sm" style={{ background: msg.startsWith('✓') ? '#ecfdf5' : msg.startsWith('⚠') ? '#fffbeb' : '#fef2f2' }}>{msg}</div>}
          {queueCount>0 && <div className="mt-3 p-3 rounded border text-sm bg-amber-50 flex justify-between items-center"><span>⏳ {queueCount} fichaje(s) offline en cola</span><button onClick={async()=>{ await reintentarCola(); refreshQueue(); await loadHistorial(); setMsg('Reintento cola completado') }} className="px-3 py-1 bg-amber-600 text-white rounded text-xs">Reintentar ahora</button></div>}
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <h3 className="font-bold mb-3">Hoy · {historialHoy.length} registros</h3>
            {historialHoy.length === 0 ? <p className="text-sm text-gray-500">Todavía sin movimientos hoy — cuando fiches, aparece acá</p> : (
            <div className="space-y-2">
              {[...historialHoy].reverse().map(f=>(
                <div key={f.id} className="flex gap-3 border rounded p-2 text-sm">
                  <div className={`w-12 h-12 rounded-lg grid place-items-center text-white text-xs font-bold shrink-0 ${f.tipo==='entrada'?'bg-green-600':f.tipo==='salida'?'bg-red-600':'bg-amber-500'}`}>{f.tipo.slice(0,2).toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="font-semibold">{f.tipo} · {new Date(f.created_at).toLocaleTimeString()}</div>
                    <div className="text-xs text-gray-600 truncate">{f.direccion}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link to="/mis-fichajes" className="block text-center mt-4 w-full bg-white border py-2 rounded font-medium">Ver mis fichajes por día →</Link>
          <details className="mt-4">
            <summary className="text-sm text-gray-600 cursor-pointer">Historial reciente ({historial.length})</summary>
            <div className="space-y-2 mt-2">
              {historial.map(f=>(
                <div key={f.id} className="flex gap-2 border rounded p-2 text-xs">
                  <div className={`w-10 h-10 rounded-lg grid place-items-center text-white text-[10px] font-bold shrink-0 ${f.tipo==='entrada'?'bg-green-600':f.tipo==='salida'?'bg-red-600':'bg-amber-500'}`}>{f.tipo.slice(0,2).toUpperCase()}</div>
                  <div className="min-w-0"><div className="font-semibold">{f.tipo} · {new Date(f.created_at).toLocaleString()}</div><div className="text-gray-600 truncate max-w-[200px]">{f.direccion}</div></div>
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

      <div className="p-4 space-y-4">
        <div className="relative bg-black rounded-2xl overflow-hidden aspect-[4/3] grid place-items-center">
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
