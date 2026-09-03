import { useEffect, useRef, useState } from 'react'
import { supabase, type Geocerca } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { dentroDeGeocerca, reverseGeocode } from '../lib/geofence'

type Tipo = 'entrada' | 'pausa_inicio' | 'pausa_fin' | 'salida'

export default function Empleado() {
  const { userId } = useAuth()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [direccion, setDireccion] = useState<string | null>(null)
  const [geocercas, setGeocercas] = useState<Geocerca[]>([])
  const [loadingLoc, setLoadingLoc] = useState(false)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [historial, setHistorial] = useState<any[]>([])

  useEffect(() => {
    supabase.from('geocercas').select('*').eq('activa', true).then(({ data }) => setGeocercas((data as Geocerca[]) ?? []))
    loadHistorial()
  }, [userId])

  const loadHistorial = async () => {
    if (!userId) return
    const { data } = await supabase.from('fichajes').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10)
    setHistorial(data ?? [])
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

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
  }

  const getLocation = async () => {
    setLoadingLoc(true)
    setMsg(null)
    if (!navigator.geolocation) {
      setMsg('Geolocalización no soportada')
      setLoadingLoc(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setCoords({ lat, lng })
        const dir = await reverseGeocode(lat, lng)
        setDireccion(dir)
        setLoadingLoc(false)
      },
      err => {
        setMsg('Error GPS: ' + err.message + ' - Debe permitir ubicación.')
        setLoadingLoc(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const capturarFoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const v = videoRef.current
    const c = canvasRef.current
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(v, 0, 0)
    setFotoPreview(c.toDataURL('image/jpeg', 0.8))
  }

  const fichar = async (tipo: Tipo) => {
    if (!userId) return setMsg('No autenticado')
    if (!coords) return setMsg('Primero obtene tu ubicación con el botón GPS')
    if (!fotoPreview) return setMsg('Primero saca la foto con la cámara')

    setEnviando(true)
    setMsg(null)
    try {
      // evaluar geocerca más cercana
      let dentro = false
      let geocerca_id: string | null = null
      let distancia: number | null = null
      let mejor: Geocerca | null = null
      let minDist = Infinity
      for (const g of geocercas) {
        const r = dentroDeGeocerca(coords.lat, coords.lng, g.lat, g.lng, g.radio_m)
        if (r.distancia < minDist) { minDist = r.distancia; mejor = g; dentro = r.dentro; distancia = r.distancia }
      }
      if (mejor) { geocerca_id = mejor.id }

      // subir foto a Storage
      const blob = await (await fetch(fotoPreview)).blob()
      const path = `${userId}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('fichajes-fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('fichajes-fotos').getPublicUrl(path)

      const { error } = await supabase.from('fichajes').insert({
        user_id: userId,
        tipo,
        lat: coords.lat,
        lng: coords.lng,
        direccion,
        foto_url: pub.publicUrl,
        dentro_geocerca: dentro,
        geocerca_id,
        distancia_m: distancia,
      })
      if (error) throw error

      if (!dentro && geocercas.length > 0) {
        setMsg(`✓ Fichaje ${tipo} registrado FUERA de geocerca (${distancia}m) - el admin será notificado.`)
      } else {
        setMsg(`✓ Fichaje ${tipo} registrado correctamente ${dentro ? `dentro de ${mejor?.nombre}` : ''}`)
      }
      setFotoPreview(null)
      loadHistorial()
    } catch (e: any) {
      setMsg('Error al fichar: ' + e.message)
    } finally {
      setEnviando(false)
    }
  }

  useEffect(() => { return () => stopCamera() }, [])

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white p-5 rounded-xl shadow space-y-4">
        <h2 className="text-xl font-bold">Fichar - Aresa</h2>

        <div className="flex gap-2">
          {!stream ? <button onClick={startCamera} className="flex-1 bg-gray-900 text-white py-2 rounded">Activar cámara</button>
            : <button onClick={stopCamera} className="flex-1 bg-gray-200 py-2 rounded">Apagar cámara</button>}
          <button onClick={getLocation} disabled={loadingLoc} className="flex-1 bg-blue-600 text-white py-2 rounded disabled:opacity-50">
            {loadingLoc ? 'Buscando GPS...' : coords ? 'Actualizar GPS' : 'Obtener ubicación'}
          </button>
        </div>

        <div className="relative bg-black rounded overflow-hidden aspect-[4/3] grid place-items-center">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {!stream && <span className="absolute text-white text-sm">Cámara apagada</span>}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        <button onClick={capturarFoto} disabled={!stream} className="w-full bg-amber-500 text-white py-2 rounded font-semibold disabled:opacity-50">📸 Capturar foto (obligatoria)</button>

        {fotoPreview && (
          <div>
            <p className="text-sm font-medium">Foto capturada:</p>
            <img src={fotoPreview} className="w-full rounded border" />
            <button onClick={() => setFotoPreview(null)} className="text-sm text-red-600 mt-1">Descartar y repetir</button>
          </div>
        )}

        <div className="text-sm bg-gray-50 p-3 rounded border">
          {coords ? (
            <>
              <div>📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</div>
              <div className="text-gray-600">{direccion ?? 'Resolviendo dirección...'}</div>
              {geocercas.length > 0 && mejorInfo(coords, geocercas)}
            </>
          ) : <span className="text-gray-500">Ubicación no obtenida - obligatorio para fichar</span>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => fichar('entrada')} disabled={enviando} className="bg-green-600 text-white py-3 rounded font-bold disabled:opacity-50">Entrada</button>
          <button onClick={() => fichar('salida')} disabled={enviando} className="bg-red-600 text-white py-3 rounded font-bold disabled:opacity-50">Salida</button>
          <button onClick={() => fichar('pausa_inicio')} disabled={enviando} className="bg-yellow-500 text-white py-3 rounded font-bold disabled:opacity-50">Pausa inicio</button>
          <button onClick={() => fichar('pausa_fin')} disabled={enviando} className="bg-yellow-700 text-white py-3 rounded font-bold disabled:opacity-50">Pausa fin</button>
        </div>

        {msg && <div className="p-3 rounded border text-sm" style={{ background: msg.startsWith('✓') ? '#ecfdf5' : '#fef2f2' }}>{msg}</div>}
      </div>

      <div className="bg-white p-5 rounded-xl shadow">
        <h3 className="font-bold mb-3">Mis últimos fichajes</h3>
        <div className="space-y-2">
          {historial.length === 0 && <p className="text-sm text-gray-500">Sin fichajes aún</p>}
          {historial.map(f => (
            <div key={f.id} className="flex gap-3 border rounded p-2 text-sm">
              <img src={f.foto_url} className="w-16 h-16 object-cover rounded" />
              <div>
                <div className="font-semibold">{f.tipo} · {new Date(f.created_at).toLocaleString()}</div>
                <div className="text-gray-600">{f.direccion}</div>
                <div className={f.dentro_geocerca ? 'text-green-600' : 'text-red-600'}>
                  {f.dentro_geocerca ? '✓ Dentro geocerca' : `⚠ Fuera (${f.distancia_m} m)`} · {f.lat.toFixed(4)}, {f.lng.toFixed(4)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function mejorInfo(coords: { lat: number; lng: number }, geocercas: Geocerca[]) {
  let best: Geocerca | null = null
  let bestDist = Infinity
  let dentro = false
  for (const g of geocercas) {
    const r = dentroDeGeocerca(coords.lat, coords.lng, g.lat, g.lng, g.radio_m)
    if (r.distancia < bestDist) { bestDist = r.distancia; best = g; dentro = r.dentro }
  }
  if (!best) return null
  return (
    <div className={dentro ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
      Geocerca más cercana: {best.nombre} — {bestDist} m {dentro ? '✓ DENTRO' : '⚠ FUERA'} (radio {best.radio_m} m)
    </div>
  )
}
