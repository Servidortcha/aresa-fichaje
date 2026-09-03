import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents } from 'react-leaflet'
import { parseCoordinate, decimalToDMS } from '../../lib/geofence'
import 'leaflet/dist/leaflet.css'

const PROVINCIAS = ['Córdoba','Buenos Aires','Santa Fe','Mendoza','Tucumán','Salta','Entre Ríos','La Rioja','San Juan','San Luis','Santiago del Estero','Catamarca','Jujuy','Chaco','Formosa','Misiones','Corrientes','La Pampa','Río Negro','Neuquén','Chubut','Santa Cruz','Tierra del Fuego','CABA']

function ClickSetter({ onPick }: { onPick:(lat:number,lng:number)=>void }){
  useMapEvents({ click(e){ onPick(e.latlng.lat, e.latlng.lng) } })
  return null
}

export default function SucursalForm(){
  const { id } = useParams()
  const nav = useNavigate()
  const isEdit = !!id
  const [form, setForm] = useState({ nombre:'', direccion:'', provincia:'Córdoba', lat:-32.2426, lng:-63.542, radio_m:300, activa:true })
  const [dmsInput, setDmsInput] = useState('')
  const [msg, setMsg] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    if(!id) return
    supabase.from('geocercas').select('*').eq('id', id).single().then(({ data, error })=>{
      if(error) setMsg(error.message)
      else if(data){
        const s = data as any
        setForm({ nombre:s.nombre, direccion:s.direccion ?? '', provincia:s.provincia ?? 'Córdoba', lat:s.lat, lng:s.lng, radio_m:s.radio_m, activa:s.activa })
        setDmsInput(decimalToDMS(s.lat, s.lng))
      }
    })
  },[id])

  const guardar = async()=>{
    setMsg(null)
    if(!form.nombre.trim()) return setMsg('Nombre obligatorio')
    setLoading(true)
    const payload:any={ nombre:form.nombre.trim(), lat:form.lat, lng:form.lng, radio_m:Number(form.radio_m), activa:form.activa, direccion:form.direccion||null, provincia:form.provincia||null, tipo:'sucursal' }
    let error:any=null
    if(isEdit){
      const r=await supabase.from('geocercas').update(payload).eq('id', id!)
      error=r.error
      if(error && error.message.includes('column')){
        const { direccion, provincia, tipo, ...fb }=payload
        error=(await supabase.from('geocercas').update(fb).eq('id', id!)).error
      }
    } else {
      const r=await supabase.from('geocercas').insert(payload)
      error=r.error
      if(error && error.message.includes('column')){
        const { direccion, provincia, tipo, ...fb }=payload
        error=(await supabase.from('geocercas').insert(fb as any)).error
      }
    }
    setLoading(false)
    if(error) setMsg('Error: '+error.message)
    else nav('/admin/sucursales')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/admin/sucursales" className="text-sm border px-3 py-1 rounded bg-white">← Volver</Link>
        <h2 className="text-xl font-bold">{isEdit ? 'Editar sucursal' : 'Nueva sucursal / frente'}</h2>
      </div>

      <div className="bg-white p-5 rounded-xl shadow space-y-4">
        <div className="grid gap-3">
          <input placeholder="Nombre (ej: Córdoba - Taller Central)" value={form.nombre} onChange={e=>setForm({...form, nombre:e.target.value})} className="border rounded px-3 py-2" />
          <div className="grid md:grid-cols-2 gap-3">
            <select value={form.provincia} onChange={e=>setForm({...form, provincia:e.target.value})} className="border rounded px-3 py-2">
              {PROVINCIAS.map(p=> <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activa} onChange={e=>setForm({...form, activa:e.target.checked})}/> Activa</label>
          </div>
          <input placeholder="Dirección (ej: Av. Colón 123)" value={form.direccion} onChange={e=>setForm({...form, direccion:e.target.value})} className="border rounded px-3 py-2" />

          <div className="flex gap-2">
            <input placeholder="Pega DMS: 32°14'39.7&quot;S 63°59'07.4&quot;W" value={dmsInput} onChange={e=>setDmsInput(e.target.value)} className="flex-1 border rounded px-3 py-2 font-mono text-sm" />
            <button onClick={()=>{
              const p=parseCoordinate(dmsInput)
              if(p){ setForm(f=>({...f, lat:Number(p.lat.toFixed(6)), lng:Number(p.lng.toFixed(6))})); setMsg(`DMS → ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`) }
              else setMsg('Formato no reconocido. Ej: 32°14\'39.7"S 63°59\'07.4"W')
            }} className="px-4 py-2 bg-blue-600 text-white rounded">Convertir</button>
          </div>
          <p className="text-xs text-gray-500 -mt-2">Soporta: <code>32°14'39.7"S 63°59'07.4"W</code> · <code>-32.2426, -63.542</code> · click en mapa</p>

          <div className="grid md:grid-cols-2 gap-3">
            <input type="number" step="0.00001" value={form.lat} onChange={e=>setForm({...form, lat:parseFloat(e.target.value)||0})} className="border rounded px-3 py-2" placeholder="Lat" />
            <input type="number" step="0.00001" value={form.lng} onChange={e=>setForm({...form, lng:parseFloat(e.target.value)||0})} className="border rounded px-3 py-2" placeholder="Lng" />
          </div>
          <p className="text-xs font-mono text-gray-600">Dec: {form.lat.toFixed(6)}, {form.lng.toFixed(6)} · DMS: {decimalToDMS(form.lat, form.lng)}</p>

          <div className="flex items-center gap-3">
            <label className="text-sm">Radio (m):</label>
            <input type="range" min={50} max={2000} step={50} value={form.radio_m} onChange={e=>setForm({...form, radio_m:parseInt(e.target.value)})} className="flex-1" />
            <input type="number" value={form.radio_m} onChange={e=>setForm({...form, radio_m:parseInt(e.target.value)||0})} className="border rounded px-2 py-1 w-24" />
          </div>
        </div>

        <button onClick={guardar} disabled={loading} className="w-full bg-red-600 text-white py-3 rounded font-bold disabled:opacity-50">{loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear sucursal'}</button>
        {msg && <div className="text-sm p-3 rounded border bg-blue-50">{msg}</div>}

        <div className="h-[380px] rounded overflow-hidden border">
          <MapContainer center={[form.lat, form.lng]} zoom={10} style={{height:'100%',width:'100%'}}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <ClickSetter onPick={(lat,lng)=>{ setForm(f=>({...f, lat, lng})); setDmsInput(decimalToDMS(lat,lng)) }} />
            <Circle center={[form.lat, form.lng]} radius={form.radio_m} pathOptions={{ color:'#dc2626', fillColor:'#fca5a5', fillOpacity:0.25 }}><Popup>{form.nombre || 'Nueva'} · {form.radio_m} m</Popup></Circle>
            <Marker position={[form.lat, form.lng]}><Popup>{form.nombre || 'Nueva'}</Popup></Marker>
          </MapContainer>
        </div>
        <p className="text-xs text-gray-500">Click en el mapa para tomar coordenadas automáticamente.</p>
      </div>
    </div>
  )
}
