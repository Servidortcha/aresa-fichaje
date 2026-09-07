import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

import { generarPdfUsuario } from '../../lib/pdfUsuario'

export default function Usuarios(){
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [form, setForm] = useState({ nombre:'', email:'', password:'', rol:'empleado' as 'empleado'|'admin' })
  const [msg, setMsg] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const [lastCreated, setLastCreated] = useState<{ email:string, password:string, nombre:string } | null>(null)
  const [pdfModal, setPdfModal] = useState<{ open:boolean, user:any | null }>({ open:false, user:null })
  const [pdfPass, setPdfPass] = useState('')
  const [showPdfPass, setShowPdfPass] = useState(false)

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
      setLastCreated({ email: form.email.trim(), password: form.password, nombre: form.nombre.trim() })
      // auto PDF con contraseña para entregar
      try{ await generarPdfUsuario({ nombre: form.nombre.trim(), email: form.email.trim(), rol: form.rol, id: data.user.id, created_at: new Date().toISOString(), password: form.password }) } catch(e){ console.warn(e) }
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
        {lastCreated && <div className="mt-3 p-3 rounded border text-sm bg-green-50 flex justify-between items-center"><span>PDF listo para <b>{lastCreated.nombre}</b> — incluye contraseña para entregar</span><button onClick={()=>generarPdfUsuario({ nombre:lastCreated.nombre, email:lastCreated.email, rol: form.rol, id:'pendiente', created_at:new Date().toISOString(), password:lastCreated.password })} className="px-3 py-1 bg-green-600 text-white rounded text-xs">Descargar PDF de nuevo</button></div>}
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
                  <td className="p-2 flex gap-1 justify-center flex-wrap">
                    <button onClick={()=>navigator.clipboard.writeText(u.email)} className="px-2 py-1 border rounded text-xs">Copiar email</button>
                    <button onClick={()=>{ setPdfModal({ open:true, user:u }); setPdfPass(''); setShowPdfPass(false) }} className="px-2 py-1 bg-ink text-paper rounded text-xs">PDF entrega</button>
                    <button onClick={()=>borrar(u.id)} className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-xs">Borrar perfil</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pdfModal.open && pdfModal.user && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-[9999] p-4" onClick={()=>setPdfModal({ open:false, user:null })}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display font-bold text-lg text-ink">PDF Entrega — {pdfModal.user.nombre}</h3>
                <p className="text-xs text-gray-500">{pdfModal.user.email} · {pdfModal.user.rol} · legajo {pdfModal.user.id.slice(0,8)}</p>
              </div>
              <button onClick={()=>setPdfModal({ open:false, user:null })} className="w-8 h-8 grid place-items-center rounded-full border hover:bg-gray-50">✕</button>
            </div>

            <div className="bg-paper border border-line rounded-xl p-4 space-y-3">
              <label className="block text-sm font-medium text-ink">Contraseña a incluir en el PDF</label>
              <div className="relative">
                <input value={pdfPass} onChange={e=>setPdfPass(e.target.value)} type={showPdfPass ? 'text' : 'password'} placeholder="Deja vacío para PDF sin contraseña" className="w-full border rounded-xl px-3 py-3 pr-12" />
                <button type="button" onClick={()=>setShowPdfPass(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-full hover:bg-gray-100 text-sm">{showPdfPass ? '🙈' : '👁'}</button>
              </div>
              <p className="text-xs text-gray-600">Si es un usuario existente y no la recordás, escribí una <b>NUEVA</b> (ej: <code className="bg-white border px-1 rounded">Aresa2026!</code>) y luego actualizala en <code className="bg-white border px-1 rounded">Supabase Dashboard &gt; Auth &gt; Users &gt; {pdfModal.user.email} &gt; Reset password</code>. El PDF la mostrará con recuadro verde.</p>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 bg-green-600 text-white rounded-full">Con contraseña: visible</span>
                <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full">Vacío: instrucciones de recupero</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={async()=>{
                await generarPdfUsuario({ nombre:pdfModal.user.nombre, email:pdfModal.user.email, rol:pdfModal.user.rol, id:pdfModal.user.id, created_at:pdfModal.user.created_at, password: pdfPass.trim() || undefined })
                setPdfModal({ open:false, user:null })
              }} className="flex-1 bg-ink text-paper py-3 rounded-xl font-bold shadow hover:bg-black">Generar PDF</button>
              <button onClick={()=>setPdfModal({ open:false, user:null })} className="flex-1 border border-line py-3 rounded-xl font-medium">Cancelar</button>
            </div>
            <p className="text-xs text-center text-gray-400">Se descarga como <code className="bg-gray-100 px-1 rounded">Aresa_{pdfModal.user.nombre.replace(/\s+/g,'_')}.pdf</code></p>
          </div>
        </div>
      )}
    </div>
  )
}
