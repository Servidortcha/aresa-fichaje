import { useEffect, useState } from 'react'
import { supabase, type Fichaje, type Geocerca } from '../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import * as XLSX from 'xlsx'

// fix leaflet icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function Admin() {
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [geocercas, setGeocercas] = useState<Geocerca[]>([])
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  const [filtroEmpleado, setFiltroEmpleado] = useState<string>('')
  const [filtroFecha, setFiltroFecha] = useState<string>('')
  const [nuevaGeocerca, setNuevaGeocerca] = useState({ nombre: '', lat: -32.07, lng: -63.54, radio_m: 200 })

  const load = async () => {
    const { data } = await supabase
      .from('fichajes')
      .select('*, profiles(nombre,email)')
      .order('created_at', { ascending: false })
      .limit(200)
    setFichajes((data as any) ?? [])
    const { data: g } = await supabase.from('geocercas').select('*').order('created_at')
    setGeocercas((g as Geocerca[]) ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('fichajes-admin').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fichajes' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const filtrados = fichajes.filter(f => {
    if (filtroTipo && f.tipo !== filtroTipo) return false
    if (filtroEmpleado && !f.profiles?.nombre.toLowerCase().includes(filtroEmpleado.toLowerCase()) && !f.profiles?.email.toLowerCase().includes(filtroEmpleado.toLowerCase())) return false
    if (filtroFecha && !f.created_at.startsWith(filtroFecha)) return false
    return true
  })

  const exportExcel = () => {
    const rows = filtrados.map(f => ({
      Fecha: new Date(f.created_at).toLocaleString(),
      Empleado: f.profiles?.nombre,
      Email: f.profiles?.email,
      Tipo: f.tipo,
      Lat: f.lat,
      Lng: f.lng,
      Direccion: f.direccion,
      DentroGeocerca: f.dentro_geocerca ? 'SI' : 'NO',
      Distancia_m: f.distancia_m,
      Foto: f.foto_url,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fichajes')
    XLSX.writeFile(wb, `Aresa_Fichajes_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const crearGeocerca = async () => {
    const { error } = await supabase.from('geocercas').insert(nuevaGeocerca)
    if (error) alert(error.message)
    else load()
  }

  const mapCenter: [number, number] = geocercas[0] ? [geocercas[0].lat, geocercas[0].lng] : filtrados[0] ? [filtrados[0].lat, filtrados[0].lng] : [-32.07, -63.545]

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow flex flex-wrap gap-3 items-end">
        <h2 className="text-xl font-bold w-full">Panel Admin - Aresa Fichaje</h2>
        <input value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)} placeholder="Filtrar empleado" className="border rounded px-3 py-2" />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="border rounded px-3 py-2">
          <option value="">Todos los tipos</option>
          <option value="entrada">Entrada</option>
          <option value="pausa_inicio">Pausa inicio</option>
          <option value="pausa_fin">Pausa fin</option>
          <option value="salida">Salida</option>
        </select>
        <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} className="border rounded px-3 py-2" />
        <button onClick={exportExcel} className="bg-green-600 text-white px-4 py-2 rounded">Exportar Excel</button>
        <span className="text-sm text-gray-500">{filtrados.length} registros</span>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <h3 className="font-bold mb-2">Mapa - Geocercas y fichajes</h3>
        <div className="h-[420px] rounded overflow-hidden border">
          <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {geocercas.map(g => (
              <Circle key={g.id} center={[g.lat, g.lng]} radius={g.radio_m} pathOptions={{ color: 'red', fillColor: '#f87171', fillOpacity: 0.2 }}>
                <Popup><b>{g.nombre}</b><br/>Radio {g.radio_m} m</Popup>
              </Circle>
            ))}
            {filtrados.map(f => (
              <Marker key={f.id} position={[f.lat, f.lng]}>
                <Popup>
                  <b>{f.profiles?.nombre}</b> - {f.tipo}<br/>
                  {new Date(f.created_at).toLocaleString()}<br/>
                  {f.direccion}<br/>
                  {f.dentro_geocerca ? '✓ Dentro' : `⚠ Fuera (${f.distancia_m} m)`}<br/>
                  <a href={f.foto_url ?? '#'} target="_blank" rel="noreferrer">Ver foto</a> · <a href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer">Google Maps</a>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <h3 className="font-bold mb-2">Geocercas (zonas permitidas)</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          <input placeholder="Nombre (ej: Taller Tancacha)" value={nuevaGeocerca.nombre} onChange={e => setNuevaGeocerca({ ...nuevaGeocerca, nombre: e.target.value })} className="border rounded px-3 py-2 flex-1 min-w-[180px]" />
          <input type="number" step="0.00001" value={nuevaGeocerca.lat} onChange={e => setNuevaGeocerca({ ...nuevaGeocerca, lat: parseFloat(e.target.value) })} className="border rounded px-3 py-2 w-32" />
          <input type="number" step="0.00001" value={nuevaGeocerca.lng} onChange={e => setNuevaGeocerca({ ...nuevaGeocerca, lng: parseFloat(e.target.value) })} className="border rounded px-3 py-2 w-32" />
          <input type="number" value={nuevaGeocerca.radio_m} onChange={e => setNuevaGeocerca({ ...nuevaGeocerca, radio_m: parseInt(e.target.value) })} className="border rounded px-3 py-2 w-28" />
          <button onClick={crearGeocerca} className="bg-red-600 text-white px-4 py-2 rounded">Crear geocerca</button>
        </div>
        <p className="text-xs text-gray-500 mb-2">Tip: click en el mapa no crea aún, copia coords de Google Maps. Radio en metros (ej 200 = 200m alrededor).</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {geocercas.map(g => (
            <div key={g.id} className="border rounded p-2 text-sm flex justify-between">
              <span><b>{g.nombre}</b> — {g.lat.toFixed(5)}, {g.lng.toFixed(5)} · {g.radio_m} m</span>
              <button onClick={async () => { await supabase.from('geocercas').delete().eq('id', g.id); load() }} className="text-red-600">Borrar</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Fecha</th>
                <th className="p-2 text-left">Empleado</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Ubicación</th>
                <th className="p-2">Geocerca</th>
                <th className="p-2">Foto</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(f => (
                <tr key={f.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</td>
                  <td className="p-2"><div className="font-medium">{f.profiles?.nombre}</div><div className="text-gray-500 text-xs">{f.profiles?.email}</div></td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${f.tipo === 'entrada' ? 'bg-green-100 text-green-700' : f.tipo === 'salida' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'}`}>{f.tipo}</span>
                  </td>
                  <td className="p-2">
                    <a href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{f.lat.toFixed(4)}, {f.lng.toFixed(4)}</a>
                    <div className="text-xs text-gray-500 max-w-[260px] truncate">{f.direccion}</div>
                  </td>
                  <td className="p-2 text-center">
                    {f.dentro_geocerca ? <span className="text-green-600 font-bold">✓ Dentro</span> : <span className="text-red-600 font-bold">⚠ {f.distancia_m} m fuera</span>}
                  </td>
                  <td className="p-2">
                    {f.foto_url ? <a href={f.foto_url} target="_blank" rel="noreferrer"><img src={f.foto_url} className="w-14 h-14 object-cover rounded border" /></a> : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
