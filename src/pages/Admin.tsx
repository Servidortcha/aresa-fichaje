import { useEffect, useState } from 'react'
import { supabase, type Fichaje, type Geocerca } from '../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents } from 'react-leaflet'
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

const PROVINCIAS = ['Córdoba','Buenos Aires','Santa Fe','Mendoza','Tucumán','Salta','Entre Ríos','La Rioja','San Juan','San Luis','Santiago del Estero','Catamarca','Jujuy','Chaco','Formosa','Misiones','Corrientes','La Pampa','Río Negro','Neuquén','Chubut','Santa Cruz','Tierra del Fuego','CABA']

function ClickSetter({ onPick }: { onPick: (lat:number,lng:number)=>void }) {
  useMapEvents({
    click(e){ onPick(e.latlng.lat, e.latlng.lng) }
  })
  return null
}

export default function Admin() {
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [sucursales, setSucursales] = useState<Geocerca[]>([])
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  const [filtroEmpleado, setFiltroEmpleado] = useState<string>('')
  const [filtroFecha, setFiltroFecha] = useState<string>('')
  const [filtroSucursal, setFiltroSucursal] = useState<string>('')

  // form sucursal
  const [form, setForm] = useState({ id: null as string | null, nombre: '', direccion: '', provincia: 'Córdoba', lat: -32.2426, lng: -63.542, radio_m: 300, activa: true })
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase.from('fichajes').select('*, profiles(nombre,email)').order('created_at', { ascending: false }).limit(300)
    setFichajes((data as any) ?? [])
    const { data: g, error } = await supabase.from('geocercas').select('*').order('created_at')
    if(error) console.error(error)
    // si tiene columnas nuevas, vienen; si no, igual funciona
    setSucursales((g as any) ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('fichajes-admin').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fichajes' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const sucMap = new Map(sucursales.map(s=> [s.id, s]))

  const filtrados = fichajes.filter(f => {
    if (filtroTipo && f.tipo !== filtroTipo) return false
    if (filtroEmpleado && !f.profiles?.nombre.toLowerCase().includes(filtroEmpleado.toLowerCase()) && !f.profiles?.email.toLowerCase().includes(filtroEmpleado.toLowerCase())) return false
    if (filtroFecha && !f.created_at.startsWith(filtroFecha)) return false
    if (filtroSucursal) {
      const suc = f.geocerca_id ? sucMap.get(f.geocerca_id) : null
      if(filtroSucursal === '__sin__' && f.geocerca_id) return false
      if(filtroSucursal !== '__sin__' && f.geocerca_id !== filtroSucursal) return false
      // si filtra por sucursal, incluye también fichajes fuera pero cuya más cercana es esa? por ahora exacto
      if(!suc && filtroSucursal !== '__sin__') return false
    }
    return true
  })

  const exportExcel = () => {
    const rows = filtrados.map(f => {
      const suc = f.geocerca_id ? sucMap.get(f.geocerca_id) : null
      return {
        Fecha: new Date(f.created_at).toLocaleString(),
        Empleado: f.profiles?.nombre,
        Email: f.profiles?.email,
        Tipo: f.tipo,
        Sucursal: suc?.nombre ?? (f.geocerca_id ? 'ID:'+f.geocerca_id : 'Fuera de sucursal'),
        Provincia: (suc as any)?.provincia ?? '',
        Lat: f.lat,
        Lng: f.lng,
        Direccion: f.direccion,
        DentroSucursal: f.dentro_geocerca ? 'SI' : 'NO',
        Distancia_m: f.distancia_m,
        Foto: f.foto_url,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fichajes')
    XLSX.writeFile(wb, `Aresa_Fichajes_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const guardarSucursal = async () => {
    setMsg(null)
    if(!form.nombre.trim()) return setMsg('Nombre de sucursal obligatorio')
    if(!form.lat || !form.lng) return setMsg('Lat/Lng obligatorios (click en mapa)')
    const payload:any = { nombre: form.nombre.trim(), lat: form.lat, lng: form.lng, radio_m: Number(form.radio_m), activa: form.activa, direccion: form.direccion || null, provincia: form.provincia || null, tipo: 'sucursal' }
    // intenta con columnas nuevas, si falla por columna inexistente, reintenta sin direccion/provincia
    let error:any = null
    if(form.id){
      const r = await supabase.from('geocercas').update(payload).eq('id', form.id)
      error = r.error
      if(error && error.message.includes('column')){
        const { direccion, provincia, tipo, ...fallback } = payload
        const r2 = await supabase.from('geocercas').update(fallback).eq('id', form.id)
        error = r2.error
      }
    } else {
      const r = await supabase.from('geocercas').insert(payload)
      error = r.error
      if(error && error.message.includes('column')){
        const { direccion, provincia, tipo, ...fallback } = payload
        const r2 = await supabase.from('geocercas').insert(fallback as any)
        error = r2.error
      }
    }
    if(error) setMsg('Error: '+error.message)
    else { setMsg(form.id ? 'Sucursal actualizada' : 'Sucursal creada'); setForm({ id:null, nombre:'', direccion:'', provincia:'Córdoba', lat: form.lat, lng: form.lng, radio_m:300, activa:true }); load() }
  }

  const editar = (s: Geocerca) => {
    setForm({ id: s.id, nombre: s.nombre, direccion: (s as any).direccion ?? '', provincia: (s as any).provincia ?? 'Córdoba', lat: s.lat, lng: s.lng, radio_m: s.radio_m, activa: s.activa })
    setMsg('Editando: '+s.nombre+' — modifica y guarda')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const borrar = async (id:string) => {
    if(!confirm('¿Borrar sucursal? Los fichajes históricos quedan pero sin referencia.')) return
    const { error } = await supabase.from('geocercas').delete().eq('id', id)
    if(error) alert(error.message)
    else load()
  }

  const mapCenter:[number,number] = form.lat && form.lng ? [form.lat, form.lng] : sucursales[0] ? [sucursales[0].lat, sucursales[0].lng] : filtrados[0] ? [filtrados[0].lat, filtrados[0].lng] : [-32.2426, -63.542]

  return (
    <div className="space-y-6">
      {/* filtros */}
      <div className="bg-white p-4 rounded-xl shadow flex flex-wrap gap-3 items-end">
        <h2 className="text-xl font-bold w-full">Panel Admin — Sucursales / Frentes</h2>
        <p className="w-full text-sm text-gray-500 -mt-2">Gestiona sucursales fijas en todo el país. Cada una con su radio propio. El fichaje es automático + manual.</p>
        <input value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)} placeholder="Filtrar empleado" className="border rounded px-3 py-2" />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="border rounded px-3 py-2">
          <option value="">Todos los tipos</option>
          <option value="entrada">Entrada</option>
          <option value="pausa_inicio">Pausa inicio</option>
          <option value="pausa_fin">Pausa fin</option>
          <option value="salida">Salida</option>
        </select>
        <select value={filtroSucursal} onChange={e => setFiltroSucursal(e.target.value)} className="border rounded px-3 py-2 min-w-[180px]">
          <option value="">Todas las sucursales</option>
          <option value="__sin__">Fuera de sucursal</option>
          {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre} { (s as any).provincia ? `· ${(s as any).provincia}`:''} </option>)}
        </select>
        <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} className="border rounded px-3 py-2" />
        <button onClick={exportExcel} className="bg-green-600 text-white px-4 py-2 rounded">Exportar Excel</button>
        <span className="text-sm text-gray-500">{filtrados.length} fichajes</span>
      </div>

      {/* form sucursales */}
      <div className="bg-white p-4 rounded-xl shadow">
        <h3 className="font-bold mb-3">{form.id ? 'Editar sucursal' : 'Nueva sucursal / frente'}</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <input placeholder="Nombre sucursal (ej: Córdoba - Taller Central)" value={form.nombre} onChange={e=>setForm({...form, nombre:e.target.value})} className="border rounded px-3 py-2 md:col-span-2" />
          <select value={form.provincia} onChange={e=>setForm({...form, provincia:e.target.value})} className="border rounded px-3 py-2">
            {PROVINCIAS.map(p=> <option key={p} value={p}>{p}</option>)}
          </select>
          <input placeholder="Dirección (opcional, ej: Av. Colón 123)" value={form.direccion} onChange={e=>setForm({...form, direccion:e.target.value})} className="border rounded px-3 py-2 md:col-span-3" />
          <div className="flex gap-2">
            <input type="number" step="0.00001" value={form.lat} onChange={e=>setForm({...form, lat:parseFloat(e.target.value)})} className="border rounded px-3 py-2 w-full" placeholder="Lat" />
            <input type="number" step="0.00001" value={form.lng} onChange={e=>setForm({...form, lng:parseFloat(e.target.value)})} className="border rounded px-3 py-2 w-full" placeholder="Lng" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm whitespace-nowrap">Radio (m):</label>
            <input type="range" min={50} max={2000} step={50} value={form.radio_m} onChange={e=>setForm({...form, radio_m: parseInt(e.target.value)})} className="flex-1" />
            <input type="number" value={form.radio_m} onChange={e=>setForm({...form, radio_m: parseInt(e.target.value)||0})} className="border rounded px-2 py-1 w-24" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activa} onChange={e=>setForm({...form, activa:e.target.checked})} /> Activa</label>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={guardarSucursal} className="bg-red-600 text-white px-6 py-2 rounded font-semibold">{form.id ? 'Guardar cambios' : 'Crear sucursal'}</button>
          {form.id && <button onClick={()=>setForm({ id:null, nombre:'', direccion:'', provincia:'Córdoba', lat:-32.2426, lng:-63.542, radio_m:300, activa:true })} className="border px-4 py-2 rounded">Cancelar</button>}
          <span className="text-sm text-gray-500 self-center">Tip: haz click en el mapa para tomar coordenadas. El radio lo definís vos (ej: obra 150m, planta 500m).</span>
        </div>
        {msg && <div className="mt-3 text-sm p-2 bg-blue-50 border border-blue-200 rounded">{msg}</div>}
        <div className="mt-3 h-[380px] rounded overflow-hidden border">
          <MapContainer center={mapCenter} zoom={6} style={{height:'100%', width:'100%'}}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <ClickSetter onPick={(lat,lng)=>setForm(f=>({...f, lat, lng}))} />
            {sucursales.map(s=> (
              <Circle key={s.id} center={[s.lat, s.lng]} radius={s.radio_m} pathOptions={{ color: s.id===form.id ? '#dc2626' : '#2563eb', fillColor: s.id===form.id ? '#fca5a5' : '#93c5fd', fillOpacity:0.25, weight: s.id===form.id ? 3:1 }}>
                <Popup><b>{s.nombre}</b><br/>{(s as any).direccion ?? ''}<br/>{(s as any).provincia ?? ''}<br/>Radio {s.radio_m} m · {s.activa ? 'Activa':'Inactiva'}</Popup>
              </Circle>
            ))}
            {/* marcador temporal para form */}
            <Marker position={[form.lat, form.lng]}><Popup> Nueva / edición — {form.nombre || 'sin nombre'}</Popup></Marker>
          </MapContainer>
        </div>
        <div className="grid md:grid-cols-2 gap-2 mt-4">
          {sucursales.map(s=> (
            <div key={s.id} className={`border rounded p-3 text-sm flex justify-between items-center ${s.activa ? 'bg-white':'bg-gray-50 opacity-70'}`}>
              <div>
                <div className="font-bold">{s.nombre} <span className="text-xs font-normal text-gray-500">{(s as any).provincia}</span> { !s.activa && <span className="ml-2 px-2 py-0.5 bg-gray-200 rounded text-xs">Inactiva</span>}</div>
                <div className="text-gray-600">{(s as any).direccion ?? '—'} · {s.lat.toFixed(5)}, {s.lng.toFixed(5)} · <b>{s.radio_m} m</b></div>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>editar(s)} className="px-3 py-1 border rounded bg-white">Editar</button>
                <button onClick={()=>borrar(s.id)} className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded">Borrar</button>
              </div>
            </div>
          ))}
          {sucursales.length===0 && <p className="text-sm text-gray-500">Aún no hay sucursales. Crea la primera (ej: Tancacha).</p>}
        </div>
      </div>

      {/* tabla fichajes */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="p-3 border-b flex justify-between items-center">
          <h3 className="font-bold">Fichajes {filtroSucursal ? `— ${sucMap.get(filtroSucursal)?.nombre ?? 'Fuera'}`: ''}</h3>
          <span className="text-xs text-gray-500">Mostrando {filtrados.length} de {fichajes.length}</span>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2 text-left">Fecha</th>
                <th className="p-2 text-left">Empleado</th>
                <th className="p-2">Tipo</th>
                <th className="p-2 text-left">Sucursal</th>
                <th className="p-2">Ubicación</th>
                <th className="p-2">Foto</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(f=>{
                const suc = f.geocerca_id ? sucMap.get(f.geocerca_id) : null
                return (
                <tr key={f.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</td>
                  <td className="p-2"><div className="font-medium">{f.profiles?.nombre}</div><div className="text-gray-500 text-xs">{f.profiles?.email}</div></td>
                  <td className="p-2 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${f.tipo==='entrada'?'bg-green-100 text-green-700':f.tipo==='salida'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-800'}`}>{f.tipo}</span></td>
                  <td className="p-2">
                    {suc ? <><b>{suc.nombre}</b><div className="text-xs text-gray-500">{(suc as any).provincia} · {f.dentro_geocerca ? '✓ Dentro' : `⚠ ${f.distancia_m}m fuera`} · {suc.radio_m}m</div></> : <span className="text-red-600 font-bold">Fuera</span>}
                  </td>
                  <td className="p-2">
                    <a href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{f.lat.toFixed(4)}, {f.lng.toFixed(4)}</a>
                    <div className="text-xs text-gray-500 max-w-[260px] truncate">{f.direccion}</div>
                  </td>
                  <td className="p-2">{f.foto_url ? <a href={f.foto_url} target="_blank" rel="noreferrer"><img src={f.foto_url} className="w-14 h-14 object-cover rounded border" /></a> : '-'}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
