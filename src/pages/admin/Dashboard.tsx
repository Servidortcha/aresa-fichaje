import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Dashboard(){
  const [stats, setStats] = useState({ sucursales:0, fichajesHoy:0, empleados:0 })
  useEffect(()=>{
    (async()=>{
      const { count: cSuc } = await supabase.from('geocercas').select('*', { count:'exact', head:true })
      const today = new Date().toISOString().slice(0,10)
      const { count: cFich } = await supabase.from('fichajes').select('*', { count:'exact', head:true }).gte('created_at', today)
      const { count: cEmp } = await supabase.from('profiles').select('*', { count:'exact', head:true }).eq('rol','empleado')
      setStats({ sucursales: cSuc??0, fichajesHoy: cFich??0, empleados: cEmp??0 })
    })()
  },[])
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-2xl font-bold">Admin — Aresa Fichaje</h2>
        <p className="text-gray-500">Panel separado: sucursales y fichajes en páginas distintas.</p>
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div className="border rounded-xl p-4 bg-blue-50">
            <div className="text-sm text-gray-600">Sucursales / Frentes</div>
            <div className="text-3xl font-bold">{stats.sucursales}</div>
            <Link to="/admin/sucursales" className="text-sm text-blue-700 underline">Ver sucursales →</Link>
          </div>
          <div className="border rounded-xl p-4 bg-green-50">
            <div className="text-sm text-gray-600">Fichajes hoy</div>
            <div className="text-3xl font-bold">{stats.fichajesHoy}</div>
            <Link to="/admin/fichajes" className="text-sm text-green-700 underline">Ver fichajes →</Link>
          </div>
          <div className="border rounded-xl p-4 bg-amber-50">
            <div className="text-sm text-gray-600">Empleados</div>
            <div className="text-3xl font-bold">{stats.empleados}</div>
            <Link to="/admin/sucursales/nueva" className="text-sm text-amber-700 underline">+ Nueva sucursal</Link>
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/admin/sucursales/nueva" className="bg-red-600 text-white p-6 rounded-xl shadow text-center font-bold text-lg">+ Crear nueva sucursal<br/><span className="text-sm font-normal">DMS: 32°14'39.7"S 63°59'07.4"W · click en mapa · radio variable</span></Link>
        <Link to="/admin/fichajes" className="bg-gray-900 text-white p-6 rounded-xl shadow text-center font-bold text-lg">Ver registro de fichajes<br/><span className="text-sm font-normal">Tabla + mapa + filtros + Excel</span></Link>
      </div>
    </div>
  )
}
