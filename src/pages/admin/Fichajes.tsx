import { useEffect, useState } from 'react'
import { supabase, type Fichaje, type Geocerca } from '../../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import * as XLSX from 'xlsx'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function Fichajes(){
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [sucursales, setSucursales] = useState<Geocerca[]>([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEmpleado, setFiltroEmpleado] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroSucursal, setFiltroSucursal] = useState('')

  const load = async()=>{
    const { data } = await supabase.from('fichajes').select('*, profiles(nombre,email)').order('created_at',{ascending:false}).limit(300)
    setFichajes((data as any) ?? [])
    const { data:g } = await supabase.from('geocercas').select('*').order('nombre')
    setSucursales((g as any) ?? [])
  }
  useEffect(()=>{ load(); const ch=supabase.channel('fichajes-admin').on('postgres_changes',{event:'INSERT',schema:'public',table:'fichajes'},()=>load()).subscribe(); return()=>{supabase.removeChannel(ch)} },[])

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

  const exportExcel=()=>{
    const rows=filtrados.map(f=>{
      const suc=f.geocerca_id ? sucMap.get(f.geocerca_id) : null
      return { Fecha:new Date(f.created_at).toLocaleString(), Empleado:f.profiles?.nombre, Email:f.profiles?.email, Tipo:f.tipo, Sucursal:suc?.nombre ?? 'Fuera', Provincia:(suc as any)?.provincia ?? '', Lat:f.lat, Lng:f.lng, Direccion:f.direccion, Dentro:f.dentro_geocerca?'SI':'NO', Distancia_m:f.distancia_m, Foto:f.foto_url }
    })
    const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Fichajes'); XLSX.writeFile(wb, `Aresa_Fichajes_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const center:[number,number]=sucursales[0]?[sucursales[0].lat,sucursales[0].lng]:filtrados[0]?[filtrados[0].lat,filtrados[0].lng]:[-32.2426,-63.542]
  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl shadow flex flex-wrap gap-3 items-end">
        <h2 className="text-xl font-bold w-full">Registro de fichajes</h2>
        <input value={filtroEmpleado} onChange={e=>setFiltroEmpleado(e.target.value)} placeholder="Filtrar empleado" className="border rounded px-3 py-2" />
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} className="border rounded px-3 py-2">
          <option value="">Todos los tipos</option><option value="entrada">Entrada</option><option value="pausa_inicio">Pausa inicio</option><option value="pausa_fin">Pausa fin</option><option value="salida">Salida</option>
        </select>
        <select value={filtroSucursal} onChange={e=>setFiltroSucursal(e.target.value)} className="border rounded px-3 py-2 min-w-[180px]">
          <option value="">Todas las sucursales</option><option value="__sin__">Fuera de sucursal</option>
          {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <input type="date" value={filtroFecha} onChange={e=>setFiltroFecha(e.target.value)} className="border rounded px-3 py-2" />
        <button onClick={exportExcel} className="bg-green-600 text-white px-4 py-2 rounded">Exportar Excel</button>
        <span className="text-sm text-gray-500">{filtrados.length} registros</span>
      </div>

      <div className="bg-white p-4 rounded-xl shadow">
        <div className="h-[420px] rounded overflow-hidden border">
          <MapContainer center={center} zoom={sucursales.length?6:5} style={{height:'100%',width:'100%'}}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {sucursales.map(s=> <Circle key={s.id} center={[s.lat,s.lng]} radius={s.radio_m} pathOptions={{ color:'#9ca3af', fillOpacity:0.1 }}><Popup>{s.nombre} · {s.radio_m} m</Popup></Circle>)}
            {filtrados.map(f=> <Marker key={f.id} position={[f.lat,f.lng]}><Popup><b>{f.profiles?.nombre}</b> - {f.tipo}<br/>{new Date(f.created_at).toLocaleString()}<br/>{f.direccion}<br/>{f.dentro_geocerca?'✓ Dentro':`⚠ Fuera (${f.distancia_m} m)`}<br/><a href={f.foto_url??'#'} target="_blank" rel="noreferrer">Ver foto</a></Popup></Marker>)}
          </MapContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-auto max-h-[700px]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Empleado</th><th className="p-2">Tipo</th><th className="p-2 text-left">Sucursal</th><th className="p-2">Ubicación</th><th className="p-2">Foto</th></tr></thead>
            <tbody>
              {filtrados.map(f=>{
                const suc=f.geocerca_id? sucMap.get(f.geocerca_id):null
                return <tr key={f.id} className="border-t hover:bg-gray-50"><td className="p-2 whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</td><td className="p-2"><div className="font-medium">{f.profiles?.nombre}</div><div className="text-xs text-gray-500">{f.profiles?.email}</div></td><td className="p-2 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${f.tipo==='entrada'?'bg-green-100 text-green-700':f.tipo==='salida'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-800'}`}>{f.tipo}</span></td><td className="p-2">{suc? <><b>{suc.nombre}</b><div className="text-xs text-gray-500">{f.dentro_geocerca?'✓ Dentro':`⚠ ${f.distancia_m}m fuera`}</div></>:<span className="text-red-600 font-bold">Fuera</span>}</td><td className="p-2"><a href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{f.lat.toFixed(4)}, {f.lng.toFixed(4)}</a><div className="text-xs text-gray-500 max-w-[260px] truncate">{f.direccion}</div></td><td className="p-2">{f.foto_url? <a href={f.foto_url} target="_blank" rel="noreferrer"><img src={f.foto_url} className="w-14 h-14 object-cover rounded border"/></a>:'-'}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
