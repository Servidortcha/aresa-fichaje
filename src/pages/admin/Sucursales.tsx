import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Geocerca } from '../../lib/supabase'
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet'
import { decimalToDMS } from '../../lib/geofence'
import 'leaflet/dist/leaflet.css'

export default function Sucursales(){
  const [sucursales, setSucursales] = useState<Geocerca[]>([])
  const load = async()=>{
    const { data } = await supabase.from('geocercas').select('*').order('created_at')
    setSucursales((data as any) ?? [])
  }
  useEffect(()=>{ load() },[])
  const borrar = async(id:string)=>{
    if(!confirm('¿Borrar sucursal?')) return
    const { error } = await supabase.from('geocercas').delete().eq('id', id)
    if(error) alert(error.message); else load()
  }
  const center:[number,number] = sucursales[0] ? [sucursales[0].lat, sucursales[0].lng] : [-32.2426, -63.542]
  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl shadow flex justify-between items-center">
        <h2 className="text-xl font-bold">Sucursales / Frentes ({sucursales.length})</h2>
        <Link to="/admin/sucursales/nueva" className="bg-red-600 text-white px-4 py-2 rounded">+ Nueva sucursal</Link>
      </div>
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="h-[420px] rounded overflow-hidden border">
          <MapContainer center={center} zoom={sucursales.length?6:5} style={{height:'100%',width:'100%'}}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {sucursales.map(s=>(
              <Circle key={s.id} center={[s.lat,s.lng]} radius={s.radio_m} pathOptions={{ color: s.activa ? '#2563eb':'#9ca3af', fillOpacity:0.2 }}>
                <Popup><b>{s.nombre}</b><br/>{(s as any).direccion ?? ''}<br/>{(s as any).provincia ?? ''}<br/>{decimalToDMS(s.lat,s.lng)}<br/>Radio {s.radio_m} m</Popup>
              </Circle>
            ))}
          </MapContainer>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {sucursales.map(s=>(
          <div key={s.id} className="bg-white border rounded-xl p-4 flex justify-between">
            <div>
              <div className="font-bold">{s.nombre} <span className="text-xs text-gray-500">{(s as any).provincia}</span> {!s.activa && <span className="ml-2 bg-gray-200 px-2 py-0.5 rounded text-xs">Inactiva</span>}</div>
              <div className="text-sm text-gray-600">{(s as any).direccion ?? '—'}</div>
              <div className="text-xs font-mono">{s.lat.toFixed(6)}, {s.lng.toFixed(6)} · {decimalToDMS(s.lat,s.lng)} · {s.radio_m} m</div>
            </div>
            <div className="flex flex-col gap-2">
              <Link to={`/admin/sucursales/${s.id}`} className="px-3 py-1 border rounded text-sm text-center">Editar</Link>
              <button onClick={()=>borrar(s.id)} className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-sm">Borrar</button>
            </div>
          </div>
        ))}
        {sucursales.length===0 && <p className="text-sm text-gray-500 bg-white p-4 rounded-xl">Aún no hay sucursales. <Link to="/admin/sucursales/nueva" className="underline">Crea la primera</Link></p>}
      </div>
    </div>
  )
}
