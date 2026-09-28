import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('aresa_remember_email') ?? '')
  const [pass, setPass] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [nombre, setNombre] = useState('')
  const [remember, setRemember] = useState(() => localStorage.getItem('aresa_remember') === '1')
  const [msg, setMsg] = useState<string | null>(null)
  const nav = useNavigate()
  const { userId, loading } = useAuth()

  // si ya hay sesión, no mostrar login (cuenta recordada)
  useEffect(()=>{ if(!loading && userId) nav('/', { replace:true }) },[userId, loading, nav])
  // al cambiar remember, persistir flag
  useEffect(()=>{ localStorage.setItem('aresa_remember', remember ? '1' : '0'); if(!remember) localStorage.removeItem('aresa_remember_email') },[remember])
  useEffect(()=>{ if(email && remember) localStorage.setItem('aresa_remember_email', email) },[email, remember])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (mode === 'register') {
      // El trigger handle_new_user crea el profile automáticamente (security definer)
      // No insertar manualmente para evitar race con RLS; pasamos nombre por user_metadata
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: { data: { nombre: nombre.trim() } }
      })
      if (error) return setMsg(error.message)
      if (data.user) {
        // Si confirm email está activo, Supabase exige verificar email; si no, ya hay sesión
        if (data.session) nav('/')
        else setMsg('¡Bienvenido a Aresa! Cuenta creada — revisa tu email para confirmar y luego entra. Tu jornada queda segura con foto y GPS.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (error) return setMsg(error.message)
      if(remember) localStorage.setItem('aresa_remember_email', email.trim())
      else localStorage.removeItem('aresa_remember_email')
      localStorage.setItem('aresa_last_active', Date.now().toString())
      nav('/')
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 relative">
      <div className="bg-gradient-to-br from-[#163A5F] to-[#2E6F9E] rounded-2xl p-6 text-white text-center shadow relative overflow-hidden">
        <div className="relative">
          <img src="/logo-horizontal.png" alt="Aresa" className="h-8 mx-auto bg-white rounded px-2 py-1" onError={(e)=>{ (e.target as HTMLImageElement).style.display='none'}} />
          <h1 className="text-2xl font-display font-bold mt-3">Aresa Fichaje</h1>
          <p className="text-white/80 text-sm">Hola de nuevo</p>
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow border border-line -mt-3 relative">
        <div className="flex gap-2 mb-4 p-1 bg-paper border border-line rounded-full">
          <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === 'login' ? 'bg-ink text-paper shadow' : 'text-ink/60'}`}>Entrar</button>
          <button onClick={() => setMode('register')} className={`flex-1 py-2 rounded-full text-sm font-medium ${mode === 'register' ? 'bg-ink text-paper shadow' : 'text-ink/60'}`}>Crear cuenta</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre completo" required className="w-full border rounded-xl px-3 py-3" />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required className="w-full border rounded-xl px-3 py-3" autoComplete="email" />
          <input value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" type="password" required className="w-full border rounded-xl px-3 py-3" autoComplete={mode==='login' ? 'current-password' : 'new-password'} />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} className="w-4 h-4 rounded border-line" />
            <span className="text-ink">Recordar cuenta en este dispositivo</span>
            {remember && email && <span className="ml-auto text-xs text-green-600">✓ se recordará</span>}
          </label>
          <button type="submit" className="w-full bg-ink hover:bg-black text-paper py-3 rounded-xl font-bold shadow">
            {mode === 'login' ? 'Entrar →' : 'Crear cuenta y empezar'}
          </button>
        </form>
        {msg && <p className="mt-4 text-sm p-3 bg-amber-50 border border-amber-200 rounded-xl">{msg}</p>}
      </div>
    </div>
  )
}
