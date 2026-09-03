import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export default function Usuarios(){
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [form, setForm] = useState({ nombre:'', email:'', password:'', rol:'empleado' as 'empleado'|'admin' })
  const [msg, setMsg] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)

  const load = async()=>{
    const { data } = await supabase.from('profiles').select('id,nombre,email,rol,created_at').order('created_at', {ascending:false}).limit(100)
    setUsuarios((data as any) ?? [])
  }
  useEffect(()=>{ load() },[])

  const crear = async(e:React.FormEvent)=>{
    e.preventDefault()
    if(!form.nombre.trim() || !form.email.trim() || form.password.length<6) return setMsg('Completa nombre, email y contraseña (mín 6)')
    setLoading(true); setMsg(null)
    try{
      // cliente temporal sin persistir sesión para no desloguear al admin
      const tmp = createClient(url, anon, { auth:{ persistSession:false, autoRefreshToken:false } })
      const { data, error } = await tmp.auth.signUp({ email: form.email.trim(), password: form.password, options:{ data:{ nombre: form.nombre.trim() } } })
      if(error) throw error
      if(!data.user) throw new Error('No se pudo crear usuario')
      // esperar trigger que crea profile como empleado
      await new Promise(r=>setTimeout(r,1200))
      // actualizar rol si es admin
      if(form.rol==='admin'){
        const { error:uerr } = await supabase.from('profiles').update({ rol:'admin', nombre: form.nombre.trim() }).eq('id', data.user.id)
        if(uerr) console.warn(uerr)
      } else {
        await supabase.from('profiles').update({ nombre: form.nombre.trim() }).eq('id', data.user.id)
      }
      // intentar auto-confirmar si hace falta: el admin puede confirmar desde Supabase Auth > Users > Confirm, o esperar email
      setMsg(`Usuario ${form.email} creado ✓ (id ${data.user.id.slice(0,8)}). Si requiere confirmación, confírmalo en Supabase > Authentication > Users > ${form.email} > Confirm email.`)
      setForm({ nombre:'', email:'', password:'', rol:'empleado' })
      load()
    }catch(e:any){
      setMsg('Error: '+e.message+' — Si es “rate limit”, crea desde Supabase Dashboard > Add user (bypass).')
    }finally{ setLoading(false) }
  }

  const cambiarRol = async(id:string, rol:string)=>{
    const { error } = await supabase.from('profiles').update({ rol }).eq('id', id)
    if(error) alert(error.message); else load()
  }

  const borrar = async(id:string)=>{
    if(!confirm('¿Borrar perfil? No borra el auth user. Hazlo también en Supabase Auth si quieres eliminarlo completo.')) return
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if(error) alert(error.message); else load()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl shadow">
        <h2 className="text-xl font-bold">Usuarios — Crear empleado/operador</h2>
        <p className="text-sm text-gray-500">El admin crea usuarios desde acá. Se usa signUp temporal sin desloguearte. Si hay rate limit, usa Supabase Dashboard → Add user.</p>
        <form onSubmit={crear} className="grid md:grid-cols-2 gap-3 mt-4">
          <input value={form.nombre} onChange={e=>setForm({...form, nombre:e.target.value})} placeholder="Nombre completo" className="border rounded px-3 py-2" required />
          <input value={form.email} onChange={e=>setForm({...form, email:e.target.value})} placeholder="Email" type="email" className="border rounded px-3 py-2" required />
          <input value={form.password} onChange={e=>setForm({...form, password:e.target.value})} placeholder="Contraseña (mín 6)" type="password" className="border rounded px-3 py-2" required />
          <select value={form.rol} onChange={e=>setForm({...form, rol:e.target.value as any})} className="border rounded px-3 py-2">
            <option value="empleado">empleado / operador</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" disabled={loading} className="md:col-span-2 bg-ink text-paper py-2 rounded font-bold disabled:opacity-50">{loading?'Creando...':'Crear usuario'}</button>
        </form>
        {msg && <div className="mt-3 p-3 rounded border text-sm bg-blue-50">{msg}</div>}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded p-3 text-xs">
          <b>¿Cómo crear más usuarios?</b><br/>
          1) <b>Desde acá</b> (admin): completa el form arriba y crea.<br/>
          2) <b>Supabase Dashboard</b> → Authentication → Users → Add user → marca <b>Auto Confirm</b> (bypass rate limit).<br/>
          3) <b>Auto-registro</b>: el empleado entra a /login → Registrarse (requiere confirmar email si está activo).
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="p-3 border-b font-bold">Usuarios registrados ({usuarios.length})</div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0"><tr><th className="p-2 text-left">Nombre</th><th className="p-2 text-left">Email</th><th className="p-2">Rol</th><th className="p-2">Acciones</th></tr></thead>
            <tbody>
              {usuarios.map(u=>(
                <tr key={u.id} className="border-t">
                  <td className="p-2">{u.nombre}<div className="text-xs text-gray-500">{u.id.slice(0,8)}</div></td>
                  <td className="p-2 text-xs">{u.email}</td>
                  <td className="p-2 text-center">
                    <select value={u.rol} onChange={e=>cambiarRol(u.id, e.target.value)} className="border rounded px-2 py-1 text-xs">
                      <option value="empleado">empleado</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="p-2 flex gap-1 justify-center">
                    <button onClick={()=>navigator.clipboard.writeText(u.email)} className="px-2 py-1 border rounded text-xs">Copiar email</button>
                    <button onClick={()=>borrar(u.id)} className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-xs">Borrar perfil</button>
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
