import { useEffect, useRef, useState } from 'react'
import { supabase, type Geocerca } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { dentroDeGeocerca, reverseGeocode } from '../lib/geofence'

type Tipo = 'entrada' | 'pausa_inicio' | 'pausa_fin' | 'salida'

// helpers jornada
function calcularJornada(fichajesAsc: any[]) {
  // fichajesAsc ordenados ascendente
  let totalMs = 0
  let openStart: number | null = null
  for (const f of fichajesAsc) {
    const t = new Date(f.created_at).getTime()
    if (f.tipo === 'entrada' || f.tipo === 'pausa_fin') {
      openStart = t
    } else if (f.tipo === 'pausa_inicio' || f.tipo === 'salida') {
      if (openStart !== null) {
        totalMs += t - openStart
        openStart = null
      }
    }
  }
  const last = fichajesAsc[fichajesAsc.length - 1]
  const trabajando = !!last && (last.tipo === 'entrada' || last.tipo === 'pausa_fin')
  const enPausa = !!last && last.tipo === 'pausa_inicio'
  const finalizada = !!last && last.tipo === 'salida'
  const inicioMs = fichajesAsc.find((f: any) => f.tipo === 'entrada') ? new Date(fichajesAsc.find((f: any) => f.tipo === 'entrada').created_at).getTime() : null
  return { totalMs, openStart, trabajando, enPausa, finalizada, inicioMs, lastTipo: last?.tipo ?? null }
}

function formatHoras(ms: number) {
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
  const [selectedId, setSelectedId] = useState<string>('auto')
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

  useEffect(() => {
    supabase.from('geocercas').select('*').eq('activa', true).order('nombre').then(({ data }) => setSucursales((data as Geocerca[]) ?? []))
    loadHistorial()
  }, [userId])

  const loadHistorial = async () => {
    if (!userId) return
    const { data } = await supabase.from('fichajes').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20)
    setHistorial(data ?? [])
    // filtrar hoy
    const hoy = new Date().toISOString().slice(0, 10)
    const hoyList = (data ?? []).filter((f: any) => f.created_at.startsWith(hoy)).reverse() // asc
    setHistorialHoy(hoyList)
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
      const lat = pos.coords.latitude; const lng = pos.coords.longitude
      setCoords({ lat, lng })
      setDireccion(await reverseGeocode(lat, lng))
      setLoadingLoc(false)
    }, err => { setMsg('Error GPS: ' + err.message + ' - Debe permitir ubicación.'); setLoadingLoc(false) },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  const capturarFoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const v = videoRef.current; const c = canvasRef.current
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    setFotoPreview(c.toDataURL('image/jpeg', 0.8))
  }

  const sucursalesOrdenadas = coords ? [...sucursales].map(s=>{
    const r = dentroDeGeocerca(coords.lat, coords.lng, s.lat, s.lng, s.radio_m)
    return { ...s, _dist: r.distancia, _dentro: r.dentro }
  }).sort((a:any,b:any)=>a._dist-b._dist) : sucursales as any[]

  const autoMejor = sucursalesOrdenadas[0] as any

  const jornada = calcularJornada(historialHoy)
  const elapsedMs = (() => {
    if (jornada.trabajando && jornada.openStart) return jornada.totalMs + (now - jornada.openStart)
    return jornada.totalMs
  })()

  const iniciarFlujo = (tipo: Tipo) => {
    setFicharTipo(tipo)
    setFotoPreview(null)
    setMsg(null)
    setView('fichar')
    // auto iniciar cámara y GPS al entrar
    setTimeout(() => { startCamera(); getLocation() }, 300)
  }

  const fichar = async () => {
    const tipo = ficharTipo
    if (!userId) return setMsg('No autenticado')
    if (!coords) return setMsg('Primero obtene tu ubicación con el botón GPS')
    if (!fotoPreview) return setMsg('Primero saca la foto con la cámara')
    setEnviando(true); setMsg(null)
    try {
      let target: Geocerca | null = null
      let dentro=false, distancia:number|null=null
      if(selectedId === 'auto'){
        let min=Infinity
        for(const g of sucursales){
          const r = dentroDeGeocerca(coords.lat, coords.lng, g.lat, g.lng, g.radio_m)
          if(r.distancia < min){ min=r.distancia; target=g; dentro=r.dentro; distancia=r.distancia }
        }
      } else {
        target = sucursales.find(s=>s.id===selectedId) ?? null
        if(target){
          const r = dentroDeGeocerca(coords.lat, coords.lng, target.lat, target.lng, target.radio_m)
          dentro=r.dentro; distancia=r.distancia
        }
      }
      const geocerca_id = target?.id ?? (sucursalesOrdenadas[0] as any)?.id ?? null
      const blob = await (await fetch(fotoPreview)).blob()
      const path = `${userId}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('fichajes-fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('fichajes-fotos').getPublicUrl(path)
      const { error } = await supabase.from('fichajes').insert({
        user_id: userId, tipo, lat: coords.lat, lng: coords.lng, direccion, foto_url: pub.publicUrl, dentro_geocerca: dentro, geocerca_id, distancia_m: distancia,
      })
      if (error) throw error
      setFotoPreview(null)
      stopCamera()
      await loadHistorial()
      setView('home')
      if (!dentro && sucursales.length>0) setMsg(`✓ ${tipo} registrado FUERA de ${target?.nombre ?? 'sucursal'} (${distancia}m)`)
      else setMsg(`✓ ${tipo} registrado en ${target?.nombre ?? 'sucursal'} ${dentro ? '✓' : ''}`)
    } catch (e: any) { setMsg('Error al fichar: ' + e.message) } finally { setEnviando(false) }
  }

  useEffect(()=>()=>stopCamera(),[])

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
                <p className="font-medium">Aún no iniciaste tu jornada</p>
                <p className="text-sm text-gray-500">Pulsa para autenticar con cámara y ubicación</p>
              </div>
              <button onClick={() => iniciarFlujo('entrada')} className="w-full bg-green-600 hover:bg-green-700 text-white text-xl font-bold py-5 rounded-xl shadow">
                ▶ Iniciar jornada
              </button>
              <p className="text-xs text-gray-400 mt-2">Se tomará foto y GPS automáticamente</p>
            </>
          ) : jornada.trabajando ? (
            <>
              <div className="my-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-full text-sm font-bold animate-pulse">● Trabajando</div>
                <div className="text-5xl font-mono font-bold mt-3">{formatHoras(elapsedMs)}</div>
                <div className="text-sm text-gray-600">Horas trabajadas hoy (descontando pausas)</div>
                {jornada.inicioMs && <div className="text-xs text-gray-500">Inicio: {new Date(jornada.inicioMs).toLocaleTimeString()}</div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => iniciarFlujo('pausa_inicio')} className="bg-yellow-500 text-white py-4 rounded-xl font-bold">⏸ Pausar</button>
                <button onClick={() => iniciarFlujo('salida')} className="bg-red-600 text-white py-4 rounded-xl font-bold">⏹ Finalizar jornada</button>
              </div>
              <button onClick={() => setView('fichar')} className="w-full mt-3 text-sm text-gray-600 underline">Fichar otro evento</button>
            </>
          ) : jornada.enPausa ? (
            <>
              <div className="my-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                <div className="inline-flex px-3 py-1 bg-yellow-500 text-white rounded-full text-sm font-bold">⏸ En pausa</div>
                <div className="text-5xl font-mono font-bold mt-3">{formatHoras(elapsedMs)}</div>
                <div className="text-sm text-gray-600">Tiempo trabajado hasta la pausa</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => iniciarFlujo('pausa_fin')} className="bg-green-600 text-white py-4 rounded-xl font-bold">▶ Reanudar</button>
                <button onClick={() => iniciarFlujo('salida')} className="bg-red-600 text-white py-4 rounded-xl font-bold">⏹ Finalizar</button>
              </div>
            </>
          ) : jornada.finalizada ? (
            <>
              <div className="my-4 p-4 bg-gray-100 border rounded-xl">
                <div className="inline-flex px-3 py-1 bg-gray-800 text-white rounded-full text-sm font-bold">✓ Jornada finalizada</div>
                <div className="text-5xl font-mono font-bold mt-3">{formatHoras(elapsedMs)}</div>
                <div className="text-sm text-gray-600">Total trabajado hoy</div>
              </div>
              <p className="text-sm text-gray-500 mb-3">Ya cerraste el día. Si necesitas reabrir, inicia una nueva entrada.</p>
              <button onClick={() => iniciarFlujo('entrada')} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold">Iniciar nueva jornada</button>
            </>
          ) : null}

          {msg && <div className="mt-4 p-3 rounded border text-sm" style={{ background: msg.startsWith('✓') ? '#ecfdf5' : '#fef2f2' }}>{msg}</div>}
        </div>

        <div className="bg-white p-4 rounded-xl shadow">
          <h3 className="font-bold mb-3">Hoy · {historialHoy.length} fichajes</h3>
          {historialHoy.length === 0 ? <p className="text-sm text-gray-500">Sin fichajes hoy</p> : (
            <div className="space-y-2">
              {[...historialHoy].reverse().map(f=>(
                <div key={f.id} className="flex gap-3 border rounded p-2 text-sm">
                  <img src={f.foto_url} className="w-12 h-12 object-cover rounded" />
                  <div>
                    <div className="font-semibold">{f.tipo} · {new Date(f.created_at).toLocaleTimeString()}</div>
                    <div className="text-xs text-gray-600">{f.direccion}</div>
                    <div className={f.dentro_geocerca ? 'text-green-600 text-xs' : 'text-red-600 text-xs'}>{f.dentro_geocerca ? '✓ Dentro' : `⚠ Fuera (${f.distancia_m} m)`}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <details className="mt-4">
            <summary className="text-sm text-gray-600 cursor-pointer">Ver historial completo ({historial.length})</summary>
            <div className="space-y-2 mt-2">
              {historial.map(f=>(
                <div key={f.id} className="flex gap-2 border rounded p-2 text-xs">
                  <img src={f.foto_url} className="w-10 h-10 object-cover rounded" />
                  <div><div className="font-semibold">{f.tipo} · {new Date(f.created_at).toLocaleString()}</div><div className="text-gray-600 truncate max-w-[200px]">{f.direccion}</div></div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    )
  }

  // FICHAR VIEW - autenticación con cámara + ubicación directa
  return (
    <div className="max-w-xl mx-auto bg-white p-5 rounded-xl shadow space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={()=>{ stopCamera(); setView('home') }} className="px-3 py-1 border rounded text-sm">← Volver</button>
        <h2 className="text-xl font-bold flex-1 text-center">
          {ficharTipo==='entrada' ? 'Iniciar jornada' : ficharTipo==='salida' ? 'Finalizar jornada' : ficharTipo==='pausa_inicio' ? 'Pausar' : 'Reanudar'} — Autenticación
        </h2>
      </div>
      <p className="text-sm text-center text-gray-500">Se tomará foto con cámara frontal y ubicación GPS automáticamente</p>

      <div className="flex gap-2">
        <button onClick={startCamera} className="flex-1 bg-gray-900 text-white py-2 rounded text-sm">{stream ? 'Cámara activa ✓' : 'Reactivar cámara'}</button>
        <button onClick={getLocation} disabled={loadingLoc} className="flex-1 bg-blue-600 text-white py-2 rounded text-sm disabled:opacity-50">{loadingLoc ? 'GPS...' : coords ? 'GPS ✓ Actualizar' : 'Obtener GPS'}</button>
      </div>

      <div className="relative bg-black rounded overflow-hidden aspect-[4/3] grid place-items-center">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        {!stream && <span className="absolute text-white text-sm">Activando cámara...</span>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <button onClick={capturarFoto} disabled={!stream} className="w-full bg-amber-500 text-white py-3 rounded font-bold disabled:opacity-50">📸 Capturar foto</button>
      {fotoPreview && <div><img src={fotoPreview} className="w-full rounded border" /><p className="text-xs text-green-600 text-center">Foto lista ✓</p></div>}

      <div className="bg-gray-50 p-3 rounded border space-y-2">
        <label className="text-sm font-semibold">Sucursal</label>
        <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} className="w-full border rounded px-3 py-2 bg-white text-sm">
          <option value="auto">Automático {autoMejor ? `(${autoMejor.nombre} · ${(autoMejor as any)._dist}m)` : ''}</option>
          {sucursalesOrdenadas.map((s:any)=> <option key={s.id} value={s.id}>{s.nombre} {(s as any).provincia ? `· ${(s as any).provincia}`:''} — {s._dist!=null?`${s._dist}m ${s._dentro?'✓':''} · ${s.radio_m}m`: `${s.radio_m}m`}</option>)}
        </select>
      </div>

      <div className="text-sm bg-gray-50 p-3 rounded border">
        {coords ? <><div>📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</div><div className="text-gray-600 text-xs">{direccion ?? '...'}</div>
          {sucursales.length>0 && <div className="text-xs mt-1">{sucursalesOrdenadas.slice(0,1).map((s:any)=> <span key={s.id} className={s._dentro?'text-green-700':'text-red-600'}>{s.nombre}: {s._dist}m {s._dentro?'✓ DENTRO':'⚠ FUERA'} (radio {s.radio_m} m)</span>)}</div>}
        </> : <span className="text-gray-500">Obteniendo ubicación automática...</span>}
      </div>

      <button onClick={fichar} disabled={enviando || !coords || !fotoPreview} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50">
        {enviando ? 'Enviando...' : `Confirmar ${ficharTipo}`}
      </button>
      {msg && <div className="p-3 rounded border text-sm" style={{ background: msg.startsWith('✓') ? '#ecfdf5' : '#fef2f2' }}>{msg}</div>}
    </div>
  )
}
